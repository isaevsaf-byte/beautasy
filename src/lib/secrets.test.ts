import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, seal, unseal, secretsConfigured } from "./secrets";

// The key is read when a function runs, not when the module loads, so setting
// it here is enough — and it keeps the suite from depending on a real secret.
before(() => {
  process.env.DATA_SECRET = "test-secret-for-the-suite";
});

test("the same secret always fingerprints the same way, so a query can match it", () => {
  assert.equal(fingerprint("BEAUTASY-AB12-CD34"), fingerprint("BEAUTASY-AB12-CD34"));
});

test("different secrets fingerprint differently, and the original is not in the output", () => {
  const a = fingerprint("BEAUTASY-AB12-CD34");
  const b = fingerprint("BEAUTASY-AB12-CD35");
  assert.notEqual(a, b);
  assert.doesNotMatch(a, /AB12/);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("a sealed value reads back exactly", () => {
  const code = "BEAUTASY-QK7F-M2WD";
  const sealed = seal(code);
  assert.notEqual(sealed, code);
  assert.doesNotMatch(sealed, /QK7F/);
  assert.equal(unseal(sealed), code);
});

test("sealing twice gives different ciphertext, so equal codes are not obvious", () => {
  assert.notEqual(seal("same"), seal("same"));
});

test("tampered or foreign ciphertext reads back as nothing, never as guesswork", () => {
  const sealed = seal("BEAUTASY-QK7F-M2WD");
  const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
  assert.equal(unseal(flipped), null);
  assert.equal(unseal("v1.not-base64url-at-all!!"), null);
  assert.equal(unseal("v2.abc"), null);
  assert.equal(unseal(undefined), null);
  assert.equal(unseal(""), null);
});

test("a value sealed under one key cannot be read under another", () => {
  const sealed = seal("BEAUTASY-QK7F-M2WD");
  process.env.DATA_SECRET = "a-different-secret";
  try {
    assert.equal(unseal(sealed), null);
  } finally {
    process.env.DATA_SECRET = "test-secret-for-the-suite";
  }
});

test("the shop can tell whether it is configured to issue secrets at all", () => {
  assert.equal(secretsConfigured(), true);
});
