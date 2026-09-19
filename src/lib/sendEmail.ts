import { Resend } from "resend";

/**
 * The one way an email leaves this shop, and the one place that reads the
 * answer Resend gives back.
 *
 * Every send in the project used to be `await resend.emails.send(…)` inside a
 * try/catch, and every one of them treated "the promise did not throw" as "the
 * email went out". The SDK does not work that way. `emails.send` resolves
 * whatever happens: a refusal comes back as `{ data: null, error: { name,
 * message, statusCode } }`, and the SDK wraps its own fetch, so even a network
 * failure is turned into a resolved object rather than an exception
 * (resend/dist/index.mjs, `fetchRequest`). The only exception it has is the
 * constructor's, for a missing API key, which is about starting up rather than
 * about delivery. So fifteen catch blocks were guarding against nothing: a
 * revoked key, an unverified beautasy.co.uk, a 429 or any 5xx read exactly
 * like a delivered email, and six of those places wrote "told" onto a document
 * afterwards, which is what makes a lost email lost for good.
 *
 * What that cost, in the one case that is not hypothetical: a fitting request
 * arrived on 5 September, the notification to Kristina was refused, the
 * handler recorded that it had emailed her — which switched off the very guard
 * that would have answered the customer with "please WhatsApp us instead" —
 * and a person waited a fortnight for a reply nobody knew was owed.
 *
 * So: one sender, it reads the answer, and it throws with a reason when Resend
 * would not take the email. Callers keep the behaviour they had. Where a
 * failure was best-effort it stays best-effort, but best-effort now means a
 * logged reason instead of silence, and every place that marks a document as
 * told can tell a refusal from a delivery.
 */

/**
 * Everything a message needs, and nothing else.
 *
 * Deliberately small. `react` is the one other thing `emails.send` can throw
 * from — it renders the template before the request — and no email here uses
 * it; they are all built as HTML strings by their own module. Keeping it out
 * of the type keeps the promise above true: what comes back from this call is
 * an answer, never an exception, unless the answer says no.
 */
export interface EmailMessage {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
}

/** The single call to Resend — a seam, so a test can answer in either real shape. */
export type Deliver = (message: EmailMessage) => Promise<unknown>;

/**
 * An email address, anywhere in a string, replaced by the fact that there was
 * one.
 *
 * Reasons from Resend end up in the Vercel logs and in the cron's answer, and
 * this dataset is public, which is why every address in Sanity is sealed (see
 * @/lib/pii). A refusal about a recipient is exactly the kind of message that
 * might quote the recipient, and an address that only leaks when something
 * breaks is still an address that leaks.
 */
function withoutAddresses(reason: string): string {
  return reason.replace(/[^\s<>(),;:"]+@[^\s<>(),;:"]+/g, "an address");
}

/**
 * Whether Resend took the email, or only answered about it.
 *
 * Returns null when it did, and a reason a person can read when it did not.
 * `unknown` in, because this is also pointed at test seams and at whatever a
 * caller's own sender hands back; `statusCode` is deliberately not read, since
 * the name and the message are always there and the code can be null — it is
 * null for every local failure, which is the noisiest case.
 *
 * This lived in siteHealth.ts, where the watchdog was the only place in the
 * shop that read the answer at all. It is here now so that there is one
 * implementation rather than one good example and fifteen call sites that
 * never heard about it.
 */
export function refusedTheEmail(answer: unknown): string | null {
  const said = answer as { error?: { message?: string; name?: string } | null } | null;
  if (!said?.error) return null;
  return withoutAddresses(
    said.error.message ?? said.error.name ?? "Resend would not take the email"
  );
}

/** Hands the message to Resend. Throws only for a missing key — see the note at the top. */
export async function viaResend(message: EmailMessage): Promise<unknown> {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send(message);
}

/**
 * How long one email may take before the caller stops waiting.
 *
 * The version before this one had no cap and said so on purpose: giving up on
 * a request that may still have been delivered is how a person gets told twice
 * that their parcel has arrived. The reasoning was right and the arithmetic
 * was wrong. `emails.send` goes through a bare `fetch` with no `AbortSignal`
 * (resend/dist/index.mjs, `fetchRequest`), so with nothing here a socket that
 * opens and then goes quiet runs to undici's own default of five minutes,
 * while `src/app/api/cron/daily/route.ts` gives the whole morning sixty
 * seconds. So one hung send does not spend "that request's minute" — it spends
 * every other job's minute too, and then Vercel kills the function mid-flight.
 *
 * That is the worse of the two mornings, and it is worse because of the very
 * thing this change added: `claimThenSend` marks the document BEFORE the send,
 * and the line that hands the claim back is never reached by a function that
 * has been killed. One hung socket leaves an order, a booking or a stock alert
 * marked as told for ever — the loss the whole change exists to stop, reached
 * more easily than the duplicate the missing cap was protecting against.
 *
 * Twenty seconds, and the price of that number said plainly: we stop waiting,
 * Resend may have taken the email anyway, the claim goes back, and tomorrow
 * sends a second copy. That is the same trade made everywhere else here — a
 * second "your parcel is on its way" is an awkward email, a parcel nobody was
 * ever told about is a customer gone. Twenty is long enough that a slow but
 * healthy Resend is never cut off, and short enough that two of them in a row
 * still leave the morning time to finish and write down what it did.
 *
 * One honest limit: this stops the caller waiting, not the request. The SDK
 * gives no way to abort the fetch, so the socket stays open until the function
 * ends. What is bought is the time budget, which is the thing being lost.
 */
export const SEND_TIMEOUT_MS = 20_000;

/**
 * The answer, or a refusal of our own once we have waited long enough.
 *
 * The abandoned promise gets an empty catch because it may still reject after
 * the race is over, and an unhandled rejection in a Vercel function is a
 * process-level crash that takes the rest of the morning's jobs with it.
 */
async function answeredWithin(answer: Promise<unknown>, ms: number): Promise<unknown> {
  answer.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      answer,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`The mail service did not answer within ${Math.round(ms / 1000)} seconds`)
            ),
          ms
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send one email, and throw if the mail service would not take it.
 *
 * The thrown reason is Resend's own, with any address stripped out of it. The
 * subject deliberately does not go in — several of them carry a customer's
 * name — so callers add their own context, which is a document id.
 */
export async function sendEmail(
  message: EmailMessage,
  deliver: Deliver = viaResend,
  timeoutMs: number = SEND_TIMEOUT_MS
): Promise<void> {
  const refused = refusedTheEmail(await answeredWithin(deliver(message), timeoutMs));
  if (refused) throw new Error(refused);
}
