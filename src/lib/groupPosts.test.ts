import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WEEKDAYS,
  groupPost,
  groupSlug,
  groupStatus,
  isFacebookGroupUrl,
  londonDay,
  type FacebookGroup,
} from "./groupPosts";
import { LOCAL_SERVICES } from "./localServices";

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
  assert.equal(
    post.link,
    `https://www.beautasy.co.uk/alterations/${service.slug}?utm_source=facebook&utm_medium=group&utm_campaign=southampton-mums`
  );
  assert.ok(post.text.endsWith(post.link), "the link closes the post");
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
