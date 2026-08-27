import { sanityWriteClient, urlFor } from "@/lib/sanity";
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
  _id, caption, hashtags, image
}`;

const ONE_POST = `*[_type == "socialPost" && !(_id in path("drafts.**")) && _id == $id && status == "approved" && !defined(publishedAt)][0]{
  _id, caption, hashtags, image
}`;

export interface PublishSummary {
  published: number;
  failed: number;
  skipped?: string;
  posts: { id: string; ok: boolean; permalink?: string; error?: string }[];
}

async function publishOne(post: DuePost) {
  const caption = post.hashtags ? `${post.caption}\n\n${post.hashtags}` : post.caption;

  let imageUrl: string;
  try {
    imageUrl = urlFor(post.image).width(1080).height(1350).fit("crop").url();
  } catch {
    return { id: post._id, ok: false, error: "The post has no usable picture" };
  }

  const result = await publishToInstagram(imageUrl, caption);

  // Recording the outcome is what stops a retry loop from posting twice.
  try {
    await sanityWriteClient
      .patch(post._id)
      .set(
        result.ok
          ? {
              status: "published",
              publishedAt: new Date().toISOString(),
              permalink: result.permalink,
              lastError: undefined,
            }
          : { status: "failed", lastError: result.error ?? "Unknown error" }
      )
      .commit();
  } catch (error) {
    console.error(`Published ${post._id} but could not record it:`, error);
  }

  return { id: post._id, ok: result.ok, permalink: result.permalink, error: result.error };
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
    failed: posts.filter((p) => !p.ok).length,
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
    failed: result.ok ? 0 : 1,
    posts: [result],
  };
}
