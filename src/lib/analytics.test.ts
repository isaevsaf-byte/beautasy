import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTACT_CLICK_ENDPOINT,
  contactTapOf,
  isStudioPath,
  listenForContactTaps,
  thirdPartyTagsAllowed,
  trackContactClick,
} from "./analytics";

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");

/* ─── No Google or Meta in the Studio ─── */

test("the Studio is known however its address is written", () => {
  for (const path of ["/studio", "/studio/", "/studio/desk", "/studio/structure/order;abc", "//studio", "/%73tudio", "/studio?x=1", "/Studio", null, undefined]) {
    assert.equal(isStudioPath(path), true, `${path} was not taken for the Studio`);
    assert.equal(thirdPartyTagsAllowed(path), false, `third-party tags would run on ${path}`);
  }
});

test("everywhere else the tags still run", () => {
  for (const path of ["/", "/atelier", "/shop/silk-slip", "/studios", "/studio-guide", "/alterations/studio-flat-curtains", "/%E0%A4%A"]) {
    assert.equal(thirdPartyTagsAllowed(path), true, `${path} lost its analytics`);
  }
});

/**
 * The Studio shows customers' contact details and the takings, and Google's
 * and Meta's scripts have no business on its pages. The components cannot be
 * rendered under plain node (they read the router), so this reads them: the
 * scripts are each behind the path check, which is the only thing keeping
 * them off the Studio's pages. (What it cannot do is keep the Studio's login
 * token from them; see the next test but one.)
 */
test("Google's tag and the Meta Pixel are rendered only where third-party tags are allowed", () => {
  const site = read("src", "components", "SiteAnalytics.tsx");
  assert.match(site, /const tagsAllowed = thirdPartyTagsAllowed\(pathname\);/);
  assert.match(site, /\{tagsAllowed && <GoogleTags \/>\}/);
  assert.equal((site.match(/googletagmanager\.com\/gtag\/js/g) ?? []).length, 1, "one gtag.js, inside GoogleTags");
  const tags = site.slice(site.indexOf("function GoogleTags()"), site.indexOf("export default function SiteAnalytics"));
  assert.match(tags, /googletagmanager\.com\/gtag\/js/, "gtag.js is loaded from inside the gated component");
  assert.match(tags, /gtag\('config', '\$\{GOOGLE_ADS_ID\}'\);/);
  assert.match(site, /if \(!tagsAllowed && haveThirdPartyTagsStarted\(\)\) window\.location\.reload\(\);/);

  const pixel = read("src", "components", "MetaPixel.tsx");
  assert.match(pixel, /const allowed = consented && thirdPartyTagsAllowed\(pathname\);/);
  assert.match(pixel, /if \(!allowed\) return null;/);
  assert.ok(pixel.indexOf("if (!allowed) return null;") < pixel.indexOf("connect.facebook.net"));
});

/**
 * 🚨 Said plainly, because the earlier comments said otherwise: keeping the
 * tags off /studio does not keep the Studio's login token out of their reach.
 * The Studio keeps the token in localStorage, which belongs to the whole of
 * www.beautasy.co.uk rather than to a path, and gtag.js loads on every other
 * page. A reader who believed the comments would think the token was safe
 * from a rogue third-party script and stop looking; it is not, until the
 * Studio has an origin of its own.
 */
test("nothing claims the path check keeps the Studio's token away from Google's or Meta's scripts", () => {
  const sources = {
    analytics: read("src", "lib", "analytics.ts"),
    siteAnalytics: read("src", "components", "SiteAnalytics.tsx"),
    metaPixel: read("src", "components", "MetaPixel.tsx"),
  };
  for (const [name, source] of Object.entries(sources)) {
    const flat = source.replace(/\s*\n\s*\*\s*/g, " ");
    assert.doesNotMatch(flat, /(on the same page|on the page) can read it|could read it like any script on the page/, `${name} says the token is only readable on the Studio's own page`);
    assert.match(flat, /every page of www\.beautasy\.co\.uk/, `${name} says whose localStorage it is`);
  }
  const flat = sources.analytics.replace(/\s*\n\s*\*\s*/g, " ");
  assert.match(flat, /does NOT do: keep the Studio's login token out of their reach/);
  assert.match(flat, /an origin of its own/, "and names the way out");
});

test("gtag.js waits for the page instead of competing with it, and consent stays as it was", () => {
  const site = read("src", "components", "SiteAnalytics.tsx");
  // afterInteractive makes Next put a high-priority <link rel=preload> for it in the head
  assert.match(site, /<Script src=\{`https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=\$\{GA4_ID\}`\} strategy="lazyOnload" \/>/);
  assert.doesNotMatch(site, /src=[^>]*strategy="(afterInteractive|beforeInteractive)"/);
  assert.doesNotMatch(site, /gtag\('consent'/, "consent belongs to the layout's default script, which runs first");
});

test("the layout leaves Google's tags to SiteAnalytics, so the Studio never gets them", () => {
  const layout = read("src", "app", "layout.tsx");
  // A second copy here would load gtag.js on every page, the Studio included
  assert.doesNotMatch(layout, /googletagmanager\.com\/gtag\/js|gtag\('config'/);
  assert.match(layout, /<Script id="google-consent-default" strategy="beforeInteractive">/);
});

/* ─── Taps on WhatsApp and the phone ─── */

function element(href: string | null) {
  return { closest: (selector: string) => (selector === "a[href]" && href !== null ? { getAttribute: () => href } : null) };
}

test("a tap is read from the link it landed on or inside", () => {
  assert.equal(contactTapOf(element("https://wa.me/447729741116?text=Hi")), "whatsapp");
  assert.equal(contactTapOf(element("tel:+447729741116")), "phone");
  assert.equal(contactTapOf(element("https://wa.me/?text=my-link")), null, "a friend sharing a link");
  assert.equal(contactTapOf(element(null)), null, "not inside a link");
  assert.equal(contactTapOf({}), null, "a text node or a window");
  assert.equal(contactTapOf(null), null);
});

function fakeDocument() {
  const listeners: { type: string; listener: (event: { target: unknown }) => void; capture: boolean }[] = [];
  return {
    listeners,
    addEventListener(type: "click", listener: (event: { target: unknown }) => void, capture: boolean) {
      listeners.push({ type, listener, capture });
    },
    removeEventListener(type: "click", listener: (event: { target: unknown }) => void) {
      const at = listeners.findIndex((l) => l.type === type && l.listener === listener);
      if (at !== -1) listeners.splice(at, 1);
    },
    click(target: unknown) {
      for (const l of [...listeners]) l.listener({ target });
    },
  };
}

test("one listener counts every contact tap on the site, and none in the Studio", () => {
  const doc = fakeDocument();
  let path = "/atelier";
  const reported: [string, string][] = [];
  const stop = listenForContactTaps(doc, () => path, (method, at) => reported.push([method, at]));

  assert.equal(doc.listeners.length, 1);
  assert.equal(doc.listeners[0].capture, true, "on the way down, so no component can stop it first");

  doc.click(element("https://wa.me/447729741116"));
  doc.click(element("/shop"));
  doc.click(element("tel:+447729741116"));
  path = "/studio/desk";
  doc.click(element("https://wa.me/447729741116"));
  assert.deepEqual(reported, [
    ["whatsapp", "/atelier"],
    ["phone", "/atelier"],
  ]);

  stop();
  assert.equal(doc.listeners.length, 0, "stops listening when the page goes");
});

test("a tap goes to Google if it is there, and to the site's own tally either way", () => {
  const beacons: [string, string][] = [];
  const events: unknown[][] = [];
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const g = globalThis as unknown as { window?: unknown };
  const realWindow = g.window;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { sendBeacon: (url: string, body: string) => (beacons.push([url, body]), true) },
  });
  g.window = { gtag: (...args: unknown[]) => events.push(args) };
  try {
    trackContactClick("whatsapp", "/alterations/wedding-dress-southampton?utm_campaign=group-12");
    assert.deepEqual(events, [["event", "contact", { method: "whatsapp", page_bucket: "alterations" }]]);
    assert.deepEqual(beacons, [[CONTACT_CLICK_ENDPOINT, JSON.stringify({ method: "whatsapp", page: "alterations" })]]);

    // No Google (a blocker, or before it loads): still counted
    g.window = {};
    trackContactClick("phone", "/");
    assert.equal(beacons.length, 2);
    assert.equal(beacons[1][1], JSON.stringify({ method: "phone", page: "home" }));

    // A browser that throws on the beacon: the link must still work
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        sendBeacon: () => {
          throw new Error("blocked");
        },
      },
    });
    assert.doesNotThrow(() => trackContactClick("phone", "/contact"));
  } finally {
    if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
    g.window = realWindow;
  }
});

test("the site listens for taps from the layout's analytics component", () => {
  const site = read("src", "components", "SiteAnalytics.tsx");
  assert.match(site, /useEffect\(\(\) => listenForContactTaps\(document, \(\) => window\.location\.pathname\), \[\]\);/);
});
