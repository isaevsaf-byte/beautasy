import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { uploadOnce } from "./uploadOnce";

/**
 * A review sent twice must not send its photos twice. The form used to upload
 * every photo on every press of "Send review", so a customer whose first try
 * was refused for its comment spent the link's daily photo allowance again on
 * the second, and could be locked out for a day on the third.
 */

interface Photo {
  name: string;
  assetId?: string;
}

/** The form's state and the upload door, in miniature. */
function formWith(names: string[], failOn?: string) {
  let photos: Photo[] = names.map((name) => ({ name }));
  const sent: string[] = [];
  const send = () =>
    uploadOnce(
      photos,
      (photo) => photo.assetId,
      async (photo) => {
        if (photo.name === failOn) throw new Error("The connection dropped");
        sent.push(photo.name);
        return `image-${photo.name}`;
      },
      (photo, assetId) => {
        photos = photos.map((p) => (p.name === photo.name ? { ...p, assetId } : p));
      }
    );
  return {
    send,
    sent,
    remove: (name: string) => (photos = photos.filter((p) => p.name !== name)),
    add: (name: string) => (photos = [...photos, { name }]),
    fix: () => (failOn = undefined),
  };
}

test("a second try sends no photo the first one already sent", async () => {
  const form = formWith(["a", "b", "c", "d"]);
  assert.deepEqual(await form.send(), ["image-a", "image-b", "image-c", "image-d"]);
  // The review was refused (say its comment was too long), and she sends it again
  assert.deepEqual(await form.send(), ["image-a", "image-b", "image-c", "image-d"]);
  assert.deepEqual(form.sent, ["a", "b", "c", "d"], "four uploads, not eight");
});

test("a try that fails halfway keeps what it managed, and the next try sends only the rest", async () => {
  const form = formWith(["a", "b", "c"], "c");
  await assert.rejects(form.send(), /connection dropped/);
  form.fix();
  assert.deepEqual(await form.send(), ["image-a", "image-b", "image-c"]);
  assert.deepEqual(form.sent, ["a", "b", "c"]);
});

test("a photo taken off and a new one put on: only the new one is sent", async () => {
  const form = formWith(["a", "b"]);
  await form.send();
  form.remove("a");
  form.add("e");
  assert.deepEqual(await form.send(), ["image-b", "image-e"]);
  assert.deepEqual(form.sent, ["a", "b", "e"]);
});

const FORM = readFileSync(join(process.cwd(), "src", "app", "review", "[token]", "ReviewByTokenForm.tsx"), "utf8");

test("the review form uploads through uploadOnce and says which piece each photo is for", () => {
  assert.match(FORM, /await uploadOnce\(/);
  assert.doesNotMatch(FORM, /for \(const \{ file \} of photos\)/, "no loop that sends every photo again");
  assert.match(FORM, /formData\.append\("productId", productId\);/, "the upload door caps photos per piece");
});

test("the comment box stops where the server does, so a long comment is not refused after its photos went up", () => {
  const byToken = readFileSync(join(process.cwd(), "src", "app", "api", "reviews", "by-token", "route.ts"), "utf8");
  const serverMost = Number(byToken.match(/comment\.length > (\d+)/)?.[1]);
  assert.equal(Number(FORM.match(/const MAX_COMMENT = (\d+);/)?.[1]), serverMost);
  assert.match(FORM, /maxLength=\{MAX_COMMENT\}/);
});
