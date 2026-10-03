import { test } from "node:test";
import assert from "node:assert/strict";
import { wrongCodeCounter } from "./codeAttempts";

test("an address is stopped after its wrong codes run out, and not before", () => {
  const counter = wrongCodeCounter(3, 60_000);
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(counter.blocked("1.2.3.4", now).blocked, false, `guess ${i + 1} is still allowed`);
    counter.miss("1.2.3.4", now);
  }
  const verdict = counter.blocked("1.2.3.4", now + 1_000);
  assert.equal(verdict.blocked, true);
  assert.equal(verdict.retryAfter, 59, "Retry-After counts down to the end of the window");
});

test("one address's guesses do not stop another's checkout", () => {
  const counter = wrongCodeCounter(1, 60_000);
  counter.miss("1.2.3.4", 0);
  assert.equal(counter.blocked("1.2.3.4", 1).blocked, true);
  assert.equal(counter.blocked("5.6.7.8", 1).blocked, false);
});

test("the window ends and the address may try again", () => {
  const counter = wrongCodeCounter(1, 60_000);
  counter.miss("1.2.3.4", 0);
  assert.equal(counter.blocked("1.2.3.4", 59_999).blocked, true);
  assert.equal(counter.blocked("1.2.3.4", 60_000).blocked, false);
  counter.miss("1.2.3.4", 60_000);
  assert.equal(counter.blocked("1.2.3.4", 60_001).blocked, true, "a fresh window counts from one");
});

test("being checked is not a guess: only a wrong code counts", () => {
  const counter = wrongCodeCounter(2, 60_000);
  for (let i = 0; i < 50; i++) counter.blocked("1.2.3.4", i);
  assert.equal(counter.blocked("1.2.3.4", 100).blocked, false, "a shopper with a good card is never held up");
});
