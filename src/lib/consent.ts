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
