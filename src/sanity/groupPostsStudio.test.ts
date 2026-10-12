import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConcreteRuleClass } from "sanity";
import { facebookGroup } from "@/sanity/schemaTypes/facebookGroup";
import { schemaTypes } from "@/sanity/schemaTypes";
import { WEEKDAYS } from "@/lib/groupPosts";

/**
 * «Группы Facebook» holds each group's rules; «Посты в группы» turns them into
 * today's posts. What is decided in @/lib/groupPosts is tested there; this is
 * the Studio's side — the form, the sidebar, and the three buttons.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

interface FieldDef {
  name: string;
  validation?: (rule: never) => unknown;
  options?: { list?: { title: string; value: string }[] };
  initialValue?: unknown;
}
const field = (name: string): FieldDef => {
  const found = (facebookGroup.fields as FieldDef[]).find((f) => f.name === name);
  assert.ok(found, `no field "${name}"`);
  return found;
};

async function says(name: string, rule: unknown, value: unknown): Promise<string[]> {
  const rules = (Array.isArray(rule) ? rule : [rule]) as {
    validate: (value: unknown, context: never) => Promise<{ level: string; message: string }[]>;
  }[];
  const context = { i18n: { t: (key: string) => key }, path: [name], document: {} } as never;
  return (await Promise.all(rules.map((r) => r.validate(value, context)))).flat().map((m) => `${m.level}: ${m.message}`);
}

test("a group's link has to be a Facebook group, and its spacing a whole number of days", async () => {
  const url = field("url").validation!(ConcreteRuleClass.string() as never);
  assert.deepEqual(await says("url", url, "https://www.facebook.com/groups/southamptonmums"), []);
  assert.notDeepEqual(await says("url", url, "https://www.facebook.com/beautasy"), [], "a page is not a group");
  assert.notDeepEqual(await says("url", url, undefined), [], "required");

  const every = field("everyDays").validation!(ConcreteRuleClass.number() as never);
  assert.deepEqual(await says("everyDays", every, 7), []);
  assert.notDeepEqual(await says("everyDays", every, 0), []);
  assert.notDeepEqual(await says("everyDays", every, 1.5), []);
  assert.equal(field("everyDays").initialValue, 7, "a week unless the group says otherwise");
  assert.equal(field("active").initialValue, true);
  assert.equal(field("links").initialValue, true);
});

test("the form offers exactly the days the calendar knows", () => {
  assert.deepEqual(field("days").options?.list, WEEKDAYS.map((day) => ({ title: day.title, value: day.value })));
  assert.ok(schemaTypes.some((type) => type.name === "facebookGroup"), "the Studio knows the type");
});

test("the sidebar has today's group posts at the top, and the groups themselves under «Соцсети»", () => {
  const structure = read("src/sanity/structure.ts");
  assert.match(structure, /\.title\("Посты в группы"\)\s*\.child\(S\.component\(FacebookGroupsPane\)/);
  assert.match(structure, /S\.documentTypeListItem\("facebookGroup"\)\.title\("Группы Facebook"\)/);
  // A daily job: right after the posts to approve, before the first folder
  const at = (needle: string) => structure.indexOf(needle);
  assert.ok(at('.title("Посты в группы")') > at('.title("Посты на одобрение")'));
  assert.ok(at('.title("Посты в группы")') < at('.id("reviews")'), "at the top, not in a folder");
  assert.ok(at('S.documentTypeListItem("facebookGroup")') > at('.id("social")'), "the groups live in «Соцсети»");
});

test("the three buttons copy the post, open the group, and rest it — draft and all", () => {
  const pane = read("src/sanity/FacebookGroupsPane.tsx");
  assert.match(pane, /const post = groupPost\(group, now, pieces\);/);
  assert.match(pane, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(pane, /<a href=\{group\.url\} target="_blank" rel="noopener noreferrer"/);
  assert.match(pane, /client\.transaction\(\)\.patch\(group\._id, \(p\) => p\.set\(\{ lastPostedAt: at \}\)\)/);
  assert.match(pane, /if \(hasDraft\) tx\.patch\(draftId, \(p\) => p\.set\(\{ lastPostedAt: at \}\)\);/);
  // Only published groups, and the client made once — see dashboardTool
  assert.match(pane, /_type == "facebookGroup" && !\(_id in path\("drafts\.\*\*"\)\)/);
  assert.match(pane, /^const CLIENT_OPTIONS = \{ apiVersion: sanityConfig\.apiVersion \};$/m);
});

test("a post about a piece of work notes the piece on the group, and a group without links gets the photo to attach", () => {
  const pane = read("src/sanity/FacebookGroupsPane.tsx");
  // The groups with what they were shown, and the published pieces — both defined beside the generator
  assert.match(pane, /lastPostedAt, \$\{POSTED_WORK\}/);
  assert.match(pane, /"pieces": \$\{FRESH_WORK\}/);
  // «Опубликовала» records the piece at the same moment as the post, on the draft too
  assert.match(pane, /onClick=\{\(\) => markPosted\(group, post\)\}/);
  assert.match(pane, /piece: \{ _type: "reference", _ref: post\.piece, _weak: true \},\s*at,/);
  assert.match(pane, /tx\.patch\(group\._id, \(p\) => p\.setIfMissing\(\{ postedWork: \[\] \}\)\.append\("postedWork", \[shown\]\)\);/);
  assert.match(pane, /if \(hasDraft\) tx\.patch\(draftId, \(p\) => p\.setIfMissing\(\{ postedWork: \[\] \}\)\.append\("postedWork", \[shown\]\)\);/);
  // The card, downloaded from the site, only where the link can't carry it
  assert.match(pane, /\{post\.card && !post\.link && \(\s*<a\s+href=\{post\.card\}\s+download=/);
  assert.match(pane, /"Скачать фото до\/после"/);

  // The field the button writes: weak, so a piece can still be deleted from the gallery
  const posted = (facebookGroup.fields as { name: string; of?: { name: string; fields: { name: string; to?: { type: string }[]; weak?: boolean }[] }[] }[]).find(
    (f) => f.name === "postedWork"
  );
  assert.ok(posted?.of?.[0], "the group keeps the pieces it was shown");
  assert.equal(posted.of[0].name, "postedPiece", "the _type the pane writes");
  const piece = posted.of[0].fields.find((f) => f.name === "piece");
  assert.deepEqual(piece?.to, [{ type: "workPiece" }]);
  assert.equal(piece?.weak, true);
  assert.ok(posted.of[0].fields.some((f) => f.name === "at"));
});
