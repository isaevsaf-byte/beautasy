import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_KEY,
  CONSENT_EVENT,
  readConsent,
  hasConsent,
  writeConsent,
  subscribeToConsent,
  noConsentOnServer,
} from "./consent";

/**
 * The consent store is browser state, so the browser bits it touches —
 * localStorage and the window event target — are stood up here. Both are read
 * lazily inside the functions, so installing them per test is enough.
 */
class FakeStorage {
  private items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.has(key) ? (this.items.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

/** Storage that refuses everything, the way a locked-down private mode does. */
const hostileStorage = {
  getItem(): string {
    throw new Error("storage disabled");
  },
  setItem(): void {
    throw new Error("storage disabled");
  },
};

function install(storage: unknown): void {
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: new EventTarget(),
    configurable: true,
    writable: true,
  });
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  install(storage);
});

test("a visitor who hasn't answered the banner has not consented", () => {
  assert.equal(readConsent(), null);
  assert.equal(hasConsent(), false);
});

test("only an explicit yes grants consent", () => {
  storage.setItem(CONSENT_KEY, "granted");
  assert.equal(hasConsent(), true);

  storage.setItem(CONSENT_KEY, "denied");
  assert.equal(hasConsent(), false);
});

test("a value we don't recognise counts as no answer, not as consent", () => {
  storage.setItem(CONSENT_KEY, "yes please");
  assert.equal(readConsent(), null);
  assert.equal(hasConsent(), false);
});

test("recording a choice persists it and announces it", () => {
  let announcements = 0;
  subscribeToConsent(() => {
    announcements += 1;
  });

  writeConsent("granted");

  assert.equal(storage.getItem(CONSENT_KEY), "granted");
  assert.equal(hasConsent(), true);
  assert.equal(announcements, 1, "the pixel is only told once per choice");
});

test("changing the answer later is announced again and takes effect", () => {
  const seen: boolean[] = [];
  subscribeToConsent(() => seen.push(hasConsent()));

  writeConsent("granted");
  writeConsent("denied");

  assert.deepEqual(seen, [true, false]);
  assert.equal(hasConsent(), false);
});

test("unsubscribing stops the updates", () => {
  let announcements = 0;
  const unsubscribe = subscribeToConsent(() => {
    announcements += 1;
  });

  writeConsent("granted");
  unsubscribe();
  writeConsent("denied");

  assert.equal(announcements, 1, "no updates after unsubscribe");
});

test("storage that throws denies consent rather than crashing the page", () => {
  install(hostileStorage);

  assert.equal(readConsent(), null);
  assert.equal(hasConsent(), false);
});

test("a choice that cannot be stored is still announced to this page", () => {
  install(hostileStorage);
  let announcements = 0;
  subscribeToConsent(() => {
    announcements += 1;
  });

  // Private mode: nothing survives the reload, but the tags on the page the
  // visitor is looking at must still react to the answer they just gave.
  assert.doesNotThrow(() => writeConsent("granted"));
  assert.equal(announcements, 1);
});

test("the stored value is exactly what the layout's inline script looks for", () => {
  // The consent-default script in src/app/layout.tsx runs before React and so
  // reads these by literal. Renaming either constant without editing that
  // script would type-check and still break consent, so pin both.
  assert.equal(CONSENT_KEY, "beautasy-cookie-consent");
  assert.equal(CONSENT_EVENT, "beautasy-consent-changed");
});

test("the server never assumes consent", () => {
  assert.equal(noConsentOnServer(), false);
});
