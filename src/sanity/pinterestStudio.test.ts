import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pinterestPin } from "@/sanity/schemaTypes/pinterestPin";
import { socialPost } from "@/sanity/schemaTypes/socialPost";
import { schemaTypes } from "@/sanity/schemaTypes";
import { PINTEREST_APP } from "@/sanity/PinterestGuidePane";

/**
 * «Соцсети» → Pinterest: Pins made from the gallery, posted by hand until the
 * site is connected, and the guide that gets it connected.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const names = (fields: unknown) => (fields as { name: string }[]).map((f) => f.name);

test("a Pin is a document type of its own, with what Pinterest asks for", () => {
  assert.ok(schemaTypes.some((t) => t.name === "pinterestPin"));
  for (const name of ["images", "video", "title", "description", "link", "board", "status", "pinUrl", "createdAt"]) {
    assert.ok(names(pinterestPin.fields).includes(name), name);
  }
  const status = (pinterestPin.fields as { name: string; options?: { list?: { value: string }[] } }[]).find((f) => f.name === "status");
  assert.deepEqual(status?.options?.list?.map((o) => o.value), ["ready", "posted"]);
});

test("the sidebar has both Pin lists and the guide, under «Соцсети»", () => {
  const structure = read("src/sanity/structure.ts");
  const social = structure.slice(structure.indexOf('.id("social")'), structure.indexOf('.id("shop")'));
  assert.match(social, /_type == "pinterestPin" && status != "posted"/);
  assert.match(social, /_type == "pinterestPin" && status == "posted"/);
  assert.match(social, /S\.component\(PinterestGuidePane\)/);
});

test("the guide sends Kristina to her own pages and keeps the secret out of the Studio", () => {
  assert.equal(PINTEREST_APP.privacy, "https://www.beautasy.co.uk/pages/privacy-policy");
  assert.ok(PINTEREST_APP.redirect.startsWith("https://www.beautasy.co.uk/"));
  assert.ok(PINTEREST_APP.description.length > 300, "a vague description is the usual reason Pinterest says no");
  const guide = read("src/sanity/PinterestGuidePane.tsx");
  assert.match(guide, /не в группу и не в Studio/);
});

test("a Reel says which track to pick, and why the site cannot add it", () => {
  const music = (socialPost.fields as { name: string; description?: string }[]).find((f) => f.name === "music");
  assert.ok(music, "music field");
  assert.match(music.description ?? "", /приложении Instagram/);
});
