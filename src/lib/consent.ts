/**
 * Cookie consent: one store, one spelling.
 *
 * Three files need to agree on this — the banner writes the choice, the Meta
 * Pixel waits for it, and the inline consent-default script in the layout reads
 * it before anything else runs. They each used to carry their own copy of the
 * storage key and the event name, and the banner dispatched the event as a bare
 * string rather than the constant the pixel exported. Renaming either value
 * would have type-checked cleanly and quietly stopped consent from ever
 * reaching the pixel, which is the sort of break nobody notices until the ad
 * numbers look wrong.
 *
 * The choice lives in localStorage because it has to survive a reload, and the
 * event exists because localStorage has no change notification within a tab.
 * Together they behave as an external store, which is what lets components read
 * consent with `useSyncExternalStore` instead of mirroring it into state.
 */

/**
 * Storage key. This is a contract with browsers that already visited the shop:
 * change it and every past visitor silently loses their answer and is asked
 * again, so treat a rename as a migration, not a tidy-up.
 */
export const CONSENT_KEY = "beautasy-cookie-consent";

/** Fired on `window` whenever the stored choice changes. */
export const CONSENT_EVENT = "beautasy-consent-changed";

export type ConsentChoice = "granted" | "denied";

/** The stored choice, or null when the visitor hasn't answered the banner yet. */
export function readConsent(): ConsentChoice | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    // Private mode or storage disabled: treat it as "not answered".
    return null;
  }
}

/**
 * Whether advertising and analytics cookies may be used.
 *
 * Only an explicit yes counts. No answer, a refusal, unreadable storage or a
 * value we don't recognise all mean no.
 */
export function hasConsent(): boolean {
  return readConsent() === "granted";
}

/**
 * Record the visitor's choice and tell the current page about it.
 *
 * A storage failure is not fatal: the announcement still goes out, so tags on
 * this page react immediately, and the banner simply asks again next visit.
 */
export function writeConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    /* private mode — the banner will simply ask again next visit */
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Fired on `window` when someone asks to see the cookie choice again. */
export const CONSENT_REOPEN_EVENT = "beautasy-consent-reopen";

/**
 * Show the banner again — "Cookie settings" in the footer. Taking a yes back
 * has to be as easy as giving it, and the privacy policy points here.
 */
export function reopenConsent(): void {
  window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT));
}

/** Cookies Google Analytics, Google Ads and the Meta Pixel set after a yes. */
const TRACKING_COOKIE = /^(_ga|_gid$|_gat|_gcl_|_fbp$|_fbc$)/;

/**
 * After a yes turns into a no, take away the cookies the tags already left.
 *
 * Google writes _ga on the widest domain it can (".beautasy.co.uk" from
 * www), and a cookie is only removed by naming the domain it was set on, so
 * every suffix of the host is tried; a browser ignores the ones that can't
 * hold cookies, such as "co.uk". Returns the names it found.
 */
export function clearTrackingCookies(
  doc: Pick<Document, "cookie"> = document,
  host: string = window.location.hostname
): string[] {
  const names = doc.cookie
    .split(";")
    .map((pair) => pair.split("=")[0].trim())
    .filter((name) => TRACKING_COOKIE.test(name));
  const labels = host.split(".");
  const domains: (string | undefined)[] = [undefined, ...labels.map((_, i) => labels.slice(i).join("."))];
  for (const name of names) {
    for (const domain of domains) {
      doc.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
    }
  }
  return names;
}

/** Subscribe to consent changes. Shaped for `useSyncExternalStore`. */
export function subscribeToConsent(onStoreChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onStoreChange);
  return () => window.removeEventListener(CONSENT_EVENT, onStoreChange);
}

/**
 * Server snapshot for `useSyncExternalStore`. There is no localStorage on the
 * server, so consent is never assumed — which is also what keeps the server
 * HTML and the first client render in step.
 */
export const noConsentOnServer = (): boolean => false;
