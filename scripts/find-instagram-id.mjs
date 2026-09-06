#!/usr/bin/env node
/**
 * Finds IG_USER_ID, and says whether a token can actually publish.
 *
 * The Instagram business account id is the one value the Meta app dashboard
 * never shows you: it lives behind the Page, and the only way to it is a
 * request. This walks that path — token → Pages → the Instagram account on
 * each Page — and prints what to paste into Vercel.
 *
 * Run it with the token in the environment, so it is never in your shell
 * history and never in this repository:
 *
 *   META_TOKEN='EAA...' node scripts/find-instagram-id.mjs
 *
 * It only reads. It publishes nothing and changes nothing.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const token = process.env.META_TOKEN;

if (!token) {
  console.error(`
  Paste the token into the command rather than the file:

    META_TOKEN='EAA...' node scripts/find-instagram-id.mjs
`);
  process.exit(1);
}

async function graph(path, fields) {
  const url = new URL(`${GRAPH}/${path}`);
  if (fields) url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Graph returned ${res.status}`);
  return body;
}

const REQUIRED = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
];

try {
  // What the token is actually allowed to do — the usual reason publishing
  // fails is a permission nobody granted, not a wrong id.
  let granted = [];
  try {
    // debug_token asks about a token, so the token is both subject and key
    const url = new URL(`${GRAPH}/debug_token`);
    url.searchParams.set("input_token", token);
    url.searchParams.set("access_token", token);
    const res = await fetch(url);
    const info = (await res.json())?.data ?? {};
    // A rejected token comes back empty; saying "expires: never" about it
    // would be the most confident wrong answer this script could give.
    if (info.type || info.scopes) {
      granted = info.scopes ?? [];
      const expires = info.expires_at;
      console.log(`\n  Token type: ${info.type ?? "unknown"}`);
      console.log(
        `  Expires:    ${
          !expires ? "never — this is the one you want" : new Date(expires * 1000).toLocaleString("en-GB")
        }`
      );
    }
  } catch {
    console.log("\n  (could not read the token's own details — carrying on)");
  }

  if (granted.length) {
    const missing = REQUIRED.filter((s) => !granted.includes(s));
    console.log(`  Permissions: ${granted.join(", ")}`);
    if (missing.length) {
      console.log(`\n  ⚠ Missing, publishing will fail: ${missing.join(", ")}`);
    }
  }

  const pages = (await graph("me/accounts", "id,name,instagram_business_account{id,username}"))?.data ?? [];

  if (pages.length === 0) {
    console.log(`
  No Facebook Pages on this token.

  Instagram publishing goes through a Page, so one has to exist, the token
  has to have access to it, and the Instagram account has to be linked to
  it in Business settings.
`);
    process.exit(1);
  }

  console.log("");
  let found = 0;
  for (const page of pages) {
    const ig = page.instagram_business_account;
    console.log(`  Page: ${page.name} (${page.id})`);
    if (!ig) {
      console.log("    └─ no Instagram business account linked to this Page\n");
      continue;
    }
    found++;
    console.log(`    └─ Instagram: @${ig.username ?? "?"}`);
    console.log(`\n  ── Put these in Vercel ──`);
    console.log(`  IG_USER_ID          = ${ig.id}`);
    console.log(`  META_ACCESS_TOKEN   = the token you just used`);
    console.log(`  (IG_ACCESS_TOKEN is only needed if you want a separate one)\n`);
  }

  if (found === 0) {
    console.log(`
  A Page was found but no Instagram account is attached to it.

  Business settings → Accounts → Instagram accounts → add the account and
  connect it to the Page. The account also has to be a Business or Creator
  account, not a personal one.
`);
    process.exit(1);
  }
} catch (error) {
  console.error(`\n  Meta said: ${error.message}\n`);
  process.exit(1);
}
