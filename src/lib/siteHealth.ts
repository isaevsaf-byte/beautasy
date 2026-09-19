import { refusedTheEmail, sendEmail } from "@/lib/sendEmail";
import { checkConnection, instagramConfigured } from "@/lib/instagram";
import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { ATELIER_TIME_ZONE, instantOf, localDateOf } from "@/lib/slots";
import { southamptonHour } from "@/lib/postingRules";
import { SITE_SETTINGS_ID } from "@/lib/siteSettingsDocument";
import { HEARTBEAT_ID } from "@/lib/socialQueue";

/**
 * The morning watchman.
 *
 * Everything here has broken quietly at least once. The shop's Instagram
 * token expired and nobody noticed until somebody happened to look at the
 * feed. The Studio's Site Settings document was the wrong one for three
 * weeks, so every value Kristina saved reached nobody. Posts sat halfway out
 * with nothing to pick them up. In each case the site kept answering, the
 * daily job kept returning zeroes, and the only signal was a person
 * eventually wondering.
 *
 * So once a day this asks the handful of questions whose wrong answer is
 * invisible, and sends one email when an answer is wrong. Silence means all
 * is well — which is only trustworthy if the email is rare.
 *
 * "Rare" is the hard part, and it has taken four attempts. The first
 * draft treated an empty approved queue as a warning, and with one post a day
 * the queue empties on the last day of every batch, so the tail of every week
 * was an email. Posts approved for December counted as posts the pipeline was
 * failing to send, so a batch scheduled ahead meant an email every morning
 * until December. The guard against repeats was keyed on the date, so one
 * unfixed warning — a token fourteen days from expiry, say — was fourteen
 * identical mornings.
 *
 * The second draft narrowed the queue rule instead of dropping it: an email
 * only when nothing was approved, nothing was drafted, and nothing had gone
 * out for three days. That is Monday at this shop, every Monday. The last
 * post of the batch goes out on Friday morning, the weekend is empty, and
 * Kristina approves the next batch after lunch — so a run at nine on Monday
 * finds three days of silence and an empty queue. Thirty mornings of that
 * model produced five identical emails, one a week, for ever.
 *
 * The third draft moved the queue out of the way and left one measurement
 * wrong underneath it. "Due for more than a day" was counted from the date on
 * the post, and that date is stamped when the site writes the draft
 * (socialQueue.ts), days before Kristina ever sees it — so the day of grace
 * was already spent by the time she pressed Approve. The Monday email came
 * back for anyone who approved in the quarter of an hour between the
 * publisher's last run and this one. It took running the month once for every
 * quarter hour she might have approved at to see it. Lateness is now counted
 * from the moment a post could actually have gone out.
 *
 * So the depth of the queue is not a reason for an email at all, at any
 * threshold, and no number would have worked: a low one nags every week, a
 * high one means nothing. The queue is not a silent failure. It sits in front
 * of Kristina in the Studio under "Posts to approve", and it is her own list
 * of things to do. A watchman that reminds the owner of her own to-do list is
 * an alarm clock. The numbers are still reported — they come back in the
 * cron's answer, for the morning somebody looks on purpose — they simply
 * never raise the status and never send anything.
 *
 * Hence the four rules the checks below are built on:
 *   - only what breaks invisibly earns an email: a token that expired, a post
 *     that failed, a post stuck halfway out, a setting that vanished, a
 *     document that vanished, a database that stopped answering;
 *   - ask, rather than infer. Whether the publisher is still running was for
 *     three rounds worked out from the only thing visible, which was the feed:
 *     days of silence first, then whether the feed moved between two mornings.
 *     Both were defeated by the same thing, because the feed moves for reasons
 *     that have nothing to do with the schedule — a post Kristina sends herself
 *     with "Post this now", a Reel resumeReels pushes through two days late.
 *     Measured on the last of those readings: publisher dead for forty-five
 *     days, one post by hand each morning, forty-two approved posts stranded,
 *     forty-five green mornings, no email of any kind. The publisher now writes
 *     down that it ran, on every run, and this reads that. How deep the queue
 *     is still decides nothing anywhere in this file;
 *   - the same news is not news twice — but a trouble that went away and came
 *     back is news again. Every morning is written down, whether or not
 *     anything was sent, so an email goes out when today's list holds a name
 *     that was not there yesterday, more of something she was told about,
 *     something that has turned red, or when enough days pass
 *     (REPEAT_AFTER_DAYS);
 *   - nothing a single flat answer can invent is said on the morning it
 *     happens. Meta goes quiet for minutes at a time; the trouble is written
 *     down and it is tomorrow that decides whether it was weather or the
 *     token. A day of delay on a real breakage is cheaper than an email about
 *     the weather, because the email that arrives on a bad night is the one
 *     that teaches her to skim the next. Every morning record says which
 *     questions that morning actually managed to ask, and so does every email,
 *     so neither is ever afterwards read as a morning when all was well.
 *
 * Three things this cannot do, written down rather than pretended away. If
 * RESEND_API_KEY goes missing, every email the shop sends stops, this one
 * included, and the only place it is said is the cron's answer. If the daily
 * cron itself stops firing, nothing here runs at all, and silence then means
 * the same as silence on a good morning — the publisher can be asked whether
 * it is alive because something else wakes it, and nothing wakes this. And
 * when the database will not answer or will not be written to, the record of
 * what has already been said is in that same database, so the email repeats
 * every morning until it is fixed; both of those lines say so in as many
 * words, because an email that repeats without explaining itself is the one
 * that gets filtered.
 *
 * The shape is deliberate: `evaluateHealth` is a pure function of a snapshot,
 * so every judgement can be tested without Instagram, Sanity or Resend, and
 * only `gatherHealthFacts` talks to the outside world.
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

/** Meta's tokens last about sixty days. Two weeks is enough notice to act. */
const RENEW_TOKEN_WITHIN_DAYS = 14;

/**
 * When a quiet feed is worth a sentence — never a status.
 *
 * This used to be the fault itself: nothing on the feed for three days, with
 * posts overdue, meant a stalled publisher. It does not judge anything any
 * more, because a feed is not the publisher (see PULSE_STALE_AFTER_HOURS). All
 * it still decides is which of the "all well" sentences is the honest one, so
 * that a quiet week reads as a quiet week rather than as nothing at all.
 */
const QUIET_DAYS = 3;

/**
 * How long a post may wait, once it could have gone out, before the waiting
 * is the site's fault.
 *
 * The publisher wakes every fifteen minutes and sends at most a few posts a
 * day, so a backlog approved this morning is meant to leave over the coming
 * days — that is the setting working, not a fault. A post that could have
 * gone out a whole day ago, while nothing at all went out, is a different
 * thing: the site was given something to publish and did not publish it.
 *
 * "Could have gone out" is the part that was wrong. It is not the date on the
 * post: an automatic draft carries `createdAt` from the moment the site wrote
 * it (socialQueue.ts), which is days before Kristina looks at it, so every
 * hour of this allowance was spent before the post was publishable at all. It
 * is the later of the date she set on it and the moment she approved it — and
 * the moment she approved it is the moment Sanity last touched the document,
 * because approving is a patch to that document. The query below asks about
 * both dates, which is why it no longer mentions `createdAt`.
 *
 * Editing an approved post in the Studio touches the document too, so it
 * restarts this day. That is the right way round: she has just had the post in
 * front of her, and the mistake it costs is silence rather than noise.
 *
 * A day is also longer than any silence the Studio can be set to. Quiet hours
 * are whole hours, and quiet from an hour until the same hour means no quiet
 * hours at all (postingRules.ts), so twenty-three is the most that can be
 * asked for: a post publishable for twenty-four hours has certainly had an
 * opening, whatever the settings say. That is why this measures a day instead
 * of working out where the publisher's next window falls.
 */
const DUE_LATE_MS = 24 * 60 * 60 * 1000;

/**
 * A post on "publishing" for longer than this is not on its way any more.
 * The publisher wakes every fifteen minutes and treats the same two hours as
 * stale, so anything older has been abandoned by every run since.
 *
 * This only applies to posts with no Instagram container id. A Reel that has
 * one is being retried by `resumeReels` on every run with no age limit at
 * all, so it is not abandoned — see WAITING_ON_INSTAGRAM_HOURS.
 */
const STUCK_AFTER_HOURS = 2;

/**
 * A Reel Instagram has been transcoding for longer than this has gone wrong
 * somewhere, but it is still on a queue and still has a live container, so it
 * is worth mentioning rather than worth acting on in a hurry.
 */
const WAITING_ON_INSTAGRAM_HOURS = 24;

/**
 * When "Instagram is still thinking about it" becomes "this will never arrive".
 *
 * A Reel with a container id is the one shape of stuck post nothing here used
 * to be able to report. `resumeReels` asks after it on every run with no age
 * limit, so `stuckPublishing` steps over it on purpose, and the line below
 * said out loud that there was nothing to do. Measured over sixty days with a
 * container Instagram accepted and never finished: the post never went out and
 * not one email went out either, while the same sentence repeated that a day
 * was "far longer than it should take".
 *
 * Three days is the line because Meta keeps an accepted container for about
 * twenty-four hours. Past that the publisher's request every fifteen minutes —
 * some three hundred of them by now — is asking about something Instagram no
 * longer holds, so this is not transcoding taking its time. It is a post that
 * will sit there for ever, and the video needs replacing.
 */
const REEL_ABANDONED_AFTER_DAYS = 3;

/**
 * How far back a failed post is still this morning's news.
 *
 * This is the window for mentioning a failure, and nothing else. It used to be
 * the window for excusing silence as well — any failure in the last seven days
 * counted as the reason nothing was going out — and that silenced the one
 * check that watches the pipeline for a week at a time. Measured: one post
 * failed on the Monday, the publisher died on the Tuesday, three approved
 * posts sat there and the feed stayed dark, and the only email all week was
 * the one about that single post. The publisher never goes back to a failed
 * post — DUE_POSTS in socialQueue.ts picks up approved ones only — so last
 * week's failure explains nothing about this morning. See `failureExplainsTheSilence`.
 */
const FAILURES_WITHIN_DAYS = 7;

/**
 * How long a fitting request may sit with nobody having answered it.
 *
 * Everything else in this file watches machinery. This one watches a person
 * waiting, and it is here because the machinery was all green on the morning
 * that mattered: a request came in on 5 September, it saved perfectly, the
 * email telling Kristina was refused and counted as sent, and the customer
 * waited fourteen days for a reply nobody knew was owed. Nothing above this
 * line could have said so — from the outside a booking nobody has answered
 * looks exactly like a booking answered five minutes ago.
 *
 * Two days, and the number is a compromise between two real things. Kristina
 * sews alone and is not sitting in her inbox; a request that arrives on Friday
 * evening and is answered on Sunday is a normal week at a one-person atelier,
 * and an email about it would be noise. But somebody who has asked for a
 * fitting and heard nothing for two or three days has gone elsewhere — that is
 * the whole of what this is protecting. So it says nothing for two days, which
 * costs nothing, and speaks on the morning of the third, while there is still
 * somebody to answer.
 *
 * Five days is the second line, and it is red. A warning is repeated weekly
 * (REPEAT_AFTER_DAYS), which is the right rhythm for a date in the diary and
 * the wrong one here: said once on the Wednesday and then not again until the
 * following Wednesday, it would go quiet for exactly the week in which the
 * customer gives up. Past five days the person is almost certainly lost
 * already, and what is left to save is the next one.
 */
const ANSWER_BOOKING_WITHIN_DAYS = 2;
const BOOKING_WAIT_IS_SERIOUS_DAYS = 5;

/**
 * Both numbers above are WORKING days, and that word is the whole of this
 * note.
 *
 * They were calendar days, and measured over an honest month that sent an
 * email every Monday for a shop where nothing was wrong. A request arrives on
 * Friday at half past seven in the evening, Kristina answers it on Monday at
 * one — a completely ordinary weekend at a one-person atelier, and exactly the
 * case the paragraph above says must stay silent. The nine o'clock run on
 * Monday beat her to it by four hours, counted two calendar days, and wrote.
 * Then the problem went away, so the following Monday it was news again.
 *
 * So the clock only runs when the atelier is open. It does not start until the
 * next morning it opens — a request at eight on Friday evening starts its
 * clock at nine on Monday — and Saturdays and Sundays are not counted at all.
 * Nothing changes for a weekday request: Tuesday morning to Thursday morning
 * is still forty-seven hours and still silent, which is the behaviour that was
 * already right.
 *
 * Opening hours rather than a whole day, because "arrived at 23:00 on
 * Wednesday" and "arrived at 09:00 on Thursday" are the same request as far as
 * anybody being able to answer it goes.
 */
const ATELIER_OPENS_AT = 9;
const ATELIER_CLOSES_AT = 18;

/**
 * When chasing one request stops being worth an email.
 *
 * The other way this line can ruin itself, and it was measured too: a request
 * answered by replying straight from the inbox — which is the natural thing to
 * do, because her email about it carries the customer's address as the
 * reply-to — never changes anything in the Studio. It stays "new" for ever.
 * Past the serious line that is a fault, faults repeat every second day, and
 * one such row produced twelve emails in thirty days and would have gone on
 * producing them until somebody opened the Studio. That is how every other
 * line in this file ends up filtered.
 *
 * A fortnight, in ordinary calendar days, because this one is about a person
 * and people do not stop existing at the weekend. Past it the request is not
 * silenced — it is still counted and still named in any email that goes out
 * for another reason — but it no longer raises the status on its own, so it
 * cannot send one. What is being given up is honest and worth writing down:
 * if she has genuinely never seen a request, the site stops chasing her about
 * it after a fortnight. By then it has chased her six times, the customer has
 * long since gone elsewhere, and what is left is a row to tidy rather than
 * somebody to save. A new request that goes unanswered starts the whole
 * escalation again, which is the part that has to keep working.
 *
 * Deliberately not a button in the Studio. A "dismiss this" field would be one
 * more thing to learn and remember, and the trap it walks into is the one this
 * check exists for: a booking she never opens in the Studio is exactly the
 * booking she would never dismiss. The status dropdown she already uses —
 * Confirmed, Can't make it, Done — is the existing way of saying "dealt with",
 * and it silences this line the moment she touches it.
 */
const BOOKING_CHASE_STOPS_AFTER_DAYS = 14;

/**
 * The day `kristinaNotifiedAt` started being written.
 *
 * Bookings older than this cannot be judged by a field that did not exist when
 * they were made, and without this line every one of them would light up on
 * the first morning after the deploy — a dozen red rows about fittings that
 * happened weeks ago, in the first email the new check ever sent, which is the
 * fastest possible way to teach somebody to ignore it.
 */
export const KRISTINA_NOTICE_SINCE = "2026-09-19T00:00:00Z";

/**
 * How long before the same news is worth saying again.
 *
 * A fault stops the shop doing something it is meant to do, so a nudge every
 * other day earns its place. A warning is a date in the diary — a token that
 * expires in a fortnight loses one day of notice per silent morning, and a
 * weekly reminder still leaves plenty. Both numbers exist for one reason: the
 * email has to stay rare, or silence stops meaning anything.
 */
const REPEAT_AFTER_DAYS: Record<"warn" | "fail", number> = { fail: 2, warn: 7 };

/**
 * A single flaky answer is not a broken shop.
 *
 * Meta rate-limits, and five minutes of Graph API trouble used to produce a
 * red "redo the Instagram setup" email on a morning when the token was
 * perfectly good. Every outside answer is asked for twice, a pause apart,
 * before it is believed.
 */
const RETRY_PAUSE_MS = 1000;

/**
 * The watchman's share of the cron's sixty seconds.
 *
 * Every question it asks the outside world is capped, because `allSettled` in
 * the daily route guards against a job throwing, not against one eating the
 * whole budget. `checkConnection` walks every business portfolio one fetch at
 * a time when a lookup fails, and a slow diagnosis used to be able to cut
 * short the order and booking emails. Capping a read costs nothing: the
 * answer becomes "no answer", which is where the slow path was heading.
 *
 * Capping only the probe left two ways to spend the budget anyway — Meta's
 * debug_token call had no limit of its own, and asking twice doubles whatever
 * is under it — so the arithmetic is written out here. Worst case, with every
 * question timing out and every retry taken:
 *
 *   Instagram: 6s probe + 1s pause + 6s probe + 5s expiry  = 18s
 *   database:  8s query + 1s pause + 8s query              = 17s
 *
 * The two run side by side, so the reading costs 18 seconds at worst. The two
 * writes that follow — claiming the morning and sending the email — are
 * deliberately not raced: a write you stopped waiting for may still land, and
 * a watchman that guesses whether it already claimed the morning sends the
 * duplicate emails this whole file is arranged to avoid.
 */
const PROBE_TIMEOUT_MS = 6000;

/** How long Meta may take to say when the token dies. */
const EXPIRY_TIMEOUT_MS = 5000;

/** How long the database may take to answer this morning's questions. */
const DATABASE_TIMEOUT_MS = 8000;

/**
 * How long Resend may take to accept the one email.
 *
 * The morning is claimed before the email is sent, on purpose: the claim is
 * what stops two runs both writing to her. The cost of that order is that a
 * send which never answers leaves "emailed: true" behind for a morning nobody
 * was ever told about, and tomorrow reads that as news already delivered —
 * two days of silence for a fault, seven for a warning, in exactly the
 * situation this file exists for. Vercel kills the whole request at sixty
 * seconds shared between eight jobs, so the hang would not even be logged.
 * Capped, then, and the morning handed back if Resend says nothing: the worst
 * that costs is one repeated email tomorrow.
 *
 * The same five seconds Meta gets. One HTTPS request to a service that
 * normally answers in under a second has not gone slow at five, it has gone.
 */
const EMAIL_TIMEOUT_MS = 5000;

/** Two mornings this far apart still count as consecutive looks. */
const MEMORY_GOOD_FOR_DAYS = 2;

/**
 * How long the publisher may say nothing before it is not running.
 *
 * Everything before this asked whether the publisher was alive by watching the
 * feed, because the feed was the only thing there was to watch. It never
 * worked. Every version needed the feed to sit still, and the feed does not
 * sit still while anything at all reaches it — a post Kristina sends herself
 * with "Post this now", a Reel `resumeReels` pushes through two days late. The
 * last version scored the evidence instead of counting still mornings in a
 * row, and was measured on this code: publisher dead for forty-five days,
 * Kristina posting by hand every morning, forty-two approved posts stranded —
 * forty-five green mornings and no email at all. And a morning the watchman
 * could not judge left no mark, so the count started again from nothing: a
 * Meta that was busy every fifth morning was enough to keep it silent for
 * ever, with the publisher dead the whole time.
 *
 * So it is not inferred any more, it is asked. The publisher writes down that
 * it ran, every run, and this reads that (see PublisherPulse, and HEARTBEAT_ID
 * in socialQueue.ts). No arithmetic over two mornings, nothing to erase, and
 * nothing Kristina can do by hand that touches it.
 *
 * Three hours is twelve knocks in a row missed. The schedule wakes the
 * publisher every fifteen minutes from Cloudflare, and a single missed knock,
 * a deploy, or a few minutes of Cloudflare having a bad time must never be
 * news — this file's whole discipline is that weather is not worth an email.
 * Twelve in a row is not weather. Against it, the cost of the long line is a
 * few hours of delay on a morning check that only runs once a day anyway.
 */
const PULSE_STALE_AFTER_HOURS = 3;

/**
 * How long a running publisher may send nothing, with posts sitting overdue,
 * before that is a fault of its own.
 *
 * This is the other half of the question and it needs its own line, because a
 * publisher can knock every quarter of an hour and still put nothing out —
 * Instagram refusing every post, a bug between the queue and the send. The
 * pulse says it ran; `lastSentAt` says whether anything came of it; and
 * `lastFreeAt` says whether the rules ever gave it the chance, without which
 * the shop where Kristina spends the daily number by hand each morning reads
 * as a publisher that has stopped. All three are needed and none of them is
 * the feed.
 *
 * Two days rather than the one day `lateWaiting` is drawn at, and the extra
 * day was bought after measuring what one costs. Quiet hours are whole hours
 * and "from an hour until the same hour" means none at all (postingRules.ts),
 * so twenty-three of them is the most that can be asked for — which leaves the
 * publisher a single hour a day to work in, and that hour moves against a cron
 * fixed in UTC when the clocks change. Measured over a hundred and eighty such
 * months, one-hour and two-hour windows at six times of day across both clock
 * changes, with a publisher in perfect health: at one day a shop whose window
 * opens at nine sends a false email on the Sunday the clocks go back. At two
 * days, none of the hundred and eighty says anything.
 *
 * It cannot reach two days honestly: with anything due and any daily number at
 * all, those rules open a window inside forty-eight hours whatever the clocks
 * do. And the dead publisher, which is the common case by far, is caught in
 * hours by the line above and never waits on this one.
 */
const PUBLISHER_IDLE_DAYS = 2;

export type HealthStatus = "ok" | "warn" | "fail";

export interface HealthCheck {
  /** A label a non-technical reader recognises, e.g. "Instagram" */
  name: string;
  status: HealthStatus;
  /**
   * One or two plain sentences: what is true, and what to do about it. The
   * first sentence becomes the subject line, so it carries the fact.
   */
  detail: string;
  /**
   * How many things this check is counting, when it counts things.
   *
   * It goes into the fingerprint an email is remembered by. "Failed posts" on
   * Monday and "Failed posts" on Wednesday are the same two words and a
   * different morning — one post down, then three — and without the number a
   * publisher breaking a little more every day read as the same unfixed
   * warning and was silenced for a week.
   */
  tally?: number;
}

/**
 * Troubles that must be seen on two consecutive mornings before they are
 * called a failure. Stored as plain strings because they are written into a
 * Sanity document and read back tomorrow.
 */
export const INSTAGRAM_UNREACHABLE = "instagram-unreachable";

/**
 * The token has gone from the site's settings at a shop that used to post.
 *
 * Remembered for the same reason: on its own it is somebody halfway through a
 * change in Vercel, and on two mornings running it is a pipeline that is dead
 * and staying dead.
 */
export const INSTAGRAM_DISCONNECTED = "instagram-disconnected";

/**
 * The publisher has not said a word for hours, and posts are waiting.
 *
 * Remembered for the same reason as the two above: one morning of it can be a
 * deploy or an hour of Cloudflare trouble, and two mornings running is a
 * schedule that has stopped and is staying stopped. What it is not is a guess
 * that has to be rebuilt from scratch each morning — the measurement lives in
 * the publisher's own record and survives a morning nobody could look at. This
 * mark only decides how loudly to say it.
 */
export const PUBLISHER_SILENT = "publisher-silent";

/**
 * The publisher is running and nothing is coming out of it.
 *
 * Kept apart from the mark above because they are different breakages with
 * different things to do about them, and a morning that flips from one to the
 * other must not read as "the same thing, two mornings running".
 */
export const PUBLISHER_NOT_SENDING = "publisher-not-sending";

/**
 * The settings without which something stops working and says nothing.
 *
 * Each is written out in full rather than looked up by name from a list of
 * strings: Next replaces `process.env.SOMETHING` where it is spelled out, and
 * a lookup through a variable is not replaced — which would report a setting
 * as missing on the very morning it is present.
 *
 * NEXT_PUBLIC_ variables are a trap of their own. Next inlines them at build
 * time, so what is read here is what the last deployment was given, not what
 * Vercel holds now. Adding one in the dashboard changes nothing until the site
 * is built again, and an email saying "missing" about a value the dashboard
 * plainly shows is an email nobody can act on — so that one says out loud that
 * a redeploy is the fix.
 */
const REQUIRED_SETTINGS: { name: string; value: () => string | undefined; consequence: string }[] = [
  {
    name: "RESEND_API_KEY",
    value: () => process.env.RESEND_API_KEY,
    consequence: "no email goes out at all — not to customers, not this one",
  },
  {
    name: "SANITY_API_WRITE_TOKEN",
    value: () => process.env.SANITY_API_WRITE_TOKEN,
    consequence: "nothing can be written down: bookings, orders and posts all stall",
  },
  {
    name: "STRIPE_SECRET_KEY",
    value: () => process.env.STRIPE_SECRET_KEY,
    consequence: "nobody can pay",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    value: () => process.env.STRIPE_WEBHOOK_SECRET,
    consequence: "money would arrive without an order being recorded",
  },
  {
    name: "DATA_SECRET",
    value: () => process.env.DATA_SECRET,
    consequence: "gift card codes and review links cannot be read",
  },
  {
    name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    value: () => process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    consequence:
      "signing in disappears from the site without any error. This one is read from the last build, so add it in Vercel and deploy again — setting it in the dashboard alone changes nothing",
  },
];

export interface InstagramFacts {
  /** Whether a token exists at all */
  configured: boolean;
  /** Whether Instagram answered and named the account */
  reachable: boolean;
  username?: string;
  error?: string;
  /**
   * When the token dies. `null` means Meta names no date at all; the field is
   * absent when the expiry could not be read.
   */
  expiresAt?: string | null;
  expiryKnown: boolean;
}

export interface QueueFacts {
  /** Approved and not yet published — the whole backlog, dated or not */
  approvedWaiting: number;
  /**
   * Approved, not published, and due now: exactly what the publisher would
   * pick up. Posts dated for December are approved but not due, and counting
   * them as posts the pipeline is failing to send was a daily email until
   * December.
   */
  dueWaiting: number;
  /**
   * Due posts that could have gone out more than DUE_LATE_MS ago.
   *
   * Counted in the query rather than worked out here. "Could have gone out" is
   * the later of two dates on each post, and what this needs to know is
   * whether any post is past that line — which is one count and no arithmetic
   * to get wrong, rather than a single date that has to stand for the whole
   * queue.
   */
  lateWaiting: number;
  /** Written by the site, waiting for Kristina to approve */
  draftsWaiting: number;
  lastPublishedAt: string | null;
  /** Posts abandoned on "publishing" with no Instagram container to resume */
  stuckPublishing: number;
  /** Reels Instagram has been transcoding for more than a day */
  waitingOnInstagram: number;
  /**
   * Of those, the ones past the point where Instagram could still be working
   * on them — a container it accepted, never finished, and no longer holds.
   */
  reelsAbandoned: number;
  /** Posts that failed within FAILURES_WITHIN_DAYS */
  failedRecently: number;
  /** What Instagram said about the most recent one */
  lastFailureError: string | null;
  /** When the most recent failure was, so an old one stops excusing silence */
  lastFailureAt: string | null;
  /** Whether the document the Studio edits is the one the site reads */
  settingsDocumentExists: boolean;
  /**
   * When each unanswered fitting request came in. Dates, and nothing else.
   *
   * Dates rather than a count, because the line between "waiting" and "waited
   * long enough" is drawn in working days and GROQ cannot count those. The
   * query narrows it to requests already past the calendar line, which can
   * only ever be a superset of the working one, and `bookingsNeedingAnAnswer`
   * makes the real judgement here where it can be tested.
   *
   * Two hundred of them at most, oldest first. A shop with two hundred
   * unanswered fitting requests has been left alone for years, and the cap is
   * only here so that a runaway query cannot become a runaway email.
   *
   * No name, no address, no telephone number: this dataset is public and the
   * details are sealed (see @/lib/pii). A date is all this file ever needs.
   */
  bookingsUnanswered: string[];
  /** The publisher's own word that it ran. Null where it never has — see PublisherPulse */
  publisherPulse: PublisherPulse | null;
}

/**
 * What the publisher left behind the last time it ran.
 *
 * Written by `publishDuePosts` in socialQueue.ts and by nothing else, so it
 * answers "is the schedule still knocking?" directly instead of inferring it
 * from the feed. See HEARTBEAT_ID there for why the two dates are separate and
 * why the Studio's "Post this now" button cannot touch either.
 */
export interface PublisherPulse {
  /** When a run last finished, whatever it did */
  at: string;
  /** When a run last actually put something on the feed */
  lastSentAt: string | null;
  /**
   * When the posting rules last let a run through, sending or not.
   *
   * Null at a shop whose publisher has only ever been held — which is not a
   * fault, it is the rules doing their job. See `publisherFault`.
   */
  lastFreeAt: string | null;
  /**
   * When the publisher first wrote anything down here at all.
   *
   * Sanity's own `_createdAt`, and it is how long "it has never sent anything"
   * has been true for. Without it a document written twenty minutes ago and a
   * publisher that has been failing for a fortnight read the same.
   */
  createdAt: string | null;
  /** What that run did: published, held by the rules, skipped, or threw */
  outcome: string;
  detail?: string | null;
}

/**
 * What the watchman remembers from previous mornings.
 *
 * Two different memories, both kept in the same Sanity documents. `troubles`
 * is yesterday's answer to questions that need two mornings before they are
 * believed. `lastEmail` is what the last email was actually about, which is
 * what stops the same sentence arriving every day until it is dealt with.
 */
export interface HealthMemory {
  /** When the watchman last looked, or null if it never has */
  lookedAt: string | null;
  troubles: string[];
  /**
   * What was wrong at that last look, email or no email.
   *
   * A morning is written down whichever way the decision goes, so this is
   * yesterday morning's list — and it is the only thing that can tell a
   * trouble that never went away from one that went away and came back. The
   * last email cannot: five posts failed on the Monday, she mended them by the
   * Wednesday, three different ones went down on the Friday, and Friday was
   * swallowed as "she has already been told about failed posts".
   */
  previousProblems: string[];
  /**
   * Which questions yesterday morning actually managed to ask.
   *
   * Without this an empty `previousProblems` means two opposite things, and
   * the rule above reads both as the cheerful one. A morning where Meta was
   * busy at nine never produces an "Instagram renewal" line at all, and a
   * morning where the database said nothing produces none of the four lines
   * about posts — so a standing, unchanged warning looked like fresh news the
   * next day and went out again, past REPEAT_AFTER_DAYS. Measured over a
   * fortnight with one unchanging "expires in N days" warning: two emails if
   * every morning was clean, five if Meta was busy every third morning, seven
   * if every second. Noise about a thing that had not changed, set off by
   * precisely the network weather this file goes quiet about everywhere else.
   *
   * Records written before this field existed come back empty, which forgets
   * nothing — the quiet direction, and the right one to be wrong in.
   */
  previousLooked: string[];
  /**
   * The last email, and which questions the morning that sent it could ask.
   *
   * `looked` is here for the same reason it is above, one step further out. An
   * email sent on a morning when the database said nothing lists only what
   * that morning could see, and the next morning found every line about posts
   * missing from it and called each one fresh news. Measured, with the
   * publisher dead and the database going quiet every third morning: the list
   * flipped between {Shop database} and {Posting}, each new to the other, and
   * it was an email every single morning — forty-four in forty-five days about
   * two problems that never once changed. That is the rhythm this whole file
   * says teaches her to skim. An empty `looked` is a record written before the
   * field existed; it suppresses nothing, which is the loud direction.
   */
  lastEmail: { at: string; problems: string[]; worst: HealthStatus; looked: string[] } | null;
}

export const NO_MEMORY: HealthMemory = {
  lookedAt: null,
  troubles: [],
  previousProblems: [],
  previousLooked: [],
  lastEmail: null,
};

export interface HealthFacts {
  /** The instant everything was measured at, so judgement stays pure */
  now: string;
  instagram: InstagramFacts;
  /** Null when the database did not answer — then most checks cannot be made */
  queue: QueueFacts | null;
  queueError?: string;
  missingSettings: string[];
  memory: HealthMemory;
}

/* ─── Reading the world ─── */

/**
 * Exported so a test can run it rather than read it.
 *
 * Everything below judges numbers this query produced, and for a long time the
 * only thing checking the query itself was a regular expression looking for
 * field names in this file's own source. That is how the guard on
 * `scheduledFor` in `lateWaiting` came to be carried by no test at all: delete
 * the whole line and every one of the tests still passed, while a batch
 * approved for next month went back to being a batch the site was failing to
 * send — the first mistake this file was ever written to stop making.
 *
 * `groq-js` is Sanity's own parser and evaluator, and it is already installed
 * here as one of `sanity`'s dependencies, so the tests run this exact text
 * against documents shaped like the real ones.
 */
export const HEALTH_QUERY = `{
  "approvedWaiting": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "approved" && !defined(publishedAt)
  ]),
  "dueWaiting": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "approved" && !defined(publishedAt)
    && (!defined(scheduledFor) || scheduledFor <= $now)
  ]),
  // Posts that could have gone out a whole day ago and did not: due by their
  // own date, and approved — which is to say last written to — before that
  // line as well. The createdAt field is deliberately not in here. It is
  // stamped when the site drafts a post, days before anyone approves it, and
  // reading lateness from it meant every batch was already a day late the
  // second it was approved.
  "lateWaiting": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "approved" && !defined(publishedAt)
    && (!defined(scheduledFor) || dateTime(scheduledFor) < dateTime($lateBefore))
    && dateTime(_updatedAt) < dateTime($lateBefore)
  ]),
  "draftsWaiting": count(*[
    _type == "socialPost" && !(_id in path("drafts.**")) && status == "draft"
  ]),
  "lastPublishedAt": *[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && (defined(publishedAt) || status == "published")
  ] | order(coalesce(publishedAt, _updatedAt) desc)[0]{ "at": coalesce(publishedAt, _updatedAt) }.at,
  "stuckPublishing": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "publishing" && !defined(publishedAt) && !defined(igCreationId)
    && dateTime(_updatedAt) < dateTime($stuckBefore)
  ]),
  "waitingOnInstagram": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "publishing" && !defined(publishedAt) && defined(igCreationId)
    && dateTime(_updatedAt) < dateTime($reelsBefore)
  ]),
  // The same Reels, counted again against a line far enough back that
  // "Instagram is still working on it" stops being a possible answer.
  "reelsAbandoned": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "publishing" && !defined(publishedAt) && defined(igCreationId)
    && dateTime(_updatedAt) < dateTime($reelsAbandonedBefore)
  ]),
  "failedRecently": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "failed" && dateTime(_updatedAt) > dateTime($failuresSince)
  ]),
  "lastFailureError": *[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "failed" && dateTime(_updatedAt) > dateTime($failuresSince)
  ] | order(_updatedAt desc)[0].lastError,
  "lastFailureAt": *[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "failed" && dateTime(_updatedAt) > dateTime($failuresSince)
  ] | order(_updatedAt desc)[0]._updatedAt,
  "settingsDocumentExists": defined(*[_id == "${SITE_SETTINGS_ID}"][0]._id),
  // A person waiting, which is the only thing here that is not machinery.
  //
  // Two different ways that happens, and the second one is why there is a
  // second clause. "new" is the schema's own word for "needs a reply", and it
  // covers a request where the customer could not pick a time: it stays "new"
  // until Kristina answers it, and declined, completed and a confirmed she set
  // herself are all answers.
  //
  // A customer who picks their own time is never "new". The site writes that
  // booking down as "confirmed" in the same breath, because the site has just
  // confirmed it to them — which is a fact about the customer and says nothing
  // at all about whether anybody at the atelier knows. On 5 September the one
  // email that would have told her was refused and counted as sent; a check
  // reading only the status would have watched that booking sit in the diary
  // looking perfectly answered until the customer turned up at a locked door.
  // Measured through this very query before the clause was added: a fortnight
  // old, nobody told, and the count came back zero.
  //
  // So the second clause reads kristinaNotifiedAt, which is stamped only once
  // her notification has actually been taken by the mail service and by
  // nothing else — see the route that writes it. The slotStart clause keeps
  // this to bookings the SITE confirmed: a request Kristina confirms by hand
  // in the Studio also has no stamp, and chasing her about a booking she just
  // opened would be the check crying wolf about its own owner.
  "bookingsUnanswered": *[
    _type == "atelierBooking" && !(_id in path("drafts.**"))
    && (
      status == "new"
      || (
        defined(slotStart) && status == "confirmed" && !defined(kristinaNotifiedAt)
        && dateTime(coalesce(createdAt, _createdAt)) > dateTime($kristinaNoticeSince)
      )
    )
    && dateTime(coalesce(createdAt, _createdAt)) < dateTime($bookingsUnansweredBefore)
  ] | order(coalesce(createdAt, _createdAt) asc)[0...200]{ "at": coalesce(createdAt, _createdAt) },
  // The publisher's own word that it ran, left by publishDuePosts every
  // fifteen minutes. Absent at a shop where it has never run at all.
  // _createdAt is Sanity's own, and it is here because the absence of
  // lastSentAt used to be read as an infinite silence. The document is made by
  // the first run, not by the first send, so a publisher deployed twenty
  // minutes ago looked exactly like one that had been failing for a fortnight.
  // lastFreeAt is when the rules last let a run through — see publisherFault.
  "publisherPulse": *[_id == "${HEARTBEAT_ID}"][0]{ at, lastSentAt, lastFreeAt, outcome, detail, _createdAt },
  "previousLook": *[
    _type == "siteHealthAlert" && _id != $todayId
  ] | order(checkedAt desc)[0]{ checkedAt, troubles, problems, looked },
  // The names of the questions come back with the last email as well as with
  // the last look: an email sent on a morning that could not ask about posts
  // is not evidence that she has been told nothing is wrong with them.
  "lastEmail": *[
    _type == "siteHealthAlert" && _id != $todayId && emailed == true
  ] | order(checkedAt desc)[0]{ checkedAt, problems, worst, looked }
}`;

interface HealthQueryResult {
  approvedWaiting: number;
  dueWaiting: number;
  lateWaiting: number;
  draftsWaiting: number;
  lastPublishedAt: string | null;
  stuckPublishing: number;
  waitingOnInstagram: number;
  reelsAbandoned: number;
  failedRecently: number;
  lastFailureError: string | null;
  lastFailureAt: string | null;
  settingsDocumentExists: boolean;
  bookingsUnanswered: { at?: string | null }[] | null;
  publisherPulse: {
    at?: string;
    lastSentAt?: string | null;
    lastFreeAt?: string | null;
    outcome?: string;
    detail?: string | null;
    _createdAt?: string | null;
  } | null;
  previousLook: {
    checkedAt?: string;
    troubles?: string[];
    problems?: string[];
    looked?: string[];
  } | null;
  lastEmail: {
    checkedAt?: string;
    problems?: string[];
    worst?: HealthStatus;
    looked?: string[];
  } | null;
}

type QueueAnswer =
  | { ok: true; facts: QueueFacts; memory: HealthMemory }
  | { ok: false; error: string };

/**
 * "Last published" deliberately excludes posts still on "publishing".
 *
 * The publisher counts those as posts that went out, because a run can die
 * after Instagram accepted the picture. Here that would be the wrong way
 * round: one post stuck halfway would read as a post going out every day and
 * hide exactly the silence this is looking for.
 */
async function askTheDatabase(now: Date): Promise<QueueAnswer> {
  try {
    const state = await sanityWriteClient.fetch<HealthQueryResult>(HEALTH_QUERY, {
      now: now.toISOString(),
      stuckBefore: new Date(now.getTime() - STUCK_AFTER_HOURS * 60 * 60 * 1000).toISOString(),
      reelsBefore: new Date(
        now.getTime() - WAITING_ON_INSTAGRAM_HOURS * 60 * 60 * 1000
      ).toISOString(),
      reelsAbandonedBefore: new Date(
        now.getTime() - REEL_ABANDONED_AFTER_DAYS * DAY
      ).toISOString(),
      failuresSince: new Date(now.getTime() - FAILURES_WITHIN_DAYS * DAY).toISOString(),
      lateBefore: new Date(now.getTime() - DUE_LATE_MS).toISOString(),
      // A calendar line, and deliberately the loosest one that can matter: a
      // request cannot have waited two WORKING days without also having waited
      // two calendar ones, so this can only ever hand over too many. The real
      // judgement is `bookingsNeedingAnAnswer`, below, where a weekend counts
      // for nothing.
      bookingsUnansweredBefore: new Date(
        now.getTime() - ANSWER_BOOKING_WITHIN_DAYS * DAY
      ).toISOString(),
      kristinaNoticeSince: KRISTINA_NOTICE_SINCE,
      todayId: healthAlertDocumentId(now),
    });
    return {
      ok: true,
      facts: {
        approvedWaiting: state.approvedWaiting ?? 0,
        dueWaiting: state.dueWaiting ?? 0,
        lateWaiting: state.lateWaiting ?? 0,
        draftsWaiting: state.draftsWaiting ?? 0,
        lastPublishedAt: state.lastPublishedAt ?? null,
        stuckPublishing: state.stuckPublishing ?? 0,
        waitingOnInstagram: state.waitingOnInstagram ?? 0,
        reelsAbandoned: state.reelsAbandoned ?? 0,
        failedRecently: state.failedRecently ?? 0,
        lastFailureError: state.lastFailureError ?? null,
        lastFailureAt: state.lastFailureAt ?? null,
        settingsDocumentExists: state.settingsDocumentExists === true,
        bookingsUnanswered: (state.bookingsUnanswered ?? [])
          .map((row) => row?.at)
          .filter((at): at is string => typeof at === "string"),
        // A document with no `at` on it is not a pulse: it would read as a
        // publisher that ran at the epoch, which is the loud answer given for
        // the quietest reason.
        publisherPulse: state.publisherPulse?.at
          ? {
              at: state.publisherPulse.at,
              lastSentAt: state.publisherPulse.lastSentAt ?? null,
              lastFreeAt: state.publisherPulse.lastFreeAt ?? null,
              createdAt: state.publisherPulse._createdAt ?? null,
              outcome: state.publisherPulse.outcome ?? "unknown",
              detail: state.publisherPulse.detail ?? null,
            }
          : null,
      },
      memory: {
        lookedAt: state.previousLook?.checkedAt ?? null,
        troubles: state.previousLook?.troubles ?? [],
        previousProblems: state.previousLook?.problems ?? [],
        previousLooked: state.previousLook?.looked ?? [],
        lastEmail: state.lastEmail?.checkedAt
          ? {
              at: state.lastEmail.checkedAt,
              problems: state.lastEmail.problems ?? [],
              worst: state.lastEmail.worst ?? "warn",
              looked: state.lastEmail.looked ?? [],
            }
          : null,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "no answer" };
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ask twice before believing bad news.
 *
 * `attempt` must answer rather than throw, so that both tries are made on the
 * same terms. Exported only so a test can run it with a sleep that does not
 * actually sleep.
 */
export async function askTwice<T>(
  attempt: () => Promise<T>,
  worthAskingAgain: (answer: T) => boolean,
  sleep: (ms: number) => Promise<void> = pause
): Promise<T> {
  const first = await attempt();
  if (!worthAskingAgain(first)) return first;
  await sleep(RETRY_PAUSE_MS);
  return attempt();
}

/**
 * The clock `within` measures its deadline against.
 *
 * A seam, and it exists for one reason: the numbers on the timeouts were not
 * covered by anything. Every mutation of EMAIL_TIMEOUT_MS passed — five
 * seconds to thirty, to five thousand, and to one millisecond. The last of
 * those is the dangerous one, because the real Resend answers in about two
 * hundred milliseconds, so a one-millisecond deadline would hand every morning
 * back and send the same email again tomorrow, for ever, and no test noticed.
 * The only mutation that failed did so by hanging the suite for as long as the
 * constant said, which is not a test either.
 *
 * So a test can hold the clock, cross the deadline without waiting for it, and
 * see the number the deadline was actually set to.
 */
export type Countdown = (ms: number, tooSlow: () => void) => () => void;

const realCountdown: Countdown = (ms, tooSlow) => {
  const timer = setTimeout(tooSlow, ms);
  return () => clearTimeout(timer);
};

/**
 * Give up on a slow answer rather than spend the whole cron budget on it.
 *
 * The underlying request is left to finish on its own; nothing here waits for
 * it. That is fine because the only thing at stake is a diagnosis, and a
 * diagnosis nobody waited for is the same as no diagnosis.
 *
 * Exported so a test can watch it give up, rather than take the timeouts on
 * trust: every outside question this file asks is wrapped in it.
 */
export async function within<T>(
  ms: number,
  work: () => Promise<T>,
  whenTooSlow: T,
  countdown: Countdown = realCountdown
): Promise<T> {
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((resolve) => {
        cancel = countdown(ms, () => resolve(whenTooSlow));
      }),
    ]);
  } finally {
    cancel?.();
  }
}

const DEBUG_TOKEN = "https://graph.facebook.com/v21.0/debug_token";

/**
 * How long the Instagram connection has left.
 *
 * The publishing code only learns this after something has already failed,
 * which is the wrong end of the problem: by then the posts have stopped. This
 * asks while everything still works.
 *
 * Two dates matter, not one. `expires_at` is when the token itself dies, and
 * Meta writes 0 there for a Page token derived from a long-lived user token —
 * which reads as "never expires" and is how the first version of this check
 * promised a connection would last forever, three weeks before it stopped.
 * What actually kills that token is `data_access_expires_at`, ninety days from
 * the last time somebody logged in. Whichever comes first is the date to act
 * on.
 *
 * Meta answers for tokens issued through Facebook Login. A token from
 * Instagram Login belongs to a different graph and this one will not read it,
 * so "unknown" is a real and common answer — and saying so honestly is better
 * than reporting "never expires" about a token that dies in November.
 */
async function tokenExpiry(): Promise<{ known: boolean; at?: string | null }> {
  const token = process.env.IG_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!token) return { known: false };
  // Capped twice on purpose. The signal lets go of the socket, and `within`
  // bounds the wait even if the request never honours it — this ran on a green
  // morning with no limit of its own, so a Meta that accepted the connection
  // and then said nothing could spend the budget the probe had been capped to
  // protect.
  return within(EXPIRY_TIMEOUT_MS, () => askMetaWhenTheTokenDies(token), { known: false });
}

async function askMetaWhenTheTokenDies(
  token: string
): Promise<{ known: boolean; at?: string | null }> {
  try {
    const encoded = encodeURIComponent(token);
    const res = await fetch(`${DEBUG_TOKEN}?input_token=${encoded}&access_token=${encoded}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(EXPIRY_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: { expires_at?: number; data_access_expires_at?: number };
    };
    const said = [body.data?.expires_at, body.data?.data_access_expires_at].filter(
      (value): value is number => typeof value === "number"
    );
    if (said.length === 0) return { known: false };

    const dated = said.filter((seconds) => seconds > 0);
    // Every date Meta named is 0, so it genuinely names no date at all.
    if (dated.length === 0) return { known: true, at: null };
    return { known: true, at: new Date(Math.min(...dated) * 1000).toISOString() };
  } catch {
    return { known: false };
  }
}

async function probeInstagram(): Promise<InstagramFacts> {
  let report;
  try {
    report = await within(PROBE_TIMEOUT_MS, checkConnection, {
      configured: instagramConfigured(),
      error: "Instagram did not answer in time",
    });
  } catch (error) {
    return {
      // Read from the environment rather than assumed: a shop with no token at
      // all deserves the gentle "not connected" line, not a red "Instagram
      // will not let us post" because a probe threw before its own guard.
      configured: instagramConfigured(),
      reachable: false,
      expiryKnown: false,
      error: error instanceof Error ? error.message : "Instagram could not be reached",
    };
  }

  if (!report.configured) {
    return { configured: false, reachable: false, expiryKnown: false, error: report.error };
  }
  if (report.error) {
    return { configured: true, reachable: false, expiryKnown: false, error: report.error };
  }

  // Only worth asking once the token has proved it still works — a rejected
  // token has no expiry worth reporting, it is already dead.
  const expiry = await tokenExpiry();
  return {
    configured: true,
    reachable: true,
    username: report.username,
    expiryKnown: expiry.known,
    expiresAt: expiry.at,
  };
}

async function instagramFacts(): Promise<InstagramFacts> {
  // A configured account that did not answer is the one worth asking twice:
  // an unconfigured one will say the same thing however often it is asked.
  return askTwice(probeInstagram, (facts) => facts.configured && !facts.reachable);
}

/** Everything the checks judge, measured once. */
export async function gatherHealthFacts(now: Date = new Date()): Promise<HealthFacts> {
  const [instagram, answer] = await Promise.all([
    instagramFacts(),
    askTwice(
      () =>
        within<QueueAnswer>(DATABASE_TIMEOUT_MS, () => askTheDatabase(now), {
          ok: false,
          error: "it did not answer in time",
        }),
      (result) => !result.ok
    ),
  ]);
  return {
    now: now.toISOString(),
    instagram,
    queue: answer.ok ? answer.facts : null,
    queueError: answer.ok ? undefined : answer.error,
    missingSettings: REQUIRED_SETTINGS.filter((s) => !s.value()).map((s) => s.name),
    memory: answer.ok ? answer.memory : NO_MEMORY,
  };
}

/* ─── Judging it ─── */

const DAY = 24 * 60 * 60 * 1000;

function wholeDaysBetween(from: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / DAY);
}

/* ─── Working days, because a weekend is not a wait ─── */

/** Southampton's calendar day for an instant, as whole days since 1970. */
function southamptonDayNumber(at: number): number {
  return Math.floor(Date.parse(`${localDateOf(new Date(at))}T12:00:00Z`) / DAY);
}

/** Sunday is 0, because 1 January 1970 was a Thursday. */
function isWeekendDay(day: number): boolean {
  const weekday = (((day + 4) % 7) + 7) % 7;
  return weekday === 0 || weekday === 6;
}

/**
 * Midnight in Southampton at the start of a calendar day, remembered.
 *
 * `instantOf` reads the time zone twice per call and the sweep in the tests
 * runs a month of mornings a couple of hundred times over. The answer for a
 * given day never changes, and there is one entry per calendar day.
 */
const southamptonMidnights = new Map<number, number>();
function southamptonDayStart(day: number): number {
  const known = southamptonMidnights.get(day);
  if (known !== undefined) return known;
  const at = instantOf(`${new Date(day * DAY).toISOString().slice(0, 10)}T00:00`).getTime();
  southamptonMidnights.set(day, at);
  return at;
}

/** Southampton's calendar date one day after this one, as "2026-09-20". */
function dayAfter(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + DAY).toISOString().slice(0, 10);
}

/** Nobody waits longer than this before every line has been crossed anyway. */
const LONGEST_WAIT_WORTH_COUNTING_DAYS = 400;

/**
 * Milliseconds of a span that fall on a Saturday or a Sunday in Southampton.
 *
 * The hour the clocks change is not corrected for. It would move an answer by
 * an hour, twice a year, against a line drawn at two days.
 */
function weekendMsBetween(from: number, to: number): number {
  if (to <= from) return 0;
  const first = southamptonDayNumber(from);
  const last = Math.min(southamptonDayNumber(to), first + LONGEST_WAIT_WORTH_COUNTING_DAYS);
  let total = 0;
  for (let day = first; day <= last; day += 1) {
    if (!isWeekendDay(day)) continue;
    const start = southamptonDayStart(day);
    const end = southamptonDayStart(day + 1);
    total += Math.max(0, Math.min(to, end) - Math.max(from, start));
  }
  return total;
}

/**
 * The moment the clock on a request starts running.
 *
 * The request itself, when it arrives during opening hours on a day the
 * atelier is open. Otherwise nine o'clock on the next morning it opens: a
 * request at half past seven on a Friday evening has had no chance of an
 * answer at all until Monday, and counting that weekend against Kristina is
 * what turned an ordinary month into an email every Monday.
 *
 * Exported so the tests can measure it rather than infer it from the count.
 */
export function answerClockStartsAt(arrived: Date): Date {
  if (!Number.isFinite(arrived.getTime())) return arrived;
  let date = localDateOf(arrived);
  let hour = southamptonHour(arrived);
  // A week and a day is more than enough to reach the next open morning from
  // anywhere; the bound is here so a broken date cannot spin.
  for (let step = 0; step < 8; step += 1) {
    if (!isWeekendDay(Math.floor(Date.parse(`${date}T12:00:00Z`) / DAY))) {
      if (hour < ATELIER_OPENS_AT) {
        return instantOf(`${date}T${String(ATELIER_OPENS_AT).padStart(2, "0")}:00`);
      }
      // Only reachable on the first pass — every later one arrives with the
      // hour set to the start of a fresh day and is caught above.
      if (hour < ATELIER_CLOSES_AT) return arrived;
    }
    date = dayAfter(date);
    hour = 0;
  }
  return arrived;
}

/**
 * How long a request has been waiting, counted the way the atelier works.
 *
 * Fractional on purpose: the cron fires a few minutes either side of nine, and
 * rounding here would make "two days" mean one thing on a fast morning and
 * another on a slow one.
 */
export function workingDaysWaiting(arrived: string, now: Date): number {
  const from = answerClockStartsAt(new Date(arrived)).getTime();
  const to = now.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return (to - from - weekendMsBetween(from, to)) / DAY;
}

export interface WaitingBookings {
  /** Past the line and still worth chasing her about */
  chasing: number;
  /** Past the line and past BOOKING_CHASE_STOPS_AFTER_DAYS: named, never loud */
  stale: number;
  /** Working days the oldest of the chased ones has waited */
  oldestWorkingDays: number;
  /** The same wait on a calendar, which is how the email says it */
  oldestCalendarDays: number;
}

/**
 * Which of the unanswered requests are worth saying something about.
 *
 * The query hands over everything past the calendar line; the two decisions
 * that matter are made here, where a test can reach them. One is the weekend
 * (see ATELIER_OPENS_AT), the other is the ceiling (see
 * BOOKING_CHASE_STOPS_AFTER_DAYS).
 *
 * The email counts calendar days and the judging counts working ones, and that
 * is deliberate rather than sloppy. "Waiting since Friday" is what Kristina
 * would say herself looking at the row; telling her a Friday request has been
 * waiting "one day" on a Wednesday would read as a mistake in the email.
 */
export function bookingsNeedingAnAnswer(arrivals: string[], now: Date): WaitingBookings {
  const waiting: WaitingBookings = {
    chasing: 0,
    stale: 0,
    oldestWorkingDays: 0,
    oldestCalendarDays: 0,
  };
  for (const at of arrivals) {
    const working = workingDaysWaiting(at, now);
    if (working < ANSWER_BOOKING_WITHIN_DAYS) continue;
    const calendar = wholeDaysBetween(at, now);
    if (calendar >= BOOKING_CHASE_STOPS_AFTER_DAYS) {
      waiting.stale += 1;
      continue;
    }
    waiting.chasing += 1;
    waiting.oldestWorkingDays = Math.max(waiting.oldestWorkingDays, working);
    waiting.oldestCalendarDays = Math.max(waiting.oldestCalendarDays, calendar);
  }
  return waiting;
}

/** A date the database gave us, as an instant, or null if there was not one. */
function whenever(iso: string | null): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
}

/**
 * Days between two Southampton calendar dates.
 *
 * Elapsed milliseconds are the wrong measure for "has a day passed": the cron
 * fires a few minutes either side of nine, so 1.998 days between two mornings
 * would round the wrong way and skip a day's reminder. Two mornings are one
 * day apart because they are two dates, whatever the clock did in between.
 */
function calendarDaysBetween(from: Date, to: Date): number {
  const start = Date.parse(`${localDateOf(from)}T00:00:00Z`);
  const end = Date.parse(`${localDateOf(to)}T00:00:00Z`);
  return Math.round((end - start) / DAY);
}

/** "27 September", the way a date is said out loud. */
function dayAndMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ATELIER_TIME_ZONE,
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

function posts(count: number): string {
  return count === 1 ? "one post is" : `${count} posts are`;
}

function daysAgo(count: number): string {
  if (count <= 0) return "today";
  if (count === 1) return "yesterday";
  return `${count} days ago`;
}

/**
 * The troubles worth remembering until tomorrow.
 *
 * Only the ones a single flaky answer can invent. They are written into this
 * morning's record so tomorrow's run can tell "Meta was down for five minutes"
 * from "the token is dead".
 */
export function troublesIn(facts: HealthFacts): string[] {
  const list: string[] = [];
  if (facts.instagram.configured && !facts.instagram.reachable) list.push(INSTAGRAM_UNREACHABLE);
  // Only at a shop that has posted before. One that never finished the setup
  // has a to-do, not a connection that has gone missing.
  if (!facts.instagram.configured && facts.queue?.lastPublishedAt != null) {
    list.push(INSTAGRAM_DISCONNECTED);
  }

  if (facts.queue) {
    const fault = publisherFault(facts);
    if (fault) list.push(publisherMark(fault));
  }
  // A morning the database would not answer carries nothing forward, and it
  // cannot: `gatherHealthFacts` hands back NO_MEMORY whenever the queue answer
  // failed, because the memory comes out of the same query as the queue. There
  // used to be a branch here that carried yesterday's publisher mark across a
  // blind morning, with a test standing over it — and neither could ever run
  // against facts the site itself produces. What it would have bought is one
  // morning's colour: a blind morning in the middle of a stall means the
  // morning after it is amber rather than red, because "for two mornings
  // running" cannot be said of a morning nobody saw. The evidence itself is
  // not lost — it is in the publisher's own record, which survives whatever
  // the watchman can or cannot read — and that is the difference from the
  // version this replaced, where a blind morning every fifth day kept a dead
  // publisher silent for ever.
  return list;
}

/**
 * A post that failed is already the reason the feed is quiet.
 *
 * Saying so once, with what Instagram said, beats a second line hunting for a
 * cause that has already been named — but only while it is this morning's
 * failure. The publisher never goes back to a failed post, it only picks up
 * approved ones, so it steps over the broken one and carries on: a failure
 * from last Tuesday cannot be why nothing went out at the weekend. Taken the
 * wide way, one failed post excused a week of silence, and a publisher that
 * died the day after a single failure stranded three approved posts behind an
 * email about the one that failed. A day is the same line the posting check
 * itself is drawn at: a failure older than the waiting it is meant to account
 * for accounts for none of it.
 */
function failureExplainsTheSilence(queue: QueueFacts, now: Date): boolean {
  const lastFailure = whenever(queue.lastFailureAt);
  return (
    queue.failedRecently > 0 && lastFailure !== null && now.getTime() - lastFailure <= DUE_LATE_MS
  );
}

/**
 * What is wrong with the publisher, asked of the publisher.
 *
 * `silent` — it has not run for hours, with posts sitting overdue. Nothing
 * will go out until whatever wakes it is put back.
 *
 * `not-sending` — it is running, and has put nothing on the feed for days
 * while posts sat overdue. Something between the queue and Instagram is
 * swallowing them.
 *
 * Null means there is nothing here to say: nothing is overdue, or the
 * publisher is running and sending, or the cause already has a line of its own
 * further up — Instagram not answering, or a post that failed this morning.
 */
export type PublisherFault = "silent" | "not-sending";

export function publisherFault(facts: HealthFacts): PublisherFault | null {
  const queue = facts.queue;
  // No post is a day overdue: there is nothing the publisher owes anyone, and
  // how deep the queue is decides nothing here, as it does nowhere else.
  if (!queue || queue.lateWaiting === 0) return null;
  const now = new Date(facts.now);
  const pulse = queue.publisherPulse;

  // No pulse has ever been written, and posts are a day overdue. A publisher
  // that has never once said it ran is a publisher nothing is waking: the
  // Cloudflare Worker was never deployed, or its schedule was removed. It is
  // not the "shop that has only just been born" case — that shop has nothing
  // approved and overdue, which is the gate two lines above — and it is not
  // Instagram either, because a run that finds Instagram disconnected still
  // writes down that it ran.
  const ranAt = pulse === null ? null : whenever(pulse.at);
  if (ranAt === null || now.getTime() - ranAt > PULSE_STALE_AFTER_HOURS * 60 * 60 * 1000) {
    return "silent";
  }

  // From here the publisher is demonstrably running, so anything still wrong
  // is about what comes out of it — and for that the causes above own the
  // sentence. A token that will not answer already explains an empty feed, and
  // blaming the pipeline as well sent Kristina hunting for a second fault that
  // did not exist. A dead pulse is not explained by either of them: the
  // schedule knocks whatever Instagram says, and a run that finds Instagram
  // disconnected still writes down that it ran.
  if (!facts.instagram.configured || !facts.instagram.reachable) return null;
  if (failureExplainsTheSilence(queue, now)) return null;

  // How long it has been since anything came out of it. A publisher that has
  // never sent is measured from the day its record was made, not from the
  // beginning of time: the record is written by the first run, not by the
  // first send, so `lastSentAt` is missing for the first fifteen minutes of
  // every shop's life and for as long afterwards as the rules hold it. Reading
  // that absence as an infinite silence sent a red email on the morning of the
  // deploy, at a shop where a post had gone out by hand two hours earlier.
  const sentAt = pulse === null ? null : whenever(pulse.lastSentAt);
  const idleSince = sentAt ?? (pulse === null ? null : whenever(pulse.createdAt));
  if (idleSince === null || now.getTime() - idleSince <= PUBLISHER_IDLE_DAYS * DAY) return null;

  // And the other half: it has to have been free to send in that time. A run
  // the rules held back is not evidence of anything — that is the rules
  // working — and until this was asked, a shop at the Studio's own defaults
  // where Kristina posts by hand in the morning was told every other day that
  // its publisher had stopped sending. Her post counts against the daily
  // number, so every run for the rest of the day is rightly held, and nothing
  // automatic goes out: twelve emails over forty-five days, half of them red,
  // at a shop with nothing wrong with it.
  //
  // The date is asked for rather than the last run's word, and that is the
  // whole of the difference. The word only describes whichever of the
  // ninety-six runs in a day the watchman happened to read: quiet hours that
  // run until eleven cover the hour the cron fires, so the last run always
  // says "quiet hours" whatever the ninety-five before it did, and reading
  // that word either way is a coin toss. The date cannot be sampled wrong. It
  // also means no list of hold kinds has to be kept in step with
  // postingRules.ts — quiet hours, the daily number, the gap between posts, a
  // post still on its way — because every one of them means the same thing
  // here: this run was never let near Instagram, so it proves nothing.
  const freeAt = pulse === null ? null : whenever(pulse.lastFreeAt);
  if (freeAt === null || freeAt <= idleSince) return null;

  return "not-sending";
}

/** The mark a fault leaves for tomorrow, so a second morning of it can be red. */
function publisherMark(fault: PublisherFault): string {
  return fault === "silent" ? PUBLISHER_SILENT : PUBLISHER_NOT_SENDING;
}

/**
 * What the publisher's last run said, in words rather than in its own word.
 *
 * The outcome is a label meant for this file — "held", "nothing-due" — and
 * printing it into the email would put the site's vocabulary in front of
 * somebody who has no reason to know it. Every other sentence here is written
 * to be acted on without asking anyone what it means, and this one is the most
 * useful of the lot: it is the difference between a rule holding posts back
 * and a queue the publisher cannot see.
 */
function lastRunSaid(pulse: PublisherPulse | null | undefined): string {
  switch (pulse?.outcome) {
    case "held":
      return "it was holding posts back for the quiet hours, the number a day, or the gap between posts";
    case "skipped":
      return `it stopped before it started: ${pulse.detail ?? "no reason given"}`;
    case "failed":
      return "a post would not go out";
    case "nothing-due":
      return "it found nothing to send, although the queue says otherwise";
    case "published":
      return "it sent something";
    default:
      return "nothing we could read";
  }
}

/** Whether the last look is recent enough to stand for yesterday morning. */
function lookIsRecent(memory: HealthMemory, now: Date): boolean {
  const lookedAt = whenever(memory.lookedAt);
  if (lookedAt === null) return false;
  return calendarDaysBetween(new Date(lookedAt), now) <= MEMORY_GOOD_FOR_DAYS;
}

/** Whether yesterday's look saw the same thing, so it is not a blip. */
function seenYesterdayToo(facts: HealthFacts, trouble: string): boolean {
  if (!lookIsRecent(facts.memory, new Date(facts.now))) return false;
  return facts.memory.troubles.includes(trouble);
}

/**
 * The whole judgement, as a pure function of the snapshot.
 *
 * Each check answers for one thing only, and a single cause must not light up
 * three lines — an Instagram that will not answer already explains why nothing
 * is being posted, so the posting check stays quiet about it.
 */
export function evaluateHealth(facts: HealthFacts): HealthCheck[] {
  const now = new Date(facts.now);
  const checks: HealthCheck[] = [];
  const ig = facts.instagram;
  const queue = facts.queue;
  const due = queue?.dueWaiting ?? 0;

  // Instagram, first: with this down nothing else about posting matters.
  if (!ig.configured) {
    // "Not connected" is two different situations and only one of them is a
    // breakage. A shop that has never posted is a shop where nobody has
    // finished the Instagram setup — a to-do, and nagging about it is how an
    // alert email becomes the one that gets filtered away. A shop that has
    // been posting and now has no token at all has lost a connection it had:
    // somebody removed IG_ACCESS_TOKEN, nothing will ever go out again, and
    // nothing says so anywhere. Note what this does not look at: how many
    // posts are waiting. The depth of the queue decides nothing here.
    //
    // A connection that has gone has exactly the consequences of a token that
    // died — nothing will ever go out again, and nothing anywhere says so — so
    // it ends up speaking as loudly. It used to be a warning for ever, which
    // came out as one yellow email a week about a dead pipeline: three and a
    // half times quieter than the dead token beside it, for the same damage.
    // The first morning stays a warning because somebody may simply be halfway
    // through a change in Vercel; the second morning running, it is a fault.
    const usedToPost = queue?.lastPublishedAt != null;
    const staysGone = usedToPost && seenYesterdayToo(facts, INSTAGRAM_DISCONNECTED);
    checks.push({
      name: "Instagram",
      status: usedToPost ? (staysGone ? "fail" : "warn") : "ok",
      detail: !usedToPost
        ? "Instagram is not connected, so nothing is being posted. Nothing ever has been from here, so nothing is being missed — connect it when the feed is ready to start."
        : staysGone
          ? "Instagram is not connected any more, and has not been for two mornings running — the token the site posts with has gone from its settings. Nothing has gone out since and nothing will, until the connection is made again in Meta and saved on the site."
          : "Instagram is not connected any more — the token the site posts with has gone from its settings. Nothing will go out until the connection is made again in Meta and saved on the site.",
    });
  } else if (!ig.reachable) {
    // Asked twice already — a second apart, which is nothing beside a Meta
    // rate limit that lasts minutes. So the first morning says nothing at all.
    // It writes the trouble down and leaves; tomorrow is what tells "Meta was
    // busy at nine" from "the token is dead". The version before this sent a
    // yellow email on the first morning whose own last sentence admitted there
    // might be nothing to do, so one wobble in the night was one email. The
    // price is a day's delay on a token that really has died. The gain is that
    // network weather never writes to her at all, and when the email does come
    // it is red and it is right.
    const confirmed = seenYesterdayToo(facts, INSTAGRAM_UNREACHABLE);
    checks.push({
      name: "Instagram",
      status: confirmed ? "fail" : "ok",
      detail: confirmed
        ? `Instagram will not let us post — nothing can go out until the connection is renewed. It has said the same for two mornings running, so this is not a passing wobble. Instagram said: ${ig.error ?? "nothing we could read"}.`
        : `Instagram did not answer this morning, so nothing may have gone out. Meta is busy for a few minutes often enough that one morning means nothing on its own — if it is still quiet tomorrow that is a fault and this will say so. Instagram said: ${ig.error ?? "nothing we could read"}.`,
    });
  } else {
    checks.push({
      name: "Instagram",
      status: "ok",
      detail: `Posting as ${ig.username ? `@${ig.username}` : "the shop account"}.`,
    });

    // The renewal date, asked for while everything still works rather than
    // after the posts have already stopped.
    if (!ig.expiryKnown) {
      checks.push({
        name: "Instagram renewal",
        status: "ok",
        detail:
          "Instagram answered today, so the connection works, but Meta will not say when it expires. These usually last about sixty days from the day they are made, and they stop without warning.",
      });
    } else if (ig.expiresAt == null) {
      checks.push({
        name: "Instagram renewal",
        status: "ok",
        detail: "The Instagram connection has no expiry date.",
      });
    } else {
      // Compared as instants, not as whole days. Counting days downwards made
      // a token with twenty-three hours left read as zero days left, and the
      // email announced a connection as dead on a morning it was still
      // posting. The day count is for the sentence only, and rounds up, so
      // the last day of a token's life reads "expires in one day".
      const expiresAt = new Date(ig.expiresAt);
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY);
      if (expiresAt.getTime() <= now.getTime()) {
        checks.push({
          name: "Instagram renewal",
          status: "fail",
          detail:
            "The Instagram connection has expired. Nothing can be posted until a new one is made in Meta and saved on the site.",
        });
      } else if (daysLeft <= RENEW_TOKEN_WITHIN_DAYS) {
        checks.push({
          name: "Instagram renewal",
          status: "warn",
          detail: `The Instagram connection expires in ${daysLeft === 1 ? "one day" : `${daysLeft} days`}, on ${dayAndMonth(ig.expiresAt)}. Posts stop going out that day unless it is renewed before then.`,
        });
      } else {
        checks.push({
          name: "Instagram renewal",
          status: "ok",
          detail: `The Instagram connection lasts until ${dayAndMonth(ig.expiresAt)}.`,
        });
      }
    }
  }

  if (!queue) {
    // No two-mornings rule here, unlike Instagram: the memory that rule needs
    // lives in the database that is not answering. The query was already
    // asked twice, seconds apart, which is the only second opinion available.
    // It also means this one line repeats every morning until it is fixed —
    // the right way round, since the alternative is a silent broken shop.
    //
    // And it says so, rather than simply arriving again. An email that repeats
    // without explanation is the one that gets skimmed and then filtered; the
    // same email saying "I cannot remember whether I already told you" is a
    // different thing to receive, and it is also the plain truth, because the
    // record of having said it is kept in the database that is not answering.
    checks.push({
      name: "Shop database",
      status: "fail",
      detail: `The shop's database did not answer, so this morning's checks on posts and settings could not be made, and nothing else here can be trusted this morning. It said: ${facts.queueError ?? "nothing"}. This will arrive again tomorrow if it is still quiet — what the site remembers about what it has already told you is kept in that same database, so it cannot know whether it has said this before.`,
    });
  } else {
    // Somebody is waiting for an answer — the one line here that is about a
    // person rather than about machinery, and the one the morning of
    // 5 September needed. Every other check on this page was green while a
    // fitting request sat unanswered for a fortnight, because from the outside
    // a request nobody has replied to looks exactly like one replied to five
    // minutes ago. See ANSWER_BOOKING_WITHIN_DAYS for the two numbers.
    //
    // No name, no address, no telephone number: this dataset is public and the
    // details are sealed (see @/lib/pii), so an email that carried them would
    // be the one place in the shop where they travel in the clear. It says how
    // many and how long, which is all that is needed to go and look.
    const unanswered = bookingsNeedingAnAnswer(queue.bookingsUnanswered, now);
    const waitedDays = unanswered.oldestCalendarDays;
    // Old rows are named but never shout — see BOOKING_CHASE_STOPS_AFTER_DAYS.
    const olderOnes =
      unanswered.stale === 0
        ? ""
        : ` ${unanswered.stale === 1 ? "One request" : `${unanswered.stale} requests`} from more than a fortnight ago ${unanswered.stale === 1 ? "was" : "were"} never marked in the Studio — worth tidying when you have a minute, but nobody is still waiting on ${unanswered.stale === 1 ? "it" : "them"}.`;
    checks.push({
      name: "Booking requests",
      status:
        unanswered.chasing === 0
          ? "ok"
          : unanswered.oldestWorkingDays >= BOOKING_WAIT_IS_SERIOUS_DAYS
            ? "fail"
            : "warn",
      tally: unanswered.chasing,
      detail:
        unanswered.chasing === 0
          ? `${unanswered.stale === 0 ? "Every fitting request has been answered." : "Nobody is waiting for an answer."}${olderOnes}`
          : `${unanswered.chasing === 1 ? "One fitting request has" : `${unanswered.chasing} fitting requests have`} had no answer, and the oldest has been waiting ${waitedDays === 1 ? "one day" : `${waitedDays} days`}. Open the Studio, go to "Atelier Bookings", and set each one to Confirmed or Can't make it — the customer is emailed either way the moment you do. Who they are is in the Studio; this email never carries a customer's details.${olderOnes}`,
    });

    const quiet = queue.lastPublishedAt ? wholeDaysBetween(queue.lastPublishedAt, now) : null;
    // Nothing has gone out for days, or nothing ever has. Wording only — this
    // raises no status and sends nothing; see QUIET_DAYS.
    const feedIdle = quiet === null || quiet >= QUIET_DAYS;
    checks.push({
      name: "Failed posts",
      status: queue.failedRecently > 0 ? "warn" : "ok",
      tally: queue.failedRecently,
      detail:
        queue.failedRecently > 0
          ? `${queue.failedRecently === 1 ? "One post" : `${queue.failedRecently} posts`} could not go out in the last ${FAILURES_WITHIN_DAYS} days. Instagram said: ${queue.lastFailureError ?? "nothing we could read"}. ${queue.failedRecently === 1 ? "It is" : "They are"} in the Studio under "Posts going out" with the reason on the post — fix the caption or the picture and set the status back to Approved.`
          : "No post has failed to go out.",
    });

    // Counted, never judged. This line is always "ok", whatever the numbers
    // say, and cannot raise the morning's status or send anything — see the
    // note at the top of the file. An empty queue is Kristina's own list in
    // the Studio, under "Posts to approve", and every threshold anyone chose
    // for it turned into a weekly reminder about her own to-do list. The
    // figures still come back in the cron's answer, so the state of the queue
    // can be read by anyone who goes looking for it.
    const datedForLater = queue.approvedWaiting - due;
    const waiting: string[] = [];
    if (queue.approvedWaiting > 0) {
      waiting.push(`${queue.approvedWaiting} approved`);
      if (datedForLater > 0) waiting.push(`${datedForLater} of them dated for later`);
    }
    if (queue.draftsWaiting > 0) {
      const drafts = queue.draftsWaiting === 1 ? "draft" : "drafts";
      waiting.push(`${queue.draftsWaiting} ${drafts} waiting`);
    }
    checks.push({
      name: "Posts waiting to go out",
      status: "ok",
      detail: waiting.length > 0 ? `${waiting.join(", ")}.` : "Nothing approved, no drafts waiting.",
    });

    // The site was handed something to publish and did not publish it, and the
    // publisher is the one thing that can say which of the two reasons it is.
    // Everything before this inferred it from the feed — days of silence, then
    // whether the feed moved between two mornings — and a feed moves for
    // reasons that have nothing to do with the schedule: a post Kristina sends
    // herself with "Post this now", a Reel resumeReels pushes through two days
    // late. Measured on that version: forty-five days with the publisher dead,
    // one post by hand each morning, forty-two approved posts stranded, and
    // forty-five green mornings. It is asked now, not inferred — see
    // publisherFault and PULSE_STALE_AFTER_HOURS.
    const overdue = queue.lateWaiting > 0;
    const fault = publisherFault(facts);
    // The second morning of the same fault is red, exactly as a vanished token
    // is. The damage is word for word the same — nothing more will go out, and
    // nothing anywhere says so — and while this stayed amber for ever it was
    // four times quieter than the dead token beside it. The first morning
    // stays amber because a deploy or an hour of Cloudflare trouble can cost a
    // publisher its morning; by the second it is not weather.
    const confirmed = fault !== null && seenYesterdayToo(facts, publisherMark(fault));

    if (fault !== null) {
      const held = queue.lateWaiting;
      const twoMornings = confirmed ? " It has looked the same for two mornings running." : "";
      checks.push({
        name: "Posting",
        status: confirmed ? "fail" : "warn",
        detail:
          fault === "silent"
            ? `The part of the site that sends posts has not run for ${PULSE_STALE_AFTER_HOURS} hours, and ${posts(held)} more than a day overdue. It is meant to run every fifteen minutes, so it has stopped being woken up, and nothing will go out by itself until it is — a post sent by hand does not clear the queue behind it.${twoMornings}`
            : `The part of the site that sends posts is running, but nothing has gone out from it for ${PUBLISHER_IDLE_DAYS} days, and ${posts(held)} more than a day overdue. It is being woken up and finding its way to the end of the run without sending anything; what it said last time was that ${lastRunSaid(queue.publisherPulse)}.${twoMornings} Anything that has appeared on Instagram in the meantime was put there by hand, and that does not clear the queue behind it.`,
      });
    } else if (quiet === null) {
      checks.push({ name: "Posting", status: "ok", detail: "Nothing has been posted yet." });
    } else if (feedIdle) {
      // Say which kind of "not a fault" this is. Printing "nothing is due to
      // go out" while three posts sat nine days overdue — silenced by a dead
      // token named two lines above — was a sentence that offered reassurance
      // about the very thing that had gone wrong.
      const why =
        due === 0
          ? "nothing is due to go out — a quiet feed rather than a fault"
          : overdue
            ? `${posts(due)} due to go out, for the reason given on one of the lines above`
            : `${posts(due)} due to go out, ${due === 1 ? "and it has" : "and the oldest has"} been waiting less than a day`;
      checks.push({
        name: "Posting",
        status: "ok",
        detail: `The last post went out ${daysAgo(quiet)}, and ${why}.`,
      });
    } else {
      checks.push({
        name: "Posting",
        status: "ok",
        detail: `The last post went out ${daysAgo(quiet)}.`,
      });
    }

    checks.push({
      name: "Stuck posts",
      status: queue.stuckPublishing > 0 ? "fail" : "ok",
      tally: queue.stuckPublishing,
      // Only posts with no Instagram container id count here. A Reel that has
      // one is picked up by resumeReels on every run, so calling it abandoned
      // was wrong twice over — and the old advice, "set the status back to
      // Approved", would have built a second container for a video that was
      // still publishing from the first. A duplicate post on the shop's feed
      // cannot be taken back, so the advice now matches the Studio's own:
      // look at Instagram before touching the status.
      detail:
        queue.stuckPublishing > 0
          ? `${queue.stuckPublishing === 1 ? "One post has" : `${queue.stuckPublishing} posts have`} been stuck halfway out for more than ${STUCK_AFTER_HOURS} hours, and nothing will move ${queue.stuckPublishing === 1 ? "it" : "them"} automatically. Open the Studio, go to "Posts going out", and check Instagram first: if the post is already there set it to Published, and only if it is not, set it back to Approved to try again.`
          : "No post is stuck on its way out.",
    });

    if (queue.waitingOnInstagram > 0) {
      // A day is slow but survivable, and saying so was a line whose own last
      // sentence admitted there was nothing to do — an email that teaches her
      // to skim the next one. One slow Reel was two of them in ten days, so a
      // day stays counted and never judged.
      //
      // Three days is the other thing entirely, and it used to be counted the
      // same way and therefore never said. A Reel Instagram accepted and never
      // finished is invisible to every other line here: it has a container id,
      // so it is not a stuck post; the other posts keep going out, so the feed
      // is not silent. Sixty days of one of those, measured: the post never
      // went out, nothing was ever wrong enough to say, and the only line
      // about it repeated that a day was "far longer than it should take". The
      // video needs replacing, and that is a thing to do, so it is now said.
      const abandoned = queue.reelsAbandoned;
      checks.push({
        name: "Videos with Instagram",
        status: abandoned > 0 ? "warn" : "ok",
        tally: abandoned > 0 ? abandoned : queue.waitingOnInstagram,
        detail:
          abandoned > 0
            ? `${abandoned === 1 ? "One video has" : `${abandoned} videos have`} been with Instagram for more than ${REEL_ABANDONED_AFTER_DAYS} days. Instagram only holds a video it has been given for about a day, so ${abandoned === 1 ? "it is" : "they are"} not still being prepared — ${abandoned === 1 ? "it" : "they"} will never arrive on ${abandoned === 1 ? "its" : "their"} own. Open the Studio, go to "Posts going out", and check Instagram first: if the video is already there set the post to Published, and only if it is not, put a different video on the post and set it back to Approved.`
            : `${queue.waitingOnInstagram === 1 ? "One video has" : `${queue.waitingOnInstagram} videos have`} been with Instagram for more than a day, still being prepared. The site asks again every fifteen minutes, so there is nothing to do yet — a day is far longer than it should take, and after ${REEL_ABANDONED_AFTER_DAYS} days this will say so and ask you to replace it.`,
      });
    }

    checks.push({
      name: "Studio settings",
      status: queue.settingsDocumentExists ? "ok" : "fail",
      detail: queue.settingsDocumentExists
        ? "The site is reading the Site Settings you edit in the Studio."
        : "The Site Settings document the Studio edits is missing, so the site has fallen back to an older copy and anything saved there may reach nobody.",
    });
  }

  const missing = REQUIRED_SETTINGS.filter((s) => facts.missingSettings.includes(s.name));
  checks.push({
    name: "Site settings",
    status: missing.length > 0 ? "fail" : "ok",
    detail:
      missing.length > 0
        ? `The site is missing ${missing.length === 1 ? "a setting it needs" : `${missing.length} settings it needs`}: ${missing
            .map((s) => `${s.name} (${s.consequence})`)
            .join("; ")}.`
        : "Every setting the site needs is in place.",
  });

  return checks;
}

/**
 * The names of every question this morning was able to ask — not only the ones
 * that produced a line.
 *
 * Tomorrow reads this to tell "that was fine yesterday" from "nobody could
 * look yesterday" (see HealthMemory.previousLooked), and taking it from the
 * checks themselves got the difference wrong for any check that disappears
 * along with its own zero. "Videos with Instagram" is only pushed when a video
 * is actually waiting, so on every clean morning its name was missing, and a
 * missing name reads as a trouble that ended. Measured: one video mended on
 * the Tuesday, a different one hung on the Thursday, and Thursday, Friday and
 * Saturday said nothing at all — the new video was never allowed to count as
 * news, because the name had never been crossed off. "Shop database" has the
 * same shape from the other end: it only speaks when it has bad news.
 *
 * Written out rather than derived, because the thing being recorded is which
 * questions were answerable, and that is a different list from the answers. A
 * test holds the two together: every name `evaluateHealth` can produce has to
 * appear here.
 */
export function questionsAsked(facts: HealthFacts): string[] {
  const asked = ["Instagram", "Shop database", "Site settings"];
  // Only worth asking of a token that answered — an unreachable one has no
  // expiry to read, and that morning genuinely did not find out.
  if (facts.instagram.configured && facts.instagram.reachable) asked.push("Instagram renewal");
  if (facts.queue) {
    asked.push(
      "Booking requests",
      "Failed posts",
      "Posts waiting to go out",
      "Posting",
      "Stuck posts",
      "Videos with Instagram",
      "Studio settings"
    );
  }
  return asked;
}

export async function checkSiteHealth(now: Date = new Date()): Promise<HealthCheck[]> {
  return evaluateHealth(await gatherHealthFacts(now));
}

/* ─── Telling somebody ─── */

const SEVERITY: Record<HealthStatus, number> = { fail: 0, warn: 1, ok: 2 };

function worstFirst(checks: HealthCheck[]): HealthCheck[] {
  return [...checks].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);
}

/** The first sentence of a detail, which is written to stand on its own. */
function headline(detail: string): string {
  const end = detail.search(/\.\s|\.$/);
  return (end === -1 ? detail : detail.slice(0, end)).trim();
}

/**
 * A subject line that says what happened, not that something happened.
 *
 * "Beautasy: something needs attention" is a subject that has to be opened
 * to be useful, which on a phone in a workshop means it is read tomorrow.
 * Plain text, never escaped — HTML escaping in a subject shows up as
 * "&#39;" in the inbox.
 */
export function alertSubject(problems: HealthCheck[]): string {
  if (problems.length === 0) return "Beautasy: all well";
  const worst = worstFirst(problems)[0];
  const rest = problems.length - 1;
  return `Beautasy: ${headline(worst.detail)}${rest > 0 ? ` (and ${rest} more)` : ""}`;
}

function alertEmailHtml(checks: HealthCheck[], now: Date): string {
  const problems = worstFirst(checks.filter((c) => c.status !== "ok"));
  const fine = checks.filter((c) => c.status === "ok").map((c) => c.name);
  const checkedAt = new Intl.DateTimeFormat("en-GB", {
    timeZone: ATELIER_TIME_ZONE,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  const items = problems
    .map(
      (problem) => `
      <div style="border-left:3px solid ${problem.status === "fail" ? "#b03a3a" : "#b08640"};padding-left:14px;margin:0 0 18px;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">${escapeHtml(problem.name)}</p>
        <p style="margin:6px 0 0;color:#3d3d3d;line-height:1.7;">${escapeHtml(problem.detail)}</p>
      </div>`
    )
    .join("");

  return `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy · daily check</p>
      <h1 style="font-size:22px;font-weight:400;color:#2d2d2d;margin:8px 0 4px;">
        ${problems.length === 1 ? "One thing needs a look" : `${problems.length} things need a look`}
      </h1>
      <p style="margin:0 0 20px;font-size:12px;color:#8a8a8a;">Checked ${escapeHtml(checkedAt)}</p>
      ${items}
      ${
        fine.length > 0
          ? `<p style="margin:0;font-size:12px;color:#8a8a8a;line-height:1.6;">Fine this morning: ${escapeHtml(fine.join(", "))}.</p>`
          : ""
      }
      <p style="margin:24px 0 0;font-size:11px;color:#aaa;">This only arrives when something needs doing. No email means everything passed.</p>
    </div>`;
}

/**
 * What this morning's email was about, in the form tomorrow compares against.
 *
 * Names and worst severity, not the sentences: a token warning whose wording
 * counts down from fourteen days changes every morning, and comparing text
 * would make every morning look like fresh news.
 *
 * Checks that count things carry their count alongside the name, written as
 * "Failed posts ×3". Without it a publisher that broke one more post every
 * day was the same two words every morning, so the second failure, and the
 * third, were silenced as "already told her" for a week.
 */
const TALLY_MARK = " ×";

function fingerprintOf(check: HealthCheck): string {
  return check.tally === undefined ? check.name : `${check.name}${TALLY_MARK}${check.tally}`;
}

/** Reads back what `fingerprintOf` wrote, including last week's plain names. */
function readFingerprint(entry: string): { name: string; tally: number } {
  const at = entry.lastIndexOf(TALLY_MARK);
  const tally = at === -1 ? Number.NaN : Number(entry.slice(at + TALLY_MARK.length));
  return Number.isFinite(tally) ? { name: entry.slice(0, at), tally } : { name: entry, tally: 0 };
}

export function alertFingerprint(problems: HealthCheck[]): {
  problems: string[];
  worst: HealthStatus;
} {
  return {
    problems: [...new Set(problems.map(fingerprintOf))].sort(),
    worst: problems.some((p) => p.status === "fail") ? "fail" : "warn",
  };
}

/**
 * Whether this morning's news is worth an email.
 *
 * The first version of this asked "have we already written today?", which
 * stopped two emails on one morning and nothing else: a token fourteen days
 * from expiry meant fourteen identical mornings, and an empty queue meant one
 * every day forever. The question is not what day it is, it is whether
 * Kristina has already been told this.
 *
 * "Told this" is asymmetric, and comparing two sets as equal-or-not got both
 * halves wrong. A morning with something new in it, or more of something she
 * already knows about, is news. A morning with less wrong with it than the
 * last one is not: a check that flickers off and on beside a standing fault
 * used to send an email on every flicker, and a problem going away was read
 * as a change and sent as news.
 *
 * The last email is not enough to answer it, either. Between that email and
 * this morning there may have been mornings with nothing wrong at all, and
 * those mornings are the whole difference between a problem she never fixed
 * and the same problem happening again. Measured, with only the email
 * remembered: five posts failed on the Monday and she was told; by the
 * Wednesday she had mended every one; on the Friday three different posts went
 * down, and the watchman said nothing until the following Monday, because
 * "Failed posts" was a name she had already heard. So yesterday morning's list
 * is read as well, and a name missing from it is a trouble that ended — what
 * comes back under that name afterwards is new, and counts up from nothing.
 */
export function alertDecision(
  problems: HealthCheck[],
  memory: HealthMemory,
  now: Date
): { send: boolean; reason?: string } {
  if (problems.length === 0) return { send: false, reason: "Nothing is wrong" };

  const last = memory.lastEmail;
  if (!last) return { send: true };

  const fingerprint = alertFingerprint(problems);
  const told = new Map(last.problems.map(readFingerprint).map(({ name, tally }) => [name, tally]));
  const today = fingerprint.problems.map(readFingerprint);

  // What she was told, less anything that had already gone away by yesterday
  // morning. Only a recent look can say that: with no run for days there is no
  // clean morning to point at, and the last email is all there is to go on.
  //
  // And only a question yesterday actually asked. A name missing from
  // yesterday's problems means the trouble had ended — unless yesterday could
  // not look. Meta busy for five minutes at nine leaves no "Instagram renewal"
  // line at all, a database that says nothing leaves none of the four lines
  // about posts, and reading either silence as "it was fine yesterday" turned
  // one unchanging warning into an email every second or third morning.
  if (lookIsRecent(memory, now)) {
    const yesterday = new Set(memory.previousProblems.map((entry) => readFingerprint(entry).name));
    const asked = new Set(memory.previousLooked);
    for (const name of [...told.keys()]) if (!yesterday.has(name) && asked.has(name)) told.delete(name);
  }

  // Something she has not been told about at all — unless the morning that
  // last wrote to her could not ask about it. An email sent on a morning when
  // the database said nothing lists only the one line that morning could see,
  // and reading everything missing from it as fresh news is how a database
  // that went quiet every third morning turned two unchanged problems into an
  // email every day. A name that morning could not reach falls through to the
  // rules below instead, which is the repeat rhythm it would have had anyway.
  // An empty `looked` is a record from before the field existed, and suppresses
  // nothing.
  const lastEmailCouldNotAsk = (name: string) =>
    last.looked.length > 0 && !last.looked.includes(name);
  if (today.some(({ name }) => !told.has(name) && !lastEmailCouldNotAsk(name))) {
    return { send: true };
  }
  // The same trouble, and more of it: three failed posts where there was one.
  if (today.some(({ name, tally }) => tally > (told.get(name) ?? 0))) return { send: true };
  // The same problems, and one of them has turned red since. That is news —
  // the other direction, red going amber, is a morning that improved.
  if (fingerprint.worst === "fail" && last.worst !== "fail") return { send: true };

  const daysSince = calendarDaysBetween(new Date(last.at), now);
  const repeatAfter = REPEAT_AFTER_DAYS[fingerprint.worst === "fail" ? "fail" : "warn"];
  if (daysSince >= repeatAfter) return { send: true };

  return {
    send: false,
    reason: `The same ${fingerprint.worst === "fail" ? "fault" : "warning"} was sent ${daysAgo(daysSince)}`,
  };
}

/**
 * One record a morning, and the id is the date.
 *
 * Sanity refuses a `create` for an id that exists, which makes "has this
 * morning already been dealt with?" a single atomic question instead of a read
 * followed by a write that two callers can both pass. The document doubles as
 * the memory: what was wrong, whether an email went out, and which troubles
 * tomorrow should treat as confirmed rather than as a blip.
 *
 * `claimThenSend` is the usual tool for this, but it claims a field on a
 * document that already exists, and a morning report is attached to nothing.
 * The deterministic id does the same job, the way slot bookings do it.
 */
export function healthAlertDocumentId(now: Date): string {
  return `siteHealthAlert-${localDateOf(now)}`;
}

export interface MorningRecord {
  checkedAt: string;
  problems: string[];
  worst?: HealthStatus;
  emailed: boolean;
  troubles: string[];
  /**
   * The names of every question this morning managed to ask, wrong answers and
   * right ones alike. Tomorrow needs it to tell "that was fine yesterday" from
   * "nobody could look yesterday" — see HealthMemory.previousLooked.
   */
  looked: string[];
}

/**
 * What a refused write means, and the one judgement worth getting right here.
 *
 * Only a conflict means the morning was genuinely claimed by another run.
 * Reading every error as "already done" is how this went permanently silent
 * in testing: rotate SANITY_API_WRITE_TOKEN to a wrong value and the database
 * check fails, the watchman tries to shout, the create is refused with 401,
 * and the refusal is read as "already reported today" — no email that
 * morning, nor any morning after, in exactly the situation the whole file
 * exists for. A refusal we do not understand means the morning was not
 * written down, and an unwritten morning must still be able to send: one
 * duplicate email beats permanent silence.
 */
export function claimOutcome(error: unknown): "taken" | "not-written-down" {
  const said = error as { statusCode?: number; response?: { statusCode?: number } } | null;
  const conflict = said?.statusCode === 409 || said?.response?.statusCode === 409;
  return conflict ? "taken" : "not-written-down";
}

/**
 * How the claim went: ours to write on, another run's, or nowhere at all.
 *
 * The third of those used to be swallowed. A refused write was logged with
 * `console.error` and reported back as a claim that succeeded, so the watchman
 * carried on as if the morning had been recorded. Measured: a
 * SANITY_API_WRITE_TOKEN with its write rights taken away — reads all fine,
 * every write a 401 — gave thirty days of green mornings and not one email,
 * while the consequence is the one REQUIRED_SETTINGS writes out beside that
 * key in full: bookings, orders and posts all stall. The watchman could see it
 * and threw the answer away.
 */
export type MorningClaim = "ours" | "taken" | "not-written-down";

/**
 * Claim this morning, and say whether it was ours to claim.
 *
 * `write` stands in for the one call to Sanity so a test can refuse the claim
 * with a real Sanity error and watch what the watchman does next, rather than
 * read the source and hope.
 */
export async function claimThisMorning(
  id: string,
  record: MorningRecord,
  write: (document: Record<string, unknown>) => Promise<unknown> = (document) =>
    sanityWriteClient.create(document as never)
): Promise<MorningClaim> {
  // With no write token there is nowhere to record that we looked — and a
  // missing write token is precisely the silent breakage this email exists to
  // report. It is reported by name, with its consequence, on the "Site
  // settings" line of the very email this is about to send, so saying it a
  // second time here would only be the same news twice. The job runs once a
  // day, so the cost of sending unguarded is one extra email if somebody
  // re-runs the cron by hand.
  if (!process.env.SANITY_API_WRITE_TOKEN) return "ours";

  try {
    await write({ _id: id, _type: "siteHealthAlert", ...record });
    return "ours";
  } catch (error) {
    if (claimOutcome(error) === "taken") return "taken";
    console.error(`Could not write down this morning's health check (${id}):`, error);
    return "not-written-down";
  }
}

async function forgetThisMorning(id: string): Promise<void> {
  if (!process.env.SANITY_API_WRITE_TOKEN) return;
  try {
    await sanityWriteClient.delete(id);
  } catch (error) {
    console.error(`Could not hand back this morning's health alert (${id}):`, error);
  }
}

/**
 * The morning's email, through the shop's one sender.
 *
 * `sendEmail` reads Resend's answer and throws a reason when the email was
 * refused — the thing this file worked out first, and the reason the whole
 * shop now shares one implementation of it (see @/lib/sendEmail). Nothing is
 * returned, so the reading below has nothing to find: what it is left standing
 * over is the seam. `deps.send` is what a test hands in, it is free to answer
 * in whichever of the two real shapes the test is about, and if the check in
 * `telling` were dropped the seam could answer "refused" and the watchman
 * would call the morning told.
 */
async function sendAlertEmail(message: { subject: string; html: string }): Promise<unknown> {
  await sendEmail({
    from: FROM_EMAIL,
    to: KRISTINA_EMAIL,
    subject: message.subject,
    html: message.html,
  });
  return null;
}

/**
 * The line that says the shop cannot write anything down.
 *
 * It is added after the claim rather than judged with everything else, because
 * the only honest way to know whether Sanity will take a write is to try one,
 * and the write the watchman already makes every morning is the try. It says
 * out loud that it will arrive again tomorrow, and why: with nothing written
 * down there is no memory of having said it, so the rule that keeps this email
 * rare (REPEAT_AFTER_DAYS) has nothing to stand on. Measured, it is thirty
 * emails in thirty days — which is the right number for a shop that cannot
 * record a booking, an order or a post, as long as the email says so instead
 * of being the same silent repeat for the thirtieth time.
 */
const CANNOT_WRITE: HealthCheck = {
  name: "Writing things down",
  status: "fail",
  detail:
    "The shop's database would not accept anything written to it this morning, so nothing can be saved: bookings, orders and posts will all stall, and they will fail quietly. The most likely cause is SANITY_API_WRITE_TOKEN — it still reads, so it has lost its write permission or been replaced with a read-only one. This will arrive every morning until it is fixed, because with nothing saved the site cannot remember having told you.",
};

/** Everything the watchdog touches outside itself, so a test can stand in for it. */
export interface WatchdogDeps {
  now?: Date;
  /** The snapshot, clock included, so a test can pin the day and the expiry */
  facts?: (now: Date) => Promise<HealthFacts>;
  /** Whether this morning was ours to write on, another run's, or unwritable */
  claimMorning?: (id: string, record: MorningRecord) => Promise<MorningClaim>;
  forgetMorning?: (id: string) => Promise<void>;
  send?: (message: { subject: string; html: string }) => Promise<unknown>;
  /** The clock the email's deadline is measured against — see Countdown */
  countdown?: Countdown;
}

export interface WatchdogResult {
  checks: HealthCheck[];
  alerted: boolean;
  /** Why no email went out, when something was wrong but nothing was sent */
  skipped?: string;
}

export async function runHealthWatchdog(deps: WatchdogDeps = {}): Promise<WatchdogResult> {
  const now = deps.now ?? new Date();
  const facts = await (deps.facts ?? gatherHealthFacts)(now);
  const checks = evaluateHealth(facts);
  const troubles = troublesIn(facts);
  // Which questions this morning managed to ask, answered well or badly. A
  // morning where Meta or the database said nothing asks fewer of them than a
  // morning where everything was fine, and tomorrow has to be able to tell
  // those apart — see HealthMemory.previousLooked and questionsAsked.
  const looked = questionsAsked(facts);

  const id = healthAlertDocumentId(now);
  const claim = deps.claimMorning ?? claimThisMorning;

  // The one breakage that cannot be reported, and it is worth being plain
  // about rather than pretending otherwise. RESEND_API_KEY going missing stops
  // every email the shop sends — orders, bookings, and this one with it — so
  // the morning is written down, the "Site settings" line above says so in
  // full, and it reaches nobody. It comes back in the cron's answer and
  // nowhere else. Telling her would need a second way of speaking that does
  // not go through Resend, which is a bigger thing than this file.
  const cannotSend = !deps.send && !process.env.RESEND_API_KEY;

  const problems = checks.filter((c) => c.status !== "ok");
  const fingerprint = alertFingerprint(problems);
  const decision =
    problems.length === 0
      ? { send: false, reason: "Nothing is wrong" }
      : alertDecision(problems, facts.memory, now);
  const sending = decision.send && !cannotSend;

  // Claimed once, whichever way the morning went, and the answer is read three
  // ways. A green morning is written down too: tomorrow has to be able to tell
  // "Instagram was unreachable yesterday as well" from "it recovered and has
  // broken again", and a missing record cannot say which.
  const claimed = await claim(id, {
    checkedAt: facts.now,
    problems: fingerprint.problems,
    ...(sending ? { worst: fingerprint.worst } : {}),
    emailed: sending,
    troubles,
    looked,
  });

  if (claimed === "taken") {
    // The morning was claimed by another run — a hand re-run of a cron that
    // fires once at nine. One email a morning is the cap, whichever run wins.
    return { checks, alerted: false, skipped: "Already looked at this morning" };
  }

  if (claimed === "not-written-down") {
    // Nothing reached the database, so there is no record to correct, no
    // memory to compare against, and nothing to hand back if the email fails.
    // The refusal joins the list and the judgement is made again with it in,
    // which is what turns a green morning into a red one when the only thing
    // wrong is that nothing can be saved. No second opinion is asked of
    // `alertDecision` here: a record saying "nothing can be written down"
    // cannot itself have been written down, so it is always a name she has not
    // been told about, and the answer is always to say it.
    const all = [...checks, CANNOT_WRITE];
    if (cannotSend) {
      return { checks: all, alerted: false, skipped: "No email key, so nobody can be told" };
    }
    return telling(all, all.filter((c) => c.status !== "ok"), false, deps, now, id);
  }

  if (problems.length === 0) return { checks, alerted: false };
  if (cannotSend) {
    return { checks, alerted: false, skipped: "No email key, so nobody can be told" };
  }
  if (!decision.send) return { checks, alerted: false, skipped: decision.reason };
  return telling(checks, problems, true, deps, now, id);
}

/**
 * Send the one email, and hand the morning back if it did not go.
 *
 * `written` says whether there is a claim to hand back at all: on a morning
 * the database refused the write, nothing was recorded, so there is nothing to
 * delete and the delete would be refused as well.
 */
async function telling(
  checks: HealthCheck[],
  problems: HealthCheck[],
  written: boolean,
  deps: WatchdogDeps,
  now: Date,
  id: string
): Promise<WatchdogResult> {
  let delivered = false;
  let whyNot = "The email could not be sent";
  try {
    // Capped, unlike the claim above it. The claim has to be waited out
    // because a write we stopped waiting for may still land and a second run
    // would then guess wrong about whether it had already written. The email
    // is the other way round: it was already claimed as sent a line ago, so
    // waiting for ever is what turns one hung request into two silent days.
    delivered = await within(
      EMAIL_TIMEOUT_MS,
      async () => {
        const answer = await (deps.send ?? sendAlertEmail)({
          subject: alertSubject(problems),
          html: alertEmailHtml(checks, now),
        });
        // Answering is not the same as sending — see `refusedTheEmail`. The
        // real sender has already thrown by this point; what is left to guard
        // is `deps.send`, which a test hands in and which can answer in either
        // shape the real Resend produces.
        const refused = refusedTheEmail(answer);
        if (refused) throw new Error(refused);
        return true;
      },
      false,
      deps.countdown
    );
    if (!delivered) {
      whyNot = "The email was not sent in time";
      console.error("Resend did not answer in time, so this morning is being handed back");
    }
  } catch (error) {
    whyNot = `The email could not be sent: ${error instanceof Error ? error.message : "no reason given"}`;
    console.error("Could not send the daily health email:", error);
  }
  if (delivered) return { checks, alerted: true };

  // Hand the morning back, so a re-run can try again rather than staying
  // silent about a morning nobody was ever told about. The memory of this
  // morning goes with it, which is the cheaper of the two mistakes.
  if (written) await (deps.forgetMorning ?? forgetThisMorning)(id);
  return { checks, alerted: false, skipped: whyNot };
}
