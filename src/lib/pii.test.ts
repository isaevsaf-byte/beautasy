import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  sealOptional,
  open,
  emailFingerprint,
  maskEmail,
  firstNameOf,
  normaliseEmail,
} from "./pii";

before(() => {
  process.env.DATA_SECRET = "test-secret-for-the-suite";
});

test("a sealed detail reads back exactly, and the original is not in the ciphertext", () => {
  const phone = "+44 7700 900123";
  const sealed = sealOptional(phone)!;
  assert.doesNotMatch(sealed, /900123/);
  assert.equal(open(sealed), phone);
});

test("nothing to seal seals to nothing, so an optional field stays absent", () => {
  assert.equal(sealOptional(undefined), undefined);
  assert.equal(sealOptional(""), undefined);
  assert.equal(sealOptional("   "), undefined);
  assert.equal(open(undefined), null);
});

test("the same address always fingerprints the same way, however it was typed", () => {
  assert.equal(emailFingerprint("Anna@Gmail.com "), emailFingerprint("anna@gmail.com"));
  assert.notEqual(emailFingerprint("anna@gmail.com"), emailFingerprint("anne@gmail.com"));
  assert.equal(normaliseEmail(" ANNA@Gmail.com "), "anna@gmail.com");
});

test("a masked address is recognisable but not deliverable", () => {
  assert.equal(maskEmail("anna.smith@gmail.com"), "an…@gmail.com");
  assert.equal(maskEmail("kit@beautasy.co.uk"), "k…@beautasy.co.uk");
  assert.equal(maskEmail("not-an-address"), undefined);
  assert.equal(maskEmail(undefined), undefined);
});

test("only the first name stays readable", () => {
  assert.equal(firstNameOf("Anna Smith-Jones"), "Anna");
  assert.equal(firstNameOf("  Kristina  "), "Kristina");
  assert.equal(firstNameOf(""), undefined);
  assert.equal(firstNameOf(undefined), undefined);
});
