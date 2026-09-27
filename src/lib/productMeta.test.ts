import { test } from "node:test";
import assert from "node:assert/strict";
import { plainText, productDescription, snippet } from "./productMeta";

const block = (...texts: string[]) => ({ _type: "block", children: texts.map((text) => ({ _type: "span", text })) });

test("a description's words are read out of its paragraphs", () => {
  assert.equal(
    plainText([block("Soft cotton, ", "no scratchy labels."), { _type: "image" }, block("Made to last the year.")]),
    "Soft cotton, no scratchy labels. Made to last the year."
  );
  assert.equal(plainText(undefined), "");
  assert.equal(plainText("not blocks"), "");
});

test("a long description is cut at a word, and says so", () => {
  const text = "Handmade in Southampton from soft organic cotton ".repeat(6).trim();
  const cut = snippet(text);
  assert.ok(cut.length <= 155, `${cut.length} characters`);
  assert.ok(cut.endsWith("…"));
  const kept = cut.slice(0, -1);
  assert.ok(text.startsWith(kept), "it is the start of her words, not a rewording");
  assert.match(text[kept.length], /[\s,.;:]/, "cut between two words, not inside one");
  assert.doesNotMatch(cut, /\s…$/);
  assert.equal(snippet("Short and whole."), "Short and whole.");
});

test("a product is described in Kristina's words, not a template", () => {
  const description = productDescription({
    name: "Kids' Knickers",
    category: "Kids",
    price: 800,
    description: [block("Soft cotton knickers with no scratchy labels, sewn to last the whole school year.")],
  });
  assert.equal(description, "Soft cotton knickers with no scratchy labels, sewn to last the whole school year.");
  assert.doesNotMatch(description, /Handmade kids from Beautasy/);
});

test("a product she has not described yet still reads as a sentence", () => {
  assert.equal(
    productDescription({ name: "Kids' Knickers", category: "Kids", price: 800 }),
    "Kids' Knickers — a handmade kids piece from Beautasy, Southampton. £8.00"
  );
});
