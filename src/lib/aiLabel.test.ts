import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aiDisclosure } from "./instagram";
import { videoUrlOf } from "../sanity/VideoPreviewInput";

/**
 * The "AI info" label on Instagram.
 *
 * Every Reel with Bea's voice must carry it, and Instagram only takes it while
 * the post is being created — a post that went out unlabelled stays that way.
 * So the tick in the Studio has to survive the whole road: the schema, both
 * queries that pick a post up, and both calls that create a container.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

test("the label is sent only when the post asks for it", () => {
  assert.deepEqual(aiDisclosure(true), { is_ai_generated: "true" });
  assert.deepEqual(aiDisclosure(false), {});
  assert.deepEqual(aiDisclosure(undefined), {});
});

test("both kinds of post send the label to Instagram", () => {
  const source = read("src", "lib", "instagram.ts");
  const uses = source.match(/\.\.\.aiDisclosure\(aiGenerated\)/g) ?? [];
  assert.equal(uses.length, 2, "a Reel and a photo each create a container, and each must carry the label");
});

test("the queue reads the tick and hands it on", () => {
  const source = read("src", "lib", "socialQueue.ts");
  for (const name of ["DUE_POSTS", "ONE_POST"]) {
    const start = source.indexOf(`const ${name}`);
    const query = source.slice(start, source.indexOf("`;", start));
    assert.ok(query.includes("aiGenerated"), `${name} must read aiGenerated, or the tick never reaches Instagram`);
  }
  assert.match(source, /publishToInstagram\(imageUrl, caption, post\.aiGenerated === true\)/);
  assert.match(source, /startReel\(post\.videoUrl!, caption, coverUrl, undefined, post\.aiGenerated === true\)/);
});

test("the Studio has the tick on every post", () => {
  const schema = read("src", "sanity", "schemaTypes", "socialPost.ts");
  assert.match(schema, /name: "aiGenerated"/);
  assert.match(schema, /type: "boolean"/);
});

test("a stored video is played from Sanity's CDN", () => {
  assert.equal(
    videoUrlOf("file-35be1d338011fda73675b933033273fcb05e4e2b-mp4", "abc123", "production"),
    "https://cdn.sanity.io/files/abc123/production/35be1d338011fda73675b933033273fcb05e4e2b.mp4"
  );
  assert.equal(videoUrlOf(undefined, "abc123", "production"), null);
  assert.equal(videoUrlOf("image-abc-1080x1920-jpg", "abc123", "production"), null);
});
