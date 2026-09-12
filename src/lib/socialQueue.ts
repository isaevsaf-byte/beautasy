import { createImageUrlBuilder } from "@sanity/image-url";
import { sanityWriteClient, sanityConfig } from "@/lib/sanity";
import {
  buildCaptionOptions,
  buildHashtags,
  generateCaptionsWithClaude,
  type CaptionSource,
} from "@/lib/socialCaptions";
import { publishToInstagram, startReel, finishReel, instagramConfigured } from "@/lib/instagram";
import { createPin, pinTextFrom, pinterestConfigured } from "@/lib/pinterest";
import { SITE_URL } from "@/lib/site";

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
  /** How many times this piece has been posted about — decides the angle */
  timesPosted?: number;
  lastPostAt?: string;
  madeToMeasureAvailable?: boolean;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  image?: any;
}

/** Products with no social post yet, newest first. */
/** A piece is not shown again for this long. Long enough not to nag, short
 *  enough that sixteen products still fill a year. */
const COOLDOWN_DAYS = 45;

/** How many drafts should be waiting for Kristina. More than this and the
 *  Studio becomes a chore instead of a two-minute job. */
const TARGET_BACKLOG = 10;

/**
 * The piece it has been longest since we talked about.
 *
 * The first version of this asked for products with no post at all, which
 * emptied the moment every product had one — sixteen posts and then silence,
 * permanently, with nothing in the logs to say why. A shop does not run out of
 * things to say about what it makes; it just needs to come round again.
 *
 * So: order by when each product was last posted, oldest first, and skip
 * anything shown inside the cooldown. `timesPosted` comes back too, because it
 * decides which of the five angles is used — the second time these knickers
 * come round they are not described the same way.
 */
const NEXT_TO_POST = `*[
  _type == "product"
  && !(_id in path("drafts.**"))
  && defined(images)
]{
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
  "image": images[0],
  "timesPosted": count(*[_type == "socialPost" && product._ref == ^._id]),
  "lastPostAt": *[_type == "socialPost" && product._ref == ^._id] | order(createdAt desc)[0].createdAt
}[!defined(lastPostAt) || lastPostAt < $notSince]
 | order(coalesce(lastPostAt, "") asc)[0...$limit]`;

/** How many drafts are already waiting to be looked at. */
const WAITING = `count(*[_type == "socialPost" && !(_id in path("drafts.**")) && status == "draft"])`;

/**
 * What each of the five angles actually is, in the Studio's own words. The
 * order matches buildCaptionOptions, so a post about the making of something
 * is filed as process rather than as another product shot.
 */
const ANGLE_KIND = ["process", "product", "education", "product", "seasonal"] as const;

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

  // Top up to a backlog rather than draft on every run. Left unchecked this
  // writes three posts a day forever and buries the one job Kristina has here.
  const waiting = await sanityWriteClient.fetch<number>(WAITING);
  const room = Math.min(limit, TARGET_BACKLOG - waiting);
  if (room <= 0) {
    return { created: 0, writtenBy: "templates", skipped: `${waiting} drafts already waiting` };
  }

  const notSince = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const products = await sanityWriteClient.fetch<ProductForPost[]>(NEXT_TO_POST, {
    limit: room,
    notSince,
  });
  if (products.length === 0) {
    return { created: 0, writtenBy: "templates", skipped: "everything was posted recently" };
  }

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

    // Five angles exist and only the first was ever used, which is why twelve
    // posts read as one post twelve times. Coming round again on a different
    // angle is what makes a repeat worth reading.
    const turn = (product.timesPosted ?? 0) % options.length;

    try {
      await sanityWriteClient.create({
        _type: "socialPost",
        image: product.image,
        caption: options[turn],
        // The chosen one first, so the Studio suggests the others as
        // alternatives rather than repeating what is already in the box.
        captionOptions: [...options.slice(turn), ...options.slice(0, turn)],
        hashtags: buildHashtags(source),
        kind: ANGLE_KIND[turn] ?? "product",
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
  format?: "photo" | "reel";
  pinToPinterest?: boolean;
  /** The product page a Pin points at — the whole reason Pinterest is worth doing */
  productSlug?: string;
  productName?: string;
  productCategory?: string;
  /** Sanity's own CDN url for the uploaded file — public, which is what Instagram needs */
  videoUrl?: string;
  /** An upload Instagram was still transcoding when the last run ended */
  igCreationId?: string;
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
  _id, _rev, caption, hashtags, image, format, pinToPinterest,
  "videoUrl": video.asset->url,
  "productSlug": product->slug.current,
  "productName": product->name,
  "productCategory": product->category,
  igCreationId
}`;

const ONE_POST = `*[_type == "socialPost" && !(_id in path("drafts.**")) && _id == $id && status == "approved" && !defined(publishedAt)][0]{
  _id, _rev, caption, hashtags, image, format, pinToPinterest,
  "videoUrl": video.asset->url,
  "productSlug": product->slug.current,
  "productName": product->name,
  "productCategory": product->category,
  igCreationId
}`;

/**
 * Reels caught mid-transcode.
 *
 * A video left on "publishing" with a container id is not stuck — it is
 * waiting on Instagram, and the only thing to do is ask again. Without this
 * query every Reel would have to be finished by hand, because a post on
 * "publishing" belongs to no other list.
 */
const RESUMABLE = `*[
  _type == "socialPost"
  && !(_id in path("drafts.**"))
  && status == "publishing"
  && defined(igCreationId)
  && !defined(publishedAt)
] | order(createdAt asc)[0...$limit]{
  _id, _rev, igCreationId, caption, hashtags, image, pinToPinterest,
  "productSlug": product->slug.current,
  "productName": product->name,
  "productCategory": product->category
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
  const isReel = post.format === "reel";

  if (isReel && !post.videoUrl) {
    return { id: post._id, ok: false, error: "This Reel has no video uploaded" };
  }

  let imageUrl: string;
  try {
    imageUrl = instagramImages
      .image(post.image)
      // A Reel is upright and its cover has to match, or Instagram crops the
      // middle out of a picture that was chosen for its edges.
      .width(1080)
      .height(isReel ? 1920 : 1350)
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

  if (isReel) return await publishReel(post, caption, imageUrl);

  const result = await publishToInstagram(imageUrl, caption);

  const recorded = result.ok
    ? await record(
        post._id,
        {
          status: "published",
          publishedAt: new Date().toISOString(),
          permalink: result.permalink,
          ...(await pinIfWanted(post)),
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

/**
 * Pins the post, after Instagram has it.
 *
 * Second in every sense: it runs only once the Instagram post is public, it
 * cannot fail the post, and what it writes is a separate pair of fields. A
 * shop that pinned but did not post would be the wrong way round — the Pin is
 * the long tail, the post is the moment.
 *
 * Called exactly where a post becomes "published", which happens once per
 * document, so a resumed Reel cannot pin twice.
 */
async function pinIfWanted(post: DuePost): Promise<Record<string, unknown>> {
  if (post.pinToPinterest === false || !pinterestConfigured()) return {};

  try {
    const { title, description } = pinTextFrom({
      productName: post.productName,
      caption: post.caption,
      category: post.productCategory,
    });

    // 2:3 is what Pinterest gives the most room to. The same picture cropped
    // for the feed would sit in the results as a small square.
    const imageUrl = instagramImages
      .image(post.image)
      .width(1000)
      .height(1500)
      .fit("crop")
      .format("jpg")
      .url();

    const pin = await createPin({
      imageUrl,
      title,
      description,
      link: post.productSlug ? `${SITE_URL}/shop/${post.productSlug}` : SITE_URL,
    });

    return pin.ok ? { pinUrl: pin.url } : { pinError: pin.error };
  } catch (error) {
    return { pinError: error instanceof Error ? error.message : "Could not pin" };
  }
}

/**
 * A Reel, which may not finish in this run.
 *
 * Instagram transcodes video before it will publish, and that often outlasts
 * the function. Rather than fail a post that is going perfectly well, the
 * container id is written down and the post is left on "publishing" — the
 * status it already uses for "on its way" — so the next run picks it up. The
 * claim taken before any of this is what stops two runs uploading the same
 * film twice.
 */
async function publishReel(post: DuePost, caption: string, coverUrl: string) {
  const started = await startReel(post.videoUrl!, caption, coverUrl);

  if (!started.ok || !started.creationId) {
    await record(post._id, { status: "failed", lastError: started.error ?? "Unknown error" });
    return { id: post._id, ok: false, error: started.error };
  }

  // Written before publishing, so a crash between the two leaves something to
  // resume rather than an upload nobody can find again.
  await record(post._id, { igCreationId: started.creationId });

  const result = await finishReel(started.creationId);

  if (!result.ok && result.error === "still-processing") {
    return {
      id: post._id,
      ok: false,
      skipped: true,
      error: "Instagram is still preparing the video — the next run will finish it",
    };
  }

  const recorded = result.ok
    ? await record(
        post._id,
        {
          status: "published",
          publishedAt: new Date().toISOString(),
          permalink: result.permalink,
          ...(await pinIfWanted(post)),
        },
        ["lastError", "igCreationId"]
      )
    : await record(post._id, { status: "failed", lastError: result.error ?? "Unknown error" }, [
        "igCreationId",
      ]);

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

/** Finishes Reels that Instagram was still transcoding when a run ended. */
async function resumeReels(limit: number): Promise<PublishSummary["posts"]> {
  const waiting = await sanityWriteClient.fetch<(DuePost & { igCreationId: string })[]>(
    RESUMABLE,
    { limit }
  );

  const done: PublishSummary["posts"] = [];
  for (const post of waiting) {
    const result = await finishReel(post.igCreationId);

    if (!result.ok && result.error === "still-processing") continue;

    if (result.ok) {
      // A Reel finished on a later run is still a post going out for the
      // first time, so it earns its Pin exactly like any other.
      await record(
        post._id,
        {
          status: "published",
          publishedAt: new Date().toISOString(),
          permalink: result.permalink,
          ...(await pinIfWanted(post)),
        },
        ["lastError", "igCreationId"]
      );
    } else {
      await record(post._id, { status: "failed", lastError: result.error ?? "Unknown error" }, [
        "igCreationId",
      ]);
    }
    done.push({ id: post._id, ok: result.ok, permalink: result.permalink, error: result.error });
  }
  return done;
}

/**
 * One post a day, however many are due.
 *
 * The account has a few dozen followers. Approving a backlog of fifteen used
 * to mean fifteen posts within a day and a half — which reads as spam, and
 * Instagram shows each of them to fewer people for it. Scheduled dates help,
 * but a date set two weeks ago and approved today is already overdue, and so
 * is every one after it. So the rhythm is enforced here rather than trusted
 * to the calendar.
 *
 * Twenty hours rather than twenty-four, so a post that went out at 19:00 does
 * not block the next evening's 19:00 run by a few minutes. The Studio's
 * "Post this now" button goes round this on purpose: that is Kristina asking.
 */
const PACE_HOURS = 20;
const PUBLISHED_RECENTLY = `count(*[
  _type == "socialPost"
  && !(_id in path("drafts.**"))
  && defined(publishedAt)
  && publishedAt > $since
])`;

/** Sends out everything approved and due. */
export async function publishDuePosts(limit = 5): Promise<PublishSummary> {
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return { published: 0, failed: 0, skipped: "No Sanity write token", posts: [] };
  }
  if (!instagramConfigured()) {
    return { published: 0, failed: 0, skipped: "Instagram is not connected", posts: [] };
  }

  // Finishing comes before starting: a Reel already uploaded is closer to
  // being published than anything still in the queue, and leaving it for later
  // is how a video sits on "publishing" for a day.
  const posts: PublishSummary["posts"] = await resumeReels(limit);

  const since = new Date(Date.now() - PACE_HOURS * 60 * 60 * 1000).toISOString();
  const recent = await sanityWriteClient.fetch<number>(PUBLISHED_RECENTLY, { since });
  // Reels finished just now count too: they went out today.
  const allowance = Math.max(0, 1 - recent - posts.filter((p) => p.ok).length);

  const due =
    allowance === 0
      ? []
      : await sanityWriteClient.fetch<DuePost[]>(DUE_POSTS, {
          now: new Date().toISOString(),
          limit: Math.min(limit, allowance),
        });

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
