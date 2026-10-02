import { test } from "node:test";
import assert from "node:assert/strict";
import { attributionMessage, attributionRefusal, partnerDocument, partnerIdFor } from "./partnerStore";
import { fingerprint, unseal } from "./secrets";
import { emailFingerprint } from "./pii";
import { CODE_SHAPE } from "./friendsLink";
import type { PartnerInput } from "./partners";

// A key made up for the suite, so the real seal is what is measured; the key
// is read when something is sealed, not when the module loads
process.env.DATA_SECRET = "test-secret-for-the-partner-suite";

/**
 * What a partner looks like in a dataset anyone can read: the salon's name,
 * its link and its terms in the open, because they are printed on a card
 * anyway; the email its credit goes to and the phone its statement goes to
 * sealed, like every customer's.
 */

const INPUT: PartnerInput = {
  name: "Onyx Bridal",
  slug: "onyx-bridal",
  kind: "bridal",
  commissionPercent: 10,
  contactName: "Emma",
  email: "emma.owner@onyxbridal.co.uk",
  phone: "07700 900123",
  active: true,
};

test("a partner's id is its link, so a printed link can never be handed to a second salon", () => {
  const doc = partnerDocument(INPUT, "2026-10-02T20:00:00.000Z");
  assert.equal(doc._id, "referrer-partner-onyx-bridal");
  assert.equal(partnerIdFor("onyx-bridal"), doc._id);
  assert.equal(doc._type, "referrer", "a Friends link, so every path that pays a friend pays a partner");
  assert.equal(doc.source, "partner");
  assert.equal(doc.active, true);
  assert.equal(doc.rewardsCount, 0);
});

test("nothing a stranger could read gives the owner's email or phone away", () => {
  const doc = partnerDocument(INPUT, "2026-10-02T20:00:00.000Z");
  const visible = JSON.stringify(doc);
  for (const secret of ["emma.owner@onyxbridal.co.uk", "emma.owner", "07700", "900123"]) {
    assert.equal(visible.includes(secret), false, `"${secret}" is readable in the public dataset`);
  }
  // The hint every customer's address gets: enough to recognise, not to write to
  assert.equal(doc.emailHint, "em…@onyxbridal.co.uk");
  assert.equal(unseal(doc.emailSealed), "emma.owner@onyxbridal.co.uk");
  assert.equal(unseal(doc.partner.phoneSealed), "07700 900123");
  assert.equal(doc.emailFingerprint, emailFingerprint("emma.owner@onyxbridal.co.uk"), "her own booking is caught as her own");
  // What is printed anyway stays readable
  assert.deepEqual(
    { name: doc.partner.name, slug: doc.partner.slug, kind: doc.partner.kind, commissionPercent: doc.partner.commissionPercent, contactName: doc.partner.contactName },
    { name: "Onyx Bridal", slug: "onyx-bridal", kind: "bridal", commissionPercent: 10, contactName: "Emma" }
  );
  assert.equal(doc.displayName, "Onyx Bridal", "what the booking form and the emails call them");
});

test("the code behind the link is a real Friends code, kept only sealed and fingerprinted", () => {
  const doc = partnerDocument(INPUT, "now");
  const code = unseal(doc.codeSealed);
  assert.ok(code && CODE_SHAPE.test(code), `${code} is not a Friends code`);
  assert.equal(doc.codeFingerprint, fingerprint(code!), "found by its fingerprint, as /r/CODE finds a friend");
  assert.equal(doc.codeHint, code!.slice(-4));
  assert.equal(JSON.stringify(doc).includes(code!), false, "the code itself is not in the open");
  assert.notEqual(unseal(partnerDocument(INPUT, "now").codeSealed), code, "each new link draws a fresh code");
});

test("a partner without an email stands for nobody's address", () => {
  const { email: _e, phone: _p, contactName: _c, ...bare } = INPUT;
  void _e;
  void _p;
  void _c;
  const doc = partnerDocument(bare, "now");
  assert.equal("emailSealed" in doc, false);
  assert.equal("emailHint" in doc, false);
  assert.equal(doc.emailFingerprint, fingerprint("partner:onyx-bridal"));
  assert.notEqual(doc.emailFingerprint, emailFingerprint(""), "an empty address cannot match it");
  assert.equal("phoneSealed" in doc.partner, false);
  assert.equal("contactName" in doc.partner, false);
});

test("a client the rules turn away is refused with the reason, as a link click would be", () => {
  assert.match(attributionRefusal("Onyx Bridal", "self", 100), /^Не записано: у клиентки та же почта, что у «Onyx Bridal»/);
  assert.match(attributionRefusal("Onyx Bridal", "repeat", 100), /уже приходила к вам раньше/);
  assert.match(attributionRefusal("Onyx Bridal", "capped", 100), /100 клиенток за год/);
  assert.match(attributionRefusal("Onyx Bridal", "disabled", 100), /«Beautasy Friends» выключена/);
});

test("what she is told when the client is put down to the partner fits where the booking is", () => {
  const fresh = attributionMessage({ name: "Onyx Bridal", discount: 500, reward: 500, done: false, noEmail: false });
  assert.equal(fresh, "Готово: клиентку прислал «Onyx Bridal». Скидка клиентке £5 — вычтите её при оплате. Салону £5 кредита, когда отметите запись «Выполнена».");
  const done = attributionMessage({ name: "Onyx Bridal", discount: 500, reward: 500, done: true, noEmail: false });
  assert.equal(done.includes("вычтите"), false, "a finished booking is already paid for");
  const noEmail = attributionMessage({ name: "Onyx Bridal", discount: 500, reward: 500, done: false, noEmail: true });
  assert.match(noEmail, /нет почты, поэтому сайт не может проверить, первый ли это визит/);
});
