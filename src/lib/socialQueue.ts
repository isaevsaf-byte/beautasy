import { createImageUrlBuilder } from "@sanity/image-url";
import { sanityWriteClient, sanityConfig } from "@/lib/sanity";
import {
  buildCaptionOptions,
  buildHashtags,
  generateCaptionsWithClaude,
  type CaptionSource,
} from "@/lib/socialCaptions";
import { publishToInstagram, instagramConfigured } from "@/lib/instagram";

/**
 * The queue between "a product exists" and "a post went out".
 *
 * Two jobs live here. `draftPostsForNewProducts` writes suggestions for
 * anything that hasn't been posted about yet, and `publishDuePosts` sends out
 * what Kristina has approved and what is due. They are deliberately separate:
 * drafting is safe to run often, publishing puts words in public.
 *
 * Both read through `sanityWriteClient` rather than the cached client — the
 * CDN serves a stale `status`, which is exactly how a post would go out twice.
 */

/**
 * Pictures for Instagram are built without `auto=format`. The shop's `urlFor`
 * adds it so browsers get WebP, but it lets the CDN answer WebP to any fetcher
 * that says it can take it — and Instagram's Content Publishing API accepts
 * JPEG only. Pinning the format is one line; discovering it would have been a
 * "Failed" post on the first morning the pipeline ran for real.
 */
const instagramImages = createImageUrlBuilder(sanityConfig);

interface ProductForPost {
  _id: string;
  name: string;
  slug?: string;
  price?: number;
  category?: string;
  subcategory?: string;
  color?: string;
  productionTime?: string;
  madeToMeasureAvailable?: boolean;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  image?: any;
}

/** Products with no social post yet, newest first. */
const UNPOSTED_PRODUCTS = `*[
  _type == "product"
  && !(_id in path("drafts.**"))
  && defined(images)
  && count(*[_type == "socialPost" && product._ref == ^._id]) == 0
] | order(_createdAt desc)[0...$limit]{
  _id,
  name,
  "slug": slug.current,
  price,
  category,
  subcategory,
  color,
  productionTime,
  madeToMeasureAvailable,
  "description": pt::text(description),
  "image": images[0]
}`;

export interface DraftResult {
  created: number;
  writtenBy: "claude" | "templates" | "mixed";
  skipped?: string;
}

/**
 * Writes draft posts for products nobody has posted about.
 *
 * Everything lands as `status: "draft"` — the pipeline never publishes what it
 * wrote itself.
 */
export async function draftPostsForNewProducts(limit = 3): Promise<DraftResult> {
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return { created: 0, writtenBy: "templates", skipped: "No Sanity write token" };
  }

  const products = await sanityWriteClient.fetch<ProductForPost[]>(UNPOSTED_PRODUCTS, { limit });
  if (products.length === 0) return { created: 0, writtenBy: "templates" };

  let usedClaude = 0;
  let created = 0;

  for (const product of products) {
    const source: CaptionSource = {
      name: product.name,
      category: product.category,
      subcategory: product.subcategory,
      price: product.price,
      color: product.color,
      description: product.description?.slice(0, 600),
      madeToMeasureAvailable: product.madeToMeasureAvailable,
      productionTime: product.productionTime,
      slug: product.slug,
    };

    const written = await generateCaptionsWithClaude(source);
    if (written) usedClaude++;
    const options = written ?? buildCaptionOptions(source);

    try {
      await sanityWriteClient.create({
        _type: "socialPost",
        image: product.image,
        caption: options[0],
        captionOptions: options,
        hashtags: buildHashtags(source),
        kind: "product",
        product: { _type: "reference", _ref: product._id },
        status: "draft",
        source: "auto",
        createdAt: new Date().toISOString(),
      });
      created++;
    } catch (error) {
      console.error(`Could not draft a post for ${product.name}:`, error);
    }
  }

  return {
    created,
    writtenBy: usedClaude === 0 ? "templates" : usedClaude === created ? "claude" : "mixed",
  };
}

interface DuePost {
  _id: string;
  /** Sanity's revision id, used to claim the post without racing anyone. */
  _rev: string;
  caption: string;
  hashtags?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  image?: any;
}

/**
 * Approved, not yet published, and either due now or carrying no date at all.
 * `scheduledFor` being empty means "next run" — the simplest thing a person
 * can mean by leaving a field blank.
 */
const DUE_POSTS = `*[
  _type == "socialPost"
  && !(_id in path("drafts.**"))
  && status == "approved"
  && !defined(publishedAt)
  && (!defined(scheduledFor) || scheduledFor <= $now)
] | order(coalesce(scheduledFor, createdAt) asc)[0...$limit]{
  _id, _rev, caption, hashtags, image
}`;

const ONE_POST = `*[_type == "socialPost" && !(_id in path("drafts.**")) && _id == $id && status == "approved" && !defined(publishedAt)][0]{
  _id, _rev, caption, hashtags, image
}`;

export interface PublishSummary {
  published: number;
  failed: number;
  /** Posts another run had already claimed. Not failures — nothing went wrong. */
  alreadyRunning?: number;
  skipped?: string;
  posts: {
    id: string;
    ok: boolean;
    permalink?: string;
    error?: string;
    skipped?: boolean;
  }[];
}

/**
 * Takes the post for this run, so that nobody else can take it too.
 *
 * `ifRevisionId` is the whole trick: Sanity accepts the patch only if nothing
 * has touched the document since we read it, so when two runs reach for the
 * same post exactly one wins and the other is turned away. Without it the
 * document goes on reading as approved-and-due for as long as Instagram takes
 * to answer, and everyone who looks in that window sends the same picture —
 * the morning cron, either GitHub schedule, the Studio button, or a stranger,
 * since /api/social/publish carries no secret on purpose.
 *
 * A duplicate here is public and cannot be taken back, which is why the claim
 * comes before the posting rather than after it.
 */
async function claim(post: DuePost): Promise<boolean> {
  try {
    await sanityWriteClient
      .patch(post._id)
      .ifRevisionId(post._rev)
      .set({ status: "publishing" })
      .commit();
    return true;
  } catch {
    // Losing the race is the expected outcome here, not an error worth
    // reporting: somebody else is already sending this one. Anything else that
    // stopped us writing would have stopped us publishing anyway.
    return false;
  }
}

/**
 * Writes down what happened, with a couple of retries.
 *
 * This is the write that must not be lost. By the time it runs the picture is
 * already public, and a post left sitting on `publishing` is one Kristina has
 * to sort out by hand — so it is worth trying more than once before giving up.
 */
async function record(
  id: string,
  fields: Record<string, unknown>,
  clear: string[] = []
): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const patch = sanityWriteClient.patch(id).set(fields);
      await (clear.length ? patch.unset(clear) : patch).commit();
      return true;
    } catch (error) {
      if (attempt === 3) {
        console.error(`Could not record the outcome for ${id}:`, error);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  return false;
}

async function publishOne(post: DuePost) {
  const caption = post.hashtags ? `${post.caption}\n\n${post.hashtags}` : post.caption;

  let imageUrl: string;
  try {
    imageUrl = instagramImages
      .image(post.image)
      .width(1080)
      .height(1350)
      .fit("crop")
      .format("jpg")
      .url();
  } catch {
    return { id: post._id, ok: false, error: "The post has no usable picture" };
  }

  if (!(await claim(post))) {
    return {
      id: post._id,
      ok: false,
      skipped: true,
      error: "Another run is already sending this one",
    };
  }

  const result = await publishToInstagram(imageUrl, caption);

  const recorded = result.ok
    ? await record(
        post._id,
        {
          status: "published",
          publishedAt: new Date().toISOString(),
          permalink: result.permalink,
        },
        // A note from an earlier failed attempt would otherwise sit there
        // contradicting the success.
        ["lastError"]
      )
    : await record(post._id, {
        status: "failed",
        lastError: result.error ?? "Unknown error",
      });

  return {
    id: post._id,
    ok: result.ok,
    permalink: result.permalink,
    error:
      result.ok && !recorded
        ? "Posted, but saving the status failed — it is still showing as Publishing"
        : result.error,
  };
}

/** Sends out everything approved and due. */
export async function publishDuePosts(limit = 5): Promise<PublishSummary> {
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return { published: 0, failed: 0, skipped: "No Sanity write token", posts: [] };
  }
  if (!instagramConfigured()) {
    return { published: 0, failed: 0, skipped: "Instagram is not connected", posts: [] };
  }

  const due = await sanityWriteClient.fetch<DuePost[]>(DUE_POSTS, {
    now: new Date().toISOString(),
    limit,
  });

  const posts = [];
  for (const post of due) {
    posts.push(await publishOne(post));
  }

  return {
    published: posts.filter((p) => p.ok).length,
    // A post someone else is already sending is not a failure, and counting it
    // as one would make a healthy run look broken in the logs.
    failed: posts.filter((p) => !p.ok && !p.skipped).length,
    alreadyRunning: posts.filter((p) => p.skipped).length || undefined,
    posts,
  };
}

/** Sends one specific approved post, for the "Post this now" button in the Studio. */
export async function publishPostById(id: string): Promise<PublishSummary> {
  if (!instagramConfigured()) {
    return { published: 0, failed: 0, skipped: "Instagram is not connected", posts: [] };
  }

  const post = await sanityWriteClient.fetch<DuePost | null>(ONE_POST, { id });
  if (!post) {
    return {
      published: 0,
      failed: 0,
      skipped: "That post is not approved, or has already gone out",
      posts: [],
    };
  }

  const result = await publishOne(post);
  return {
    published: result.ok ? 1 : 0,
    failed: result.ok || result.skipped ? 0 : 1,
    alreadyRunning: result.skipped ? 1 : undefined,
    posts: [result],
  };
}
