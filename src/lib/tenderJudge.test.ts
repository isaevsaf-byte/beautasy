import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  factsFromContractsFinder,
  factsFromRelease,
  judgeTender,
  nearPostcode,
  whereIs,
  type ContractsFinderItem,
  type OcdsRelease,
} from "./tenderJudge";
import { judge } from "./leadScout";
import { fromFindATender, liveRelease } from "./leadSources";

/**
 * The tender judge (16.10.2026), held to real notices. Every one of the
 * first five was sent, or would have been, by the judge that read words:
 * a university's cleaning framework, a housing association's front doors, a
 * school trust's cleaning, a national uniform framework, sports bras for the
 * armed forces. None is work for one person sewing at home in Southampton.
 */

const FIXTURES = JSON.parse(readFileSync(join(__dirname, "tenderJudge.fixtures.json"), "utf8")) as {
  releases: Record<string, OcdsRelease>;
  contractsFinder: Record<string, ContractsFinderItem>;
};
const NOW = new Date("2026-10-16T06:30:00Z");
const verdictOf = (id: string, now = NOW) => judgeTender(factsFromRelease(FIXTURES.releases[id]), now);

test("Lancaster's cleaning framework is not hers: cleaning codes, a £2.5m framework, 300 miles away", () => {
  const verdict = verdictOf("096500-2026");
  assert.equal(verdict.keep, false);
  assert.match(verdict.drop.join(" · "), /не шитьё по коду закупки: 90911\d{3} уборка/);
  assert.match(verdict.drop.join(" · "), /рамочное соглашение на £2,475,000/);
  assert.match(verdict.drop.join(" · "), /далеко: Lancaster/);
  // Its curtains lot is cleaning too: the lot's own code says so, whatever its title
  assert.ok(!verdict.why.some((w) => /шторы/.test(w)));
});

test("every junk notice the word-reader kept is dropped, each for a reason she can read", () => {
  for (const [id, reason] of [
    ["093770-2026", /не шитьё/], // "curtain walling", in Portsmouth
    ["093393-2026", /не шитьё по коду закупки: 909\d+ уборка/], // "tailor their approach"
    ["094250-2026", /велико|рамочное|далеко/], // a national uniform framework
    ["096543-2026", /велико для одной мастерской|далеко|не шитьё/], // sports bras, £3.7m
  ] as const) {
    const verdict = verdictOf(id);
    assert.equal(verdict.keep, false, id);
    assert.match(verdict.drop.join(" · "), reason, `${id}: ${verdict.drop.join(" · ")}`);
  }
  // The doors are in Portsmouth: near is not enough
  assert.equal(whereIs(factsFromRelease(FIXTURES.releases["093770-2026"])).near, true);
});

test("Contracts Finder: army clothing is a factory's; Mitie's call for tailors was hers while it was open", () => {
  const army = judgeTender(factsFromContractsFinder(FIXTURES.contractsFinder.army), NOW);
  assert.equal(army.keep, false);
  const mitie = factsFromContractsFinder(FIXTURES.contractsFinder.mitie);
  const open = judgeTender(mitie, new Date("2026-01-20T09:00:00Z"));
  assert.equal(open.keep, true, open.drop.join(" · "));
  assert.ok(open.why.includes("пошив на заказ"));
  // First, so no message cuts it: not yet a call for bids
  assert.equal(open.why[0], "ещё не конкурс — заказчик заранее опрашивает рынок");
  assert.ok(open.why.includes("место не названо или вся страна — уточнить"));
  assert.match(judgeTender(mitie, NOW).drop.join(), /не успеть/, "and not after its closing date");
});

/** A small curtains tender in Winchester, written the way Find a Tender writes one */
function curtains(over: { tender?: Partial<NonNullable<OcdsRelease["tender"]>>; parties?: OcdsRelease["parties"] } = {}): OcdsRelease {
  const base: OcdsRelease = {
    id: "999999-2026",
    tag: ["tender"],
    buyer: { name: "Winchester City Council" },
    parties: [{ name: "Winchester City Council", roles: ["buyer"], address: { region: "UKJ36", postalCode: "SO23 9LJ", locality: "Winchester" } }],
    tender: {
      title: "Making up of curtains for sheltered housing",
      description: "Lined curtains made to measure for eight sheltered housing schemes.",
      status: "active",
      items: [{ relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "39515100" }], deliveryAddresses: [{ region: "UKJ36" }] }],
      lots: [{ id: "1", title: "Curtains", value: { amount: 18_000 }, suitability: { sme: true } }],
      value: { amount: 18_000 },
      otherRequirements: { reservedParticipation: ["smeVcse"] },
      tenderPeriod: { endDate: "2026-11-02T12:00:00Z" },
    },
  };
  return { ...base, ...(over.parties ? { parties: over.parties } : {}), tender: { ...base.tender, ...over.tender } };
}
const judged = (release: OcdsRelease) => judgeTender(factsFromRelease(release), NOW);

test("a small curtains tender in Winchester, for small businesses, is kept, near and high", () => {
  const verdict = judged(curtains());
  assert.equal(verdict.keep, true, verdict.drop.join(" · "));
  assert.deepEqual(verdict.why, [
    "шторы",
    "£18,000",
    "рядом: Winchester · Центральный Хэмпшир",
    "только для малого бизнеса — меньше конкурентов",
    "подходит малому бизнесу",
  ]);
  assert.equal(verdict.score, 12);
  // Through the lead's own judge, it is marked a tender
  const lead = judge({ source: "findATender", url: "x", title: "Curtains", text: "", tender: factsFromRelease(curtains()) }, NOW);
  assert.deepEqual([lead.keep, lead.why.at(-1)], [true, "тендер"]);
});

test("the same tender is dropped as soon as one gate fails", () => {
  const cases: [string, OcdsRelease, RegExp][] = [
    ["far away", curtains({ tender: { items: [{ relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "39515100" }], deliveryAddresses: [{ region: "UKD44" }] }] }, parties: [{ roles: ["buyer"], address: { region: "UKD44", postalCode: "LA1 4YW", locality: "Lancaster" } }] }), /далеко: Lancaster/],
    ["a £2m framework", curtains({ tender: { value: { amount: 2_000_000 }, lots: [{ id: "1", value: { amount: 400_000 } }], techniques: { hasFrameworkAgreement: true } } }), /велико.*£400,000.*рамочное соглашение на £2,000,000/],
    ["curtain cleaning", curtains({ tender: { items: [{ relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "90911200" }], deliveryAddresses: [{ region: "UKJ36" }] }] } }), /не шитьё по коду закупки: 90911200 уборка/],
    ["disposable hospital curtains", curtains({ tender: { description: "Supply of disposable anti-ligature cubicle curtains." } }), /не шитьё: «(disposable|anti-ligature|cubicle curtains)»/],
    ["reserved to Suffolk", curtains({ tender: { otherRequirements: { reservedParticipationLocation: { description: "Suffolk", gazetteer: { identifiers: ["E10000029"] } } } } }), /только для поставщиков из: Suffolk/],
    ["for sheltered workshops", curtains({ tender: { otherRequirements: { reservedParticipation: ["shelteredWorkshop"] } } }), /только для соцпредприятий/],
    ["two days to answer", curtains({ tender: { tenderPeriod: { endDate: "2026-10-18T12:00:00Z" } } }), /подать до 2026-10-18 — не успеть/],
    ["no competition", curtains({ tender: { procurementMethod: "direct" } }), /без конкурса/],
  ];
  for (const [name, release, reason] of cases) {
    const verdict = judged(release);
    assert.equal(verdict.keep, false, name);
    assert.match(verdict.drop.join(" · "), reason, `${name}: ${verdict.drop.join(" · ")}`);
  }
});

test("a curtains code is not enough when the lot says cleaning, and a clothing code needs her craft in its words", () => {
  const cleaning = judged(curtains({ tender: { title: "Cleaning of curtains in sheltered housing", lots: [{ id: "1", title: "Curtain cleaning", value: { amount: 9_000 } }] } }));
  assert.equal(cleaning.keep, false);
  assert.match(cleaning.drop.join(), /не шитьё по коду закупки/);
  const workwear = (title: string, description: string) =>
    judged(
      curtains({
        tender: {
          title,
          description,
          items: [{ relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "18100000" }], deliveryAddresses: [{ region: "UKJ36" }] }],
          lots: [{ id: "1", title, value: { amount: 9_000 } }],
        },
      })
    );
  assert.equal(workwear("Supply of workwear", "Polo shirts and fleeces with logo.").keep, false, "clothing bought by the box");
  const alterations = workwear("Uniform alterations", "Alterations to uniforms for the band: hems and sleeves.");
  assert.equal(alterations.keep, true, alterations.drop.join(" · "));
  assert.ok(alterations.why.includes("одежда"));
});

test("one curtains code in someone else's long list is not hers; blinds need their words", () => {
  // A council's repairs contract (Norwich, 093637-2026, lot 2), moved to Winchester: eleven codes, one of them curtains
  const repairs = ["90911100", "90900000", "39710000", "71630000", "45232330", "90922000", "77211500", "77314000", "39515000", "44100000", "31680000"];
  const responsive = judged(
    curtains({
      tender: {
        title: "Building Works, Supplies & Services",
        description: "Responsive repairs and maintenance across the estate.",
        items: [{ relatedLot: "2", additionalClassifications: repairs.map((id) => ({ scheme: "CPV", id })), deliveryAddresses: [{ region: "UKJ36" }] }],
        lots: [
          { id: "1", title: "Planned works" },
          { id: "2", title: "Responsive Repairs and Maintenance South" },
        ],
        value: undefined,
      },
    })
  );
  assert.equal(responsive.keep, false, responsive.why.join(" · "));
  // The same codes on a lot that says curtains in its own title: hers, but not "sure"
  const titled = judged(
    curtains({
      tender: {
        items: [{ relatedLot: "1", additionalClassifications: ["39515000", "39100000", "39130000", "39143000"].map((id) => ({ scheme: "CPV", id })), deliveryAddresses: [{ region: "UKJ36" }] }],
        lots: [{ id: "1", title: "Curtains and soft furnishings for the new wing", value: { amount: 15_000 } }],
      },
    })
  );
  assert.equal(titled.keep, true, titled.drop.join(" · "));
  assert.equal(titled.score, 3 + 3 + 2, "a maybe (3), not a sure (6), near (3), small businesses only (2)");
  // A school's roller blinds are fitting; Roman blinds are sewing
  const blinds = (title: string) =>
    judged(curtains({ tender: { title, description: title, items: [{ relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "39515400" }], deliveryAddresses: [{ region: "UKJ35" }] }], lots: [{ id: "1", title, value: { amount: 9_000 } }] } }));
  assert.equal(blinds("Replacement roller and vertical blinds, Toynbee School").keep, false);
  assert.equal(blinds("Roman blinds for sheltered housing").keep, true);
});

test("a region delivered by a buyer inside it is that buyer's patch, not the whole country", () => {
  const regional = (delivery: string, region: string, postalCode: string, locality: string) =>
    whereIs(
      factsFromRelease(
        curtains({
          tender: { items: [{ relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "39515100" }], deliveryAddresses: [{ region: delivery }] }] },
          parties: [{ roles: ["buyer"], address: { region, postalCode, locality } }],
        })
      )
    );
  assert.deepEqual(regional("UKK", "UKK30", "TR1 3AY", "Truro"), { near: false, broad: false, far: "Truro, UKK30" });
  assert.equal(regional("UKJ", "UKJ45", "ME14 1XQ", "Maidstone").near, false);
  assert.equal(regional("UKJ", "UKJ45", "ME14 1XQ", "Maidstone").broad, false);
  // The whole UK from Leeds is still "anywhere", flagged
  assert.equal(regional("UK", "UKE42", "LS1 1UR", "Leeds").broad, true);
});

test("a lot's size is its share of the whole when the lots do not add up to it", () => {
  // Lancaster's lots summed to a fifth of its total: a £35k lot was £175k over the term
  const release = curtains({
    tender: {
      value: { amount: 200_000 },
      lots: [
        { id: "1", title: "Curtains", value: { amount: 10_000 } },
        { id: "2", title: "Carpets", value: { amount: 30_000 } },
      ],
      items: [
        { relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "39515100" }], deliveryAddresses: [{ region: "UKJ36" }] },
        { relatedLot: "2", additionalClassifications: [{ scheme: "CPV", id: "39531000" }], deliveryAddresses: [{ region: "UKJ36" }] },
      ],
    },
  });
  const verdict = judged(release);
  assert.equal(verdict.lotValue, 50_000);
  assert.ok(verdict.why.includes("лот 1: шторы"));
  assert.ok(verdict.why.includes("сумма лота: £50,000"), "said as the lot's own, not the notice's");
});

test("where: the country or a large region is decided by the buyer's own address", () => {
  const anywhere = (region: string, postalCode: string, locality: string) =>
    whereIs(
      factsFromRelease(
        curtains({
          tender: { items: [{ relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "39515100" }], deliveryAddresses: [{ region: "UK" }] }] },
          parties: [{ roles: ["buyer"], address: { region, postalCode, locality } }],
        })
      )
    );
  assert.deepEqual(anywhere("UKJ31", "PO1 2AL", "Portsmouth"), { near: true, broad: false, place: "Portsmouth · Портсмут" });
  assert.deepEqual(anywhere("UKE42", "LS1 1UR", "Leeds"), { near: false, broad: true, place: "Leeds" });
  // No region for the buyer, but a Southampton postcode: near
  assert.equal(anywhere("", "SO15 1BA", "Southampton").near, true);
  // A West Sussex council writing only "UKJ2" is still within reach
  const sussex = whereIs(
    factsFromRelease(
      curtains({
        tender: { items: [{ relatedLot: "1", additionalClassifications: [{ scheme: "CPV", id: "39515100" }], deliveryAddresses: [{ region: "UKJ2" }] }] },
        parties: [{ roles: ["buyer"], address: { region: "UKJ27", postalCode: "PO19 1RQ", locality: "Chichester" } }],
      })
    )
  );
  assert.equal(sussex.near, true);
  // A lot reserved to suppliers based in Hampshire's county area leaves Southampton out: asked, not assumed
  const hampshire = judged(curtains({ tender: { otherRequirements: { reservedParticipationLocation: { description: "Hampshire", gazetteer: { identifiers: ["E10000014"] } } } } }));
  assert.equal(hampshire.keep, true);
  assert.ok(hampshire.why.includes("только для поставщиков из: Hampshire — уточнить"));
  assert.equal(judged(curtains({ tender: { otherRequirements: { reservedParticipationLocation: { description: "Southampton", gazetteer: { identifiers: ["E06000045"] } } } } })).keep, true);
});

test("postcodes within reach are read by their outward code", () => {
  for (const near of ["SO14 7LY", "so50 4pe", "PO19 1RQ", "BH1 1AA", "SP10 3AA", "GU31 4EA", "RG21 7PJ", "BN11 1HA", "DT1 1XJ"]) assert.equal(nearPostcode(near), true, near);
  // GU3 is Guildford, not Petersfield's GU31; written without a space it is still GU3
  for (const far of ["GU31YJ", "GU1 4RL", "LA1 4YW", "SW1A 1AA", "RG1 2AB", "BN2 1AA", "", "SO"]) assert.equal(nearPostcode(far), false, far);
});

test("Contracts Finder: coordinates decide distance, and 'not a framework' is not one", () => {
  const winchester: ContractsFinderItem = {
    id: "cf-1",
    title: "Curtains for council flats",
    description: "This is not a framework agreement. Making up of lined curtains.",
    cpvCodes: "39515000",
    valueHigh: 12_000,
    postcode: "SO23 9LJ",
    coordinates: "51.0632,-1.3080",
    isSuitableForSme: true,
    deadlineDate: "2026-11-01T12:00:00Z",
  };
  const facts = factsFromContractsFinder(winchester);
  assert.equal(facts.framework, false);
  const verdict = judgeTender(facts, NOW);
  assert.equal(verdict.keep, true, verdict.drop.join(" · "));
  assert.ok(verdict.why.some((w) => w.startsWith("рядом:")));
  const leeds = judgeTender(factsFromContractsFinder({ ...winchester, postcode: "LS1 1UR", coordinates: "53.7997,-1.5492" }), NOW);
  assert.match(leeds.drop.join(), /далеко: \d+ км/);
});

test("a tender without its own facts is not judged by its words any more", () => {
  const verdict = judge({ source: "contractsFinder", url: "x", title: "Curtains wanted", text: "Making up curtains, Hampshire", askingByNature: true }, NOW);
  assert.equal(verdict.keep, false);
});

test("Find a Tender: one find per procurement and stage — a change replaces the call, a cancellation withdraws it", async () => {
  const call = { ...curtains(), id: "097000-2026", ocid: "ocds-x-1", date: "2026-10-13T09:00:00Z" };
  const change = { ...curtains({ tender: { tenderPeriod: { endDate: "2026-11-20T12:00:00Z" } } }), id: "098000-2026", ocid: "ocds-x-1", tag: ["tenderUpdate"], date: "2026-10-14T09:00:00Z" };
  const read = async (releases: OcdsRelease[]) =>
    (await fromFindATender((async () => Response.json({ releases, links: {} })) as unknown as typeof fetch, new Date("2026-10-13T06:30:00Z"))).candidates;
  const both = await read([change, call]);
  assert.equal(both.length, 1);
  assert.equal(both[0].url, "https://www.find-tender.service.gov.uk/Notice/098000-2026", "the newest version");
  assert.equal(both[0].deadline, "2026-11-20T12:00:00Z");
  assert.equal(both[0].key, "ocds-x-1#tender");
  const cancelled = { ...call, id: "099000-2026", tag: ["tenderCancellation"], date: "2026-10-15T09:00:00Z", tender: { ...call.tender, status: "cancelled" } };
  assert.deepEqual(await read([call, cancelled]), [], "cancelled before the morning: nothing to tell");
  // A market engagement, then the call: two stages, two finds
  const engagement = { ...call, id: "096000-2026", tag: ["planning"], date: "2026-10-10T09:00:00Z" };
  assert.equal((await read([engagement])).at(0)?.key, "ocds-x-1#planning");
});

test("Find a Tender: open calls and market engagement are read, with the place and the interest deadline", async () => {
  assert.equal(liveRelease(curtains()), true);
  assert.equal(liveRelease({ ...curtains(), tag: ["planningUpdate"] }), true, "early: a market engagement");
  assert.equal(liveRelease({ ...curtains(), tag: ["award"] }), false);
  assert.equal(liveRelease({ ...curtains(), tender: { ...curtains().tender, status: "complete" } }), false);
  const lancaster = FIXTURES.releases["096500-2026"];
  const fetcher = (async () => Response.json({ releases: [lancaster, curtains()], links: {} })) as unknown as typeof fetch;
  const { candidates } = await fromFindATender(fetcher, new Date("2026-10-13T06:30:00Z"));
  const winchester = candidates.find((c) => c.title.startsWith("Making up"))!;
  assert.equal(winchester.place, "Winchester · Центральный Хэмпшир", "the place is read where Find a Tender puts it");
  const lanc = candidates.find((c) => c.title.startsWith("Specialised"))!;
  assert.equal(lanc.deadline, lancaster.tender?.expressionOfInterestDeadline, "a deadline for interest counts as the deadline");
  assert.ok(lanc.deadline);
  assert.equal(judge(lanc, NOW).keep, false);
});
