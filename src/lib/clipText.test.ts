import { test } from "node:test";
import assert from "node:assert/strict";
import { clipText } from "./clipText";

test("a message is cut before a character that would not fit, never through it", () => {
  assert.equal(clipText("hello", 10), "hello");
  assert.equal(clipText("hello", 3), "hel");
  // An emoji is two UTF-16 units; with one unit left it is left out whole
  const heart = String.fromCodePoint(0x1f49c);
  assert.equal(clipText(`ab${heart}`, 3), "ab");
  assert.equal(clipText(`ab${heart}`, 4), `ab${heart}`);
  assert.ok(!clipText(`a${heart}${heart}`, 4).endsWith(String.fromCharCode(0xd83d)));
});
