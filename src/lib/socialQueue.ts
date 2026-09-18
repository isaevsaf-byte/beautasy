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
import { SITE_SETTINGS } from "@/lib/siteSettingsDocument";
import {
  mayPublish,
  postingSettingsFrom,
  startOfSouthamptonDay,
  type PostingHold,
} from "@/lib/postingRules";

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
]
// Dated posts first: a date is a promise about a day, and with one post a day
// an older undated approval would otherwise keep pushing it back.
| order(defined(scheduledFor) desc, coalesce(scheduledFor, createdAt) asc)[0...$limit]{
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
  /** Why nothing new was started this run, when that was a rule rather than an empty queue */
  held?: PostingHold;
  /** The rules this run applied, as read from Site Settings — for "why didn't it post?" */
  rules?: { postsPerDay: number; quietHours: string; publishedToday: number };
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
 * What the posting rules need to know, read in one query.
 *
 * The rules themselves live in @/lib/postingRules; this is only the data.
 * Read fresh through the write client, because a cached count of today's
 * posts is exactly how a second post would slip out.
 *
 * "In flight" is limited to posts touched in the last two hours. A post whose
 * run crashed after claiming it keeps the status "publishing" forever, and
 * without the limit that one stuck document would stop every post after it.
 *
 * Counting today is wider than "has a publishedAt". A run can die after
 * Instagram accepted the picture but before the date was written, and the
 * Studio tells Kristina to mark such a post Published by hand — publishedAt
 * is read-only, so it stays empty. Both still went out, so both count, timed
 * by when the document last changed.
 */
const POSTING_STATE = `{
  "settings": ${SITE_SETTINGS}.socialPosting,
  "publishedToday": count(*[
    _type == "socialPost"
    && !(_id in path("drafts.**"))
    && (defined(publishedAt) || status in ["publishing", "published"])
    && dateTime(coalesce(publishedAt, _updatedAt)) >= dateTime($dayStart)
  ]),
  "lastPublishedAt": *[
    _type == "socialPost"
    && !(_id in path("drafts.**"))
    && (defined(publishedAt) || status in ["publishing", "published"])
  ] | order(coalesce(publishedAt, _updatedAt) desc)[0]{ "at": coalesce(publishedAt, _updatedAt) }.at,
  "inFlight": count(*[
    _type == "socialPost"
    && !(_id in path("drafts.**"))
    && status == "publishing"
    && dateTime(_updatedAt) > dateTime($staleBefore)
  ])
}`;

const IN_FLIGHT_STALE_HOURS = 2;

/**
 * Where the publisher says it was here at all.
 *
 * One document under one id, patched on every run. The schedule wakes this
 * every fifteen minutes, so that is ninety-six writes a day into the same
 * place rather than ninety-six new documents.
 *
 * It exists because the watchman in siteHealth.ts used to work out whether the
 * publisher was alive from the only thing it could see — whether anything new
 * had reached the feed since yesterday morning. That is a guess from a side
 * effect, and it was wrong in both directions. Measured on the code before
 * this: publisher dead for forty-five days, Kristina posting by hand every day
 * with "Post this now", the feed moving every morning — forty-two approved
 * posts stranded, forty-five green mornings, not one email. And the other way,
 * a morning the watchman could not judge wiped out what it had gathered, so a
 * Meta that was busy every fifth morning was enough to keep it silent for ever.
 *
 * The publisher can simply be asked instead of inferred from, and it costs one
 * write.
 */
export const HEARTBEAT_ID = "publisherHeartbeat";

/** What a run did, in the one word the watchman reads back. */
export type PublisherOutcome = "published" | "held" | "skipped" | "nothing-due" | "failed";

export interface HeartbeatMark {
  outcome: PublisherOutcome;
  /** Which hold, which skip, which error — for the morning somebody looks */
  detail?: string;
  /** True only when this run actually put something on the feed */
  sent?: boolean;
  /** True when the posting rules let this run through — see `lastFreeAt` */
  free?: boolean;
}

/**
 * How long Sanity may take to accept the mark before the run stops waiting.
 *
 * This was the one call on the publishing path with no limit on it — the
 * client in sanity.ts has none of its own — and it is made after the post has
 * already gone out, so a Sanity that hangs cannot cost a post. What it can
 * cost is the run: /api/social/publish has sixty seconds before Vercel kills
 * it, and the Worker that knocks gives up at ninety, so a hanging mark turns a
 * run that has already done its job into a failed invocation in the Cloudflare
 * dashboard — noise pointing at the one place where nothing is wrong. Three
 * seconds is generous for a single-document patch that normally answers in a
 * fraction of one, and a mark nobody waited for is no worse than a mark that
 * was never written: the watchman reads a missing mark as "the schedule is not
 * knocking", and the next run fifteen minutes later puts that right.
 */
export const PULSE_WRITE_TIMEOUT_MS = 3000;

/**
 * Stop waiting for a write, and let it finish on its own if it ever does.
 *
 * `Promise.race` keeps a handler attached to `work`, so a rejection that
 * arrives after the deadline is still handled and never surfaces as an
 * unhandled rejection killing the process.
 *
 * Exported only so a test can watch it give up without the suite standing
 * still for as long as the constant says — which is the shape of test that
 * catches nothing and costs three seconds on every run.
 */
export function waitAtMost<T>(ms: number, work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Leave a mark that this run happened, and say what it did.
 *
 * Three dates, and the differences between them are the point. `at` is every
 * run, whatever came of it, so a publisher that is running but holding back by
 * the rules still says so. `lastSentAt` moves only when this run actually put
 * something on the feed, which is what tells "running and rightly quiet" from
 * "running and nothing ever comes out".
 *
 * `lastFreeAt` is the third, and it was bought with a measured false alarm.
 * Kristina's daily post by hand counts against the daily number — POSTING_STATE
 * counts everything that reached the feed today, not only what this code sent —
 * so at the Studio's own defaults, one post a day and quiet hours until eight,
 * a hand-written post at seven in the morning leaves every run of the rest of
 * that day rightly held. `lastSentAt` then sits still at a shop where nothing
 * whatever is wrong, and the watchman called it a publisher that had stopped
 * sending: twelve emails over forty-five days, half of them red, at a shop in
 * perfect health. So the run also writes down when the rules last let it
 * through. "It has been free to send and sent nothing" is a fault; "the rules
 * have held it the whole time" is the rules working, and the two are now told
 * apart by a date rather than by whichever of the ninety-six runs in a day the
 * watchman happened to read.
 *
 * This is written here rather than in the route on purpose, and the choice is
 * the whole reason the mark can be trusted. The same route serves the Studio's
 * "Post this now" button, which comes in with an id and goes through
 * `publishPostById` below — and a post Kristina sends herself is exactly what
 * used to hide a dead schedule. Nothing she does by hand reaches this line.
 *
 * A mark that cannot be written must never stop a post going out. Publishing
 * is the job; watching it happen is not, and the watchman has its own line for
 * a database that will not take a write.
 */
async function leaveAPulse(mark: HeartbeatMark): Promise<void> {
  try {
    const now = new Date().toISOString();
    await waitAtMost(
      PULSE_WRITE_TIMEOUT_MS,
      sanityWriteClient
        .transaction()
        .createIfNotExists({ _id: HEARTBEAT_ID, _type: "publisherHeartbeat" })
        .patch(HEARTBEAT_ID, (patch) =>
          patch.set({
            at: now,
            outcome: mark.outcome,
            detail: mark.detail ?? null,
            ...(mark.sent ? { lastSentAt: now } : {}),
            ...(mark.free ? { lastFreeAt: now } : {}),
          })
        )
        .commit()
    );
  } catch (error) {
    console.error("Could not record that the publisher ran:", error);
  }
}

/**
 * Exported so a test can hold the one judgement in here, rather than read it.
 *
 * Which word a run leaves behind is the whole of what the watchman can say
 * about a publisher that is running and producing nothing, and the words are
 * not interchangeable: a run whose posts Instagram refused and a run with an
 * empty queue leave exactly the same silent feed and mean opposite things.
 */
export function pulseOf(summary: PublishSummary): HeartbeatMark {
  // Whether the rules let this run through is a separate question from what
  // came of it, and it has to be asked separately: a run can be free to send
  // and still send nothing (an empty queue, an Instagram that refused), and a
  // run held by the rules is not evidence of anything at all. `held` is the
  // hold the rules returned and `skipped` is a run that never reached them —
  // no Instagram connection, so nothing was ever asked of the rules. Either
  // way this run had no chance to send, and it must not read as one that did.
  // It is spread into every answer below rather than only the ones it can be
  // true for, so that this line is the only place the question is decided: a
  // branch that quietly could not say "free" would be a second answer to it.
  const free = summary.held === undefined && summary.skipped === undefined;
  const wasFree = free ? { free: true as const } : {};

  // Published first, because a run that got something out is working whatever
  // else it also did. Then the reasons, in the order they can be acted on: a
  // post Instagram refused, a skip, a rule holding the run back, and last the
  // ordinary answer of a publisher with nothing to do. A run that failed has
  // to be distinguishable from one with an empty queue: they leave the same
  // empty feed and mean opposite things.
  if (summary.published > 0) return { outcome: "published", sent: true, ...wasFree };
  if (summary.failed > 0) {
    return { outcome: "failed", detail: `${summary.failed} post(s) failed`, ...wasFree };
  }
  if (summary.skipped) return { outcome: "skipped", detail: summary.skipped, ...wasFree };
  if (summary.held) return { outcome: "held", detail: summary.held, ...wasFree };
  return { outcome: "nothing-due", ...wasFree };
}

/** Sends out everything approved and due. */
export async function publishDuePosts(limit = 5): Promise<PublishSummary> {
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    // Nothing to write the mark with either. The watchman reports a missing
    // write token by name on its own line, so this needs no second voice.
    return { published: 0, failed: 0, skipped: "No Sanity write token", posts: [] };
  }
  let summary: PublishSummary;
  try {
    summary = await sendWhatIsDue(limit);
  } catch (error) {
    // A run that reached Sanity and threw is still a run that happened, and it
    // is a different breakage from a schedule that has stopped knocking. Say
    // which, then let the error out as before.
    await leaveAPulse({
      outcome: "failed",
      detail: error instanceof Error ? error.message : "the run failed",
    });
    throw error;
  }
  await leaveAPulse(pulseOf(summary));
  return summary;
}

async function sendWhatIsDue(limit: number): Promise<PublishSummary> {
  if (!instagramConfigured()) {
    return { published: 0, failed: 0, skipped: "Instagram is not connected", posts: [] };
  }

  // Finishing comes before starting: a Reel already uploaded is closer to
  // being published than anything still in the queue, and leaving it for later
  // is how a video sits on "publishing" for a day.
  const posts: PublishSummary["posts"] = await resumeReels(limit);

  // Asked after the Reels are finished, so one that went out a moment ago is
  // already counted against today and against the gap.
  const now = new Date();
  const state = await sanityWriteClient.fetch<{
    settings: Record<string, unknown> | null;
    publishedToday: number;
    lastPublishedAt: string | null;
    inFlight: number;
  }>(POSTING_STATE, {
    dayStart: startOfSouthamptonDay(now).toISOString(),
    staleBefore: new Date(now.getTime() - IN_FLIGHT_STALE_HOURS * 60 * 60 * 1000).toISOString(),
  });

  const settings = postingSettingsFrom(state.settings);
  const verdict = mayPublish({
    now,
    settings,
    publishedToday: state.publishedToday,
    lastPublishedAt: state.lastPublishedAt,
    inFlight: state.inFlight,
  });

  // One at a time. The gap between automatic posts is measured from the last
  // one, so a second in the same run would always be too soon anyway.
  const due = verdict.ok
    ? await sanityWriteClient.fetch<DuePost[]>(DUE_POSTS, { now: now.toISOString(), limit: 1 })
    : [];

  for (const post of due) {
    posts.push(await publishOne(post));
  }

  return {
    published: posts.filter((p) => p.ok).length,
    // A post someone else is already sending is not a failure, and counting it
    // as one would make a healthy run look broken in the logs.
    failed: posts.filter((p) => !p.ok && !p.skipped).length,
    alreadyRunning: posts.filter((p) => p.skipped).length || undefined,
    held: verdict.ok ? undefined : verdict.hold,
    rules: {
      postsPerDay: settings.postsPerDay,
      quietHours:
        settings.quietHoursEnabled && settings.quietFrom !== settings.quietUntil
          ? `${String(settings.quietFrom).padStart(2, "0")}:00–${String(settings.quietUntil).padStart(2, "0")}:00`
          : "off",
      publishedToday: state.publishedToday,
    },
    posts,
  };
}

/**
 * Sends one specific approved post, for the "Post this now" button in the Studio.
 *
 * Quiet hours and the daily limit do not apply here: pressing the button is
 * Kristina deciding, and the rules exist to stand in for her when she isn't.
 */
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
