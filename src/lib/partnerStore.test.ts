import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attributionMessage, attributionRefusal, commissionText, partnerDocument, partnerIdFor, partnerTerms } from "./partnerStore";
import { REFERRER_FIELDS } from "./referrals";
import { fingerprint, seal, unseal } from "./secrets";
import { emailFingerprint } from "./pii";
import { CODE_SHAPE } from "./friendsLink";
import type { PartnerInput } from "./partners";

// A key made up for the suite, so the real seal is what is measured; the key
// is read when something is sealed, not when the module loads
process.env.DATA_SECRET = "test-secret-for-the-partner-suite";

/**
 * What a partner looks like in a dataset anyone can read: the salon's name,
 * its link and its kind in the open, because they are printed on a card
 * anyway; the owner's name, the percentage agreed with this salon, the email
 * its credit goes to and the phone its statement goes to sealed, like every
 * customer's.
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

test("nothing a stranger could read gives the owner, her terms, her email or her phone away", () => {
  const doc = partnerDocument(INPUT, "2026-10-02T20:00:00.000Z");
  const visible = JSON.stringify(doc);
  for (const secret of ["emma.owner@onyxbridal.co.uk", "emma.owner", "07700", "900123", "Emma"]) {
    assert.equal(visible.includes(secret), false, `"${secret}" is readable in the public dataset`);
  }
  assert.equal("commissionPercent" in doc.partner, false, "what this salon is paid is not for the next one to read");
  assert.equal("contactName" in doc.partner, false);
  // The hint every customer's address gets: enough to recognise, not to write to
  assert.equal(doc.emailHint, "em…@onyxbridal.co.uk");
  assert.equal(unseal(doc.emailSealed), "emma.owner@onyxbridal.co.uk");
  assert.equal(unseal(doc.partner.phoneSealed), "07700 900123");
  assert.equal(unseal(doc.partner.contactNameSealed), "Emma");
  assert.equal(Number(unseal(doc.partner.commissionSealed)), 10);
  assert.equal(doc.emailFingerprint, emailFingerprint("emma.owner@onyxbridal.co.uk"), "her own booking is caught as her own");
  // What is printed anyway stays readable
  assert.deepEqual(
    { name: doc.partner.name, slug: doc.partner.slug, kind: doc.partner.kind },
    { name: "Onyx Bridal", slug: "onyx-bridal", kind: "bridal" }
  );
  assert.equal(doc.displayName, "Onyx Bridal", "what the booking form and the emails call them");
});

test("the server opens a partner's terms for the Studio and the statement", () => {
  const doc = partnerDocument(INPUT, "now");
  assert.deepEqual(partnerTerms(doc), { commissionPercent: 10, contactName: "Emma" });

  const { contactName: _c, ...noOwner } = INPUT;
  void _c;
  assert.deepEqual(partnerTerms(partnerDocument({ ...noOwner, commissionPercent: 7.5 }, "now")), { commissionPercent: 7.5 });
  assert.deepEqual(partnerTerms(partnerDocument({ ...noOwner, commissionPercent: 0 }, "now")), { commissionPercent: 0 });

  // A partner made before sealing still reads, until its next save seals it
  const older = { partner: { name: "Old Salon", slug: "old-salon", kind: "salon" as const, commissionPercent: 12, contactName: "Ruth" } };
  assert.deepEqual(partnerTerms(older), { commissionPercent: 12, contactName: "Ruth" });
  // A sealed value that cannot be opened (a changed key) is no commission, never a guess
  const unreadable = { partner: { name: "X", slug: "x", kind: "salon" as const, commissionSealed: "v1.garbage" } };
  assert.deepEqual(partnerTerms(unreadable), { commissionPercent: 0 });
});

test("the sealed percentage is the same length whatever it is, so its size gives nothing away", () => {
  for (const percent of [0, 5, 7.5, 10, 12.5, 30]) {
    assert.equal(commissionText(percent).length, 4, `${percent} → ${commissionText(percent)}`);
    assert.equal(Number(commissionText(percent)), percent);
  }
  const lengths = new Set([0, 7.5, 30].map((percent) => seal(commissionText(percent)).length));
  assert.equal(lengths.size, 1, "a stranger could tell a 30% salon from a 0% one by the length of the seal");
});

test("updating a partner seals its terms and takes off any open copies", () => {
  const store = readFileSync(join(process.cwd(), "src", "lib", "partnerStore.ts"), "utf8");
  const update = store.slice(store.indexOf("export async function updatePartner"), store.indexOf("export async function listPartners"));
  assert.match(update, /"partner\.commissionSealed": seal\(commissionText\(input\.commissionPercent\)\)/);
  assert.match(update, /set\["partner\.contactNameSealed"\] = seal\(input\.contactName\)/);
  assert.match(update, /const unset: string\[\] = \["partner\.contactName", "partner\.commissionPercent", "codeHint"\];/);
  assert.doesNotMatch(update, /"partner\.contactName": |set\["partner\.contactName"\]|"partner\.commissionPercent": /, "nothing writes the open copies");
});

test("the code behind the link is a real Friends code, kept only sealed and fingerprinted", () => {
  const doc = partnerDocument(INPUT, "now");
  const code = unseal(doc.codeSealed);
  assert.ok(code && CODE_SHAPE.test(code), `${code} is not a Friends code`);
  assert.equal(doc.codeFingerprint, fingerprint(code!), "found by its fingerprint, as /r/CODE finds a friend");
  assert.equal("codeHint" in doc, false, "the last four and the name in front of them are the whole link");
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
  assert.equal("contactNameSealed" in doc.partner, false);
  assert.equal("contactName" in doc.partner, false);
});

test("a friend's link keeps no readable piece of its code", () => {
  // The code is NAME-XXXX and the name is in the open, so the last four
  // characters — "codeHint" — rebuilt a working link from the public dataset
  const referrals = readFileSync(join(process.cwd(), "src", "lib", "referrals.ts"), "utf8");
  const ensure = referrals.slice(referrals.indexOf("export async function ensureReferrer"), referrals.indexOf("export async function ownLinkFor"));
  assert.match(ensure, /codeSealed: seal\(code\),/);
  assert.doesNotMatch(ensure, /codeHint|code\.slice/);
  assert.doesNotMatch(REFERRER_FIELDS, /codeHint/, "nothing reads it back either");

  const schema = readFileSync(join(process.cwd(), "src", "sanity", "schemaTypes", "referrer.ts"), "utf8");
  assert.match(schema, /hint: "emailHint",/, "the Studio list tells two Annas apart by their email hint");
  assert.doesNotMatch(schema, /hint: "codeHint"/, "and no longer shows the code's tail");
  assert.match(schema, /name: "codeHint", title: "Код заканчивается на", type: "string", readOnly: true, hidden: true/);
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
