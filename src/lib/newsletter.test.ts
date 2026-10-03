import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signatureMatches, unsubscribeHeaders, unsubscribeUrl, unsubscribePageHtml, welcomeEmailHtml } from "./newsletter";

before(() => {
  process.env.DATA_SECRET = "test-secret-for-the-suite";
});

test("a subscriber's own link unsubscribes them, and nobody else", () => {
  const url = new URL(unsubscribeUrl("subscriber-abc123", "https://www.beautasy.co.uk"));
  assert.equal(url.pathname, "/api/newsletter/unsubscribe");
  const id = url.searchParams.get("id");
  const sig = url.searchParams.get("sig");
  assert.equal(signatureMatches(id, sig), true);

  assert.equal(signatureMatches("subscriber-someone-else", sig), false, "changing the id must not work");
  assert.equal(signatureMatches(id, `${sig?.slice(0, -1)}0`), false);
  assert.equal(signatureMatches(id, null), false);
  assert.equal(signatureMatches(null, sig), false);
});

test("without the key nothing is accepted, rather than everything", () => {
  const sig = new URL(unsubscribeUrl("subscriber-abc123")).searchParams.get("sig");
  const saved = process.env.DATA_SECRET;
  delete process.env.DATA_SECRET;
  try {
    assert.equal(signatureMatches("subscriber-abc123", sig), false);
  } finally {
    process.env.DATA_SECRET = saved;
  }
});

test("the welcome email carries a working unsubscribe link", () => {
  const link = unsubscribeUrl("subscriber-abc123");
  const html = welcomeEmailHtml("WELCOME-AB12", link);
  assert.ok(html.includes(link.replace(/&/g, "&amp;")), "the link itself, in the footer");
  assert.match(html, />unsubscribe<\/a>/);
  assert.doesNotMatch(html, /to unsubscribe, reply to this email/);
});

test("opening the link only asks; the button is what unsubscribes", () => {
  const page = unsubscribePageHtml("confirm", "/api/newsletter/unsubscribe?id=a&sig=b");
  assert.match(page, /<form method="post"/);
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "newsletter", "unsubscribe", "route.ts"), "utf8");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.doesNotMatch(get, /\.patch\(|unsubscribed: true/, "mail scanners open every link: a GET must change nothing");
  const postBody = route.slice(route.indexOf("export async function POST"));
  assert.ok(postBody.indexOf("signatureMatches(") < postBody.indexOf("unsubscribed: true"), "check the signature first");
  assert.match(postBody, /_type == "subscriber" && _id == \$id/, "only a subscriber document is ever touched");
});

test("signing up does not hand the welcome code back to whoever asked", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "newsletter", "route.ts"), "utf8");
  assert.doesNotMatch(route, /NextResponse\.json\(\{[^}]*\bcode\b[^}]*\}/, "the code is emailed, not returned");
  assert.match(route, /welcomeEmailHtml\(code, unsubscribeUrl\(subscriber\._id\)\)/);
});

test("a back-in-stock email can be answered", () => {
  const source = readFileSync(join(process.cwd(), "src", "lib", "stockAlerts.ts"), "utf8");
  assert.match(source, /replyTo: KRISTINA_EMAIL,/);
  assert.match(source, /const KRISTINA_EMAIL = "hello@beautasy\.co\.uk";/);
});

test("the welcome email's headers carry the way out, so a mail app can offer it as a button", () => {
  const headers = unsubscribeHeaders("subscriber-abc123", "https://www.beautasy.co.uk");
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const [https, mailto, ...rest] = headers["List-Unsubscribe"].split(", ");
  assert.deepEqual(rest, []);
  assert.equal(mailto, "<mailto:hello@beautasy.co.uk?subject=unsubscribe>");

  // The https one is the subscriber's own signed link, the one the footer has
  assert.match(https, /^<https:\/\/www\.beautasy\.co\.uk\/api\/newsletter\/unsubscribe\?id=.+>$/);
  const url = new URL(https.slice(1, -1));
  assert.equal(url.toString(), unsubscribeUrl("subscriber-abc123", "https://www.beautasy.co.uk"));
  assert.equal(signatureMatches(url.searchParams.get("id"), url.searchParams.get("sig")), true);

  // One click is a POST to that link, which is the request that unsubscribes
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "newsletter", "unsubscribe", "route.ts"), "utf8");
  assert.match(route.slice(route.indexOf("export async function POST")), /unsubscribed: true/);

  const signup = readFileSync(join(process.cwd(), "src", "app", "api", "newsletter", "route.ts"), "utf8");
  assert.match(signup, /headers: unsubscribeHeaders\(subscriber\._id\),/);
});
