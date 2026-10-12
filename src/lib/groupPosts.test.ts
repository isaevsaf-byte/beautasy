import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FRESH_WORK,
  POSTED_WORK,
  WEEKDAYS,
  groupPost,
  groupSlug,
  groupStatus,
  isFacebookGroupUrl,
  londonDay,
  pieceStory,
  type FacebookGroup,
  type PostablePiece,
} from "./groupPosts";
import { LOCAL_SERVICES } from "./localServices";
import { groupCode, shortLinkTarget } from "./shortLinks";

/**
 * Which Facebook groups allow a post today, and the post for each. Nothing
 * here posts anything — Facebook allows no site to — so what has to be right
 * is the calendar (a group's day, its spacing, Southampton's clock) and the
 * words (true, current prices, a link that names the group).
 */

const MONDAY = new Date("2026-09-28T19:00:00Z"); // 8pm in Southampton
const SATURDAY = new Date("2026-10-03T10:00:00Z");
const group = (rules: Partial<FacebookGroup> = {}): FacebookGroup => ({ name: "Southampton Mums", ...rules });

/* ─── The calendar ─── */

test("a day is Southampton's day, either side of the clocks going back", () => {
  assert.equal(londonDay(new Date("2026-09-28T23:30:00Z")), "2026-09-29", "half past midnight in summer time");
  assert.equal(londonDay(new Date("2026-10-25T23:30:00Z")), "2026-10-25", "half past eleven once the clocks go back");
});

test("a group with no rules and no posts yet allows one today", () => {
  const status = groupStatus(group(), MONDAY);
  assert.equal(status.state, "today");
  assert.equal(status.next, "2026-09-28");
  assert.match(status.why, /в любой день/);
});

test("a group that allows adverts on Saturdays only waits for Saturday", () => {
  const saturdays = group({ days: ["sat"] });
  const monday = groupStatus(saturdays, MONDAY);
  assert.equal(monday.state, "later");
  assert.equal(monday.next, "2026-10-03");
  assert.match(monday.why, /только по дням: сб/);
  assert.equal(groupStatus(saturdays, SATURDAY).state, "today");
});

test("a group asks for space between posts, counted in Southampton days", () => {
  const weekly = group({ everyDays: 7, lastPostedAt: "2026-09-24T09:00:00Z" });
  const status = groupStatus(weekly, MONDAY);
  assert.equal(status.state, "later");
  assert.equal(status.next, "2026-10-01", "a week after Thursday");
  assert.match(status.why, /4 дня назад.*раза в 7 дней/);
  assert.equal(groupStatus(weekly, new Date("2026-10-01T08:00:00Z")).state, "today");

  // Both rules at once: a week on, and a Saturday
  assert.equal(groupStatus(group({ days: ["sat"], lastPostedAt: "2026-10-03T10:00:00Z" }), SATURDAY).why, "Сегодня уже опубликовано");
  assert.equal(groupStatus(group({ days: ["sat"], lastPostedAt: "2026-10-03T10:00:00Z" }), SATURDAY).next, "2026-10-10");
});

test("a paused group, or a spacing nobody set, never breaks the list", () => {
  assert.deepEqual(groupStatus(group({ active: false }), MONDAY), { state: "paused", next: null, why: "На паузе" });
  // A blank or silly spacing is a week; an unknown day is ignored
  assert.equal(groupStatus(group({ everyDays: 0, lastPostedAt: "2026-09-25T09:00:00Z" }), MONDAY).next, "2026-10-02");
  assert.equal(groupStatus(group({ days: ["someday"] }), MONDAY).state, "today");
});

test("the Studio offers every day of the week, Monday first", () => {
  assert.deepEqual(
    WEEKDAYS.map((day) => day.value),
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  );
});

/* ─── The words ─── */

test("a post introduces Kristina in the group's own area, quotes the page's prices, and names the group in its link", () => {
  const post = groupPost(group({ area: "Shirley" }), MONDAY);
  const service = LOCAL_SERVICES.find((s) => s.slug === post.service);
  assert.ok(service, "a real service");
  assert.match(post.text, /I'm Kristina, a seamstress here in Shirley\./);
  assert.ok(post.text.includes(`${service.prices[0].name} ${service.prices[0].price}`), "the price as the page gives it");
  // The short link, coded from the group (here by its name: the fixture has no id) — see shortLinks.test.ts
  assert.match(post.link ?? "", /^https:\/\/www\.beautasy\.co\.uk\/g\/[a-z]+\/[a-z2-9]{3}$/);
  assert.equal(post.shown, post.link!.replace("https://", ""));
  assert.ok(post.text.endsWith(`\n${post.shown}`), "the link closes the post, on its own line");
  assert.doesNotMatch(post.text, /utm_|https:\/\//, "no tags and no scheme in what she pastes");
  assert.doesNotMatch(post.text, /undefined|null|NaN/);
  assert.match(groupPost(group(), MONDAY).text, /here in Southampton\./, "no area: Southampton");
});

test("a group that allows no links gets WhatsApp instead", () => {
  const post = groupPost(group({ links: false }), MONDAY);
  assert.equal(post.link, null);
  assert.doesNotMatch(post.text, /https?:\/\//);
  assert.match(post.text, /WhatsApp 07729 741116/);
});

test("the job turns with the weeks, and two groups on one day don't carry the same words", () => {
  const weeks = Array.from({ length: 6 }, (_, i) => groupPost(group(), new Date(MONDAY.getTime() + i * 7 * 86_400_000)).service);
  assert.equal(new Set(weeks).size, 6, "six weeks, six different jobs");
  const names = ["Southampton Mums", "Shirley Community", "Hedge End Noticeboard", "Portswood Neighbours"];
  const texts = names.map((name) => groupPost(group({ name }), MONDAY).text);
  assert.equal(new Set(texts).size, names.length);
});

/* ─── The links ─── */

test("only a link to a Facebook group is taken as one", () => {
  for (const good of [
    "https://www.facebook.com/groups/southamptonmums",
    "https://facebook.com/groups/1234567890/",
    "https://m.facebook.com/groups/shirleycommunity?ref=share",
  ]) {
    assert.equal(isFacebookGroupUrl(good), true, good);
  }
  for (const bad of [
    "http://www.facebook.com/groups/southamptonmums",
    "https://www.facebook.com/beautasy",
    "https://www.facebook.com/groups/",
    "https://facebook.com.example.com/groups/x",
    "https://nextdoor.co.uk/groups/x",
    "",
    null,
  ]) {
    assert.equal(isFacebookGroupUrl(bad), false, String(bad));
  }
});

test("a group's name becomes a plain slug for its link", () => {
  assert.equal(groupSlug("Southampton Mums & Dads!"), "southampton-mums-dads");
  assert.equal(groupSlug("Café Shirley"), "cafe-shirley");
  assert.equal(groupSlug("✨✨"), "group");
  assert.ok(groupSlug("A very long group name that goes on and on and on forever").length <= 40);
});

/* ─── Fresh work from the gallery (12.10.2026) ─── */

const CURTAINS: PostablePiece = {
  id: "workPiece-grey-eyelet-curtains",
  title: "Lined eyelet curtains, taken up",
  caption:
    "Too long and pooling on the floor. Measured, taken up and rehung — now these lined curtains hang in even folds that just touch it. Shown from the front and from the lining side.",
  category: "home",
  service: "curtains-and-home-southampton",
  date: "2026-09-27",
  beforeAfter: true,
  pictured: true,
};
const QUILT: PostablePiece = {
  id: "workPiece-nursery-quilt",
  title: "A patchwork quilt for a nursery",
  caption: "Mustard yellow, mint stripes and little safari prints, pieced square by square and quilted into something to keep.",
  category: "made",
  date: "2026-09-26",
  beforeAfter: false,
  pictured: true,
};
const withId = (rules: Partial<FacebookGroup> = {}) => group({ _id: "facebookGroup-southampton-mums", ...rules });

test("a fresh piece the group hasn't seen becomes today's post, told from its own caption", () => {
  const post = groupPost(withId({ area: "Shirley" }), MONDAY, [QUILT, CURTAINS]);
  assert.equal(post.kind, "work");
  assert.equal(post.piece, CURTAINS.id, "a before and after first");
  assert.match(post.text, /^(A before and after from my workroom ✨|Before and after 🪡)\n\n/);
  assert.ok(post.text.includes("Too long and pooling on the floor. Measured, taken up and rehung"), "her own words");
  assert.doesNotMatch(post.text, /Shown from the front/, "the gallery's note on the photos stays on the gallery");
  assert.match(post.text, /I'm Kristina, a seamstress here in Shirley\. Have something like this waiting\? Send me a photo 🤍\n/);
  assert.equal(post.card, "/cards/work/grey-eyelet-curtains.jpg");
  assert.equal(post.service, "curtains-and-home-southampton");

  // The link opens the piece's page, tagged with the group — see shortLinks.test.ts
  assert.equal(post.shown, `www.beautasy.co.uk/g/w/grey-eyelet-curtains/${groupCode("facebookGroup-southampton-mums")}`);
  assert.ok(post.text.endsWith(`\n${post.shown}`), "the link closes the post, on its own line");
  const target = new URL(shortLinkTarget(new URL(post.link!).pathname)!, "https://www.beautasy.co.uk");
  assert.equal(target.pathname, "/work/grey-eyelet-curtains");
  assert.equal(target.searchParams.get("utm_campaign"), `fb-${groupCode("facebookGroup-southampton-mums")}`);

  assert.doesNotMatch(post.text, /utm_|https:\/\/|undefined|null|NaN|£/, "no tags, no scheme, no made-up price");
  assert.ok((post.text.match(/\p{Extended_Pictographic}/gu) ?? []).length <= 2, "two emoji at most");
});

test("a piece made from scratch asks about making one, and the gallery's third person is left out", () => {
  const post = groupPost(withId(), MONDAY, [QUILT]);
  assert.equal(post.piece, QUILT.id);
  assert.match(post.text, /^(Fresh from my sewing table 🪡|A recent one from my workroom ✨)\n\n/, "no before and after promised");
  assert.match(post.text, /Would you like something made for you\? Send me a message 🤍/);

  assert.equal(
    pieceStory({ title: "A quilted pouch", caption: "Boxy, padded and quilted. Kristina holds it up beside her sewing machine." }),
    "Boxy, padded and quilted."
  );
  assert.equal(pieceStory({ title: "Hems by hand!", caption: "This is Kristina." }), "Hems by hand.", "nothing left: the title");
  assert.equal(pieceStory({ title: "Hems", caption: "One. Two. Three." }), "One. Two.", "two sentences at most");
});

test("a group that allows no links gets WhatsApp, and the card to attach by hand", () => {
  const post = groupPost(withId({ links: false }), MONDAY, [CURTAINS]);
  assert.equal(post.kind, "work");
  assert.equal(post.link, null);
  assert.doesNotMatch(post.text, /https?:\/\/|beautasy\.co\.uk/);
  assert.match(post.text, /Message me here or on WhatsApp 07729 741116 with a photo 🤍$/);
  assert.equal(post.card, "/cards/work/grey-eyelet-curtains.jpg");
  assert.equal(groupPost(withId(), MONDAY).card, null, "a service post has no card");
});

test("a piece goes to a group once, and only a fresh piece from the atelier's side of the room", () => {
  const posted = withId({ postedWork: [{ piece: CURTAINS.id, at: "2026-09-10T10:00:00Z" }], lastPostedAt: "2026-09-18T10:00:00Z" });
  assert.equal(groupPost(posted, MONDAY, [CURTAINS, QUILT]).piece, QUILT.id, "the curtains were shown here");
  assert.equal(groupPost(posted, MONDAY, [CURTAINS]).kind, "service", "nothing new: the job with its prices");

  const kind = (piece: Partial<PostablePiece>) => groupPost(withId(), MONDAY, [{ ...CURTAINS, ...piece }]).kind;
  assert.equal(kind({ date: "2026-08-28" }), "service", "older than a month");
  assert.equal(kind({ date: "2026-08-29" }), "work", "a month to the day");
  assert.equal(kind({ date: "2026-10-01" }), "service", "dated in the future: not yet");
  assert.equal(kind({ date: "2026-09-27T21:30:00Z" }), "work", "a created time counts by Southampton's day");
  assert.equal(kind({ id: `drafts.${CURTAINS.id}` }), "service", "a draft is not on the site");
  assert.equal(kind({ category: "workroom" }), "service");
  assert.equal(kind({ category: "accessories" }), "service");
  assert.equal(kind({ pictured: false }), "service", "a card with no picture says nothing");
  assert.match(FRESH_WORK, /_type == "workPiece" && !\(_id in path\("drafts\.\*\*"\)\)/, "published pieces only");
  assert.match(POSTED_WORK, /"piece": piece\._ref/);
});

test("a piece every other post at most, and once a week, so the prices still come round", () => {
  // Last week's post here was a piece: this week, the job and its prices
  const afterWork = withId({ lastPostedAt: "2026-09-21T10:00:00Z", postedWork: [{ piece: "workPiece-old", at: "2026-09-21T10:00:00Z" }] });
  assert.equal(groupPost(afterWork, MONDAY, [CURTAINS]).kind, "service");
  // A priced post since: a piece again
  assert.equal(groupPost({ ...afterWork, lastPostedAt: "2026-09-25T10:00:00Z" }, MONDAY, [CURTAINS]).kind, "work");
  // A group that allows a post a day: a piece three days ago is too recent, whatever came after
  const daily = withId({ everyDays: 1, lastPostedAt: "2026-09-27T10:00:00Z", postedWork: [{ piece: "workPiece-old", at: "2026-09-25T10:00:00Z" }] });
  assert.equal(groupPost(daily, MONDAY, [CURTAINS]).kind, "service");
  assert.equal(groupPost(daily, new Date("2026-10-02T10:00:00Z"), [CURTAINS]).kind, "work");
  // A broken time in the list never stops the posts
  assert.equal(groupPost(withId({ postedWork: [{ piece: null, at: "yesterday" }] }), MONDAY, [CURTAINS]).kind, "work");
});
