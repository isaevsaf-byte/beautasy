import { test } from "node:test";
import assert from "node:assert/strict";
import { pieceForReview, reviewAskLink, reviewAskText } from "./reviewAsk";

/**
 * «🙏 Попросить отзыв»: the words Kristina sends a finished client, and the
 * WhatsApp link that carries them — to her number, or to nobody.
 */

const REVIEW = "https://g.page/r/CWeTxnVRZItHEBM/review";

test("the message greets her by first name, names the job, and carries the review link", () => {
  const text = reviewAskText({ displayName: "anna smith", service: "Bridal fitting" }, REVIEW);
  assert.equal(
    text,
    [
      "Hi Anna! It was lovely working on your wedding dress 😊",
      "If you're happy with the result, would you leave me a quick Google review? It really helps people in Southampton find me:",
      REVIEW,
      "",
      "Thank you!",
      "Kristina",
    ].join("\n")
  );
});

test("a job the form names awkwardly is her piece, and nobody's name is 'undefined'", () => {
  assert.equal(pieceForReview("Repairs"), "repairs");
  assert.equal(pieceForReview("Alterations"), "alterations");
  assert.equal(pieceForReview("Wedding Dress Alterations"), "wedding dress");
  assert.equal(pieceForReview("Custom Sewing"), "piece");
  assert.equal(pieceForReview("Not sure — free 10-minute look"), "piece");
  assert.equal(pieceForReview(undefined), "piece");
  const nameless = reviewAskText({}, REVIEW);
  assert.match(nameless, /^Hi there! It was lovely working on your piece/);
  assert.doesNotMatch(nameless, /undefined|null/);
});

test("the message stays in her voice: first person, one emoji, signed by her, no shop talk", () => {
  const text = reviewAskText({ displayName: "Lia", service: "Repairs" }, REVIEW);
  assert.match(text, /\bme\b/);
  assert.match(text, /\nKristina$/);
  assert.equal([...text.matchAll(/\p{Extended_Pictographic}/gu)].length, 1);
  assert.doesNotMatch(text, /\b(we|our|valued|customer|feedback)\b/i);
});

test("a UK number in any of the ways people type it becomes the same wa.me link", () => {
  const text = "Hi Anna!\nThank you";
  const want = `https://wa.me/447700900123?text=${encodeURIComponent(text)}`;
  for (const typed of ["07700 900123", "07700900123", "+44 7700 900123", "+44 (0)7700 900123", "0044 7700 900123", "+44 07700 900123", " 07700-900-123 "]) {
    assert.equal(reviewAskLink(typed, text), want, typed);
  }
  // The line breaks travel as %0A, so WhatsApp keeps them
  assert.match(want, /Hi%20Anna!%0AThank%20you$/);
});

test("a number WhatsApp cannot take gives no link rather than a chat with a stranger", () => {
  for (const typed of [undefined, null, "", "7700 900123", "0770090012", "077009001234", "087 123 4567", "call me"]) {
    assert.equal(reviewAskLink(typed, "Hi"), null, String(typed));
  }
});
