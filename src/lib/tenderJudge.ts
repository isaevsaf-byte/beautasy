/**
 * Whether a public tender is work Kristina could take: one person, sewing at
 * home in Southampton, a sole trader with no limited company (16.10.2026).
 *
 * The first judge read words. It sent Lancaster University's £2.5m cleaning
 * framework because Lot 5 cleaned "upholstery, curtains"; replayed over a
 * fortnight it would also have sent a housing association's entrance doors
 * ("curtain walling") and a schools' cleaning contract ("tailor their
 * approach"). Over two years of "curtains" notices four in five of what it
 * kept were not sewing at all.
 *
 * So a tender is judged on what the buyer filled in, lot by lot, before any
 * word is read: what is being bought (its CPV codes), how much, whether it is
 * a framework that guarantees no work, where it is delivered or who is
 * buying, whether it is reserved for someone else, and whether there is time
 * to answer. Words only decide between codes that could go either way.
 *
 * Expect silence. A fortnight of every tender in the country held nothing
 * a one-person atelier could win; real local curtain or costume work comes a
 * few times a year. A sole trader may bid — the Procurement Act 2023 needs
 * no company, and below £30k a council may not shortlist by questionnaire —
 * but frameworks for the national contract furnishers are not her market.
 *
 * Pure, so the tests can hand it real notices: @/lib/leadSources reads the
 * two APIs into TenderFacts with factsFromRelease / factsFromContractsFinder.
 */

// ─── What is being bought: CPV codes, eight digits without the check digit

/** The lot IS her work: no words needed */
export const CRAFT_CPV: Readonly<Record<string, string>> = {
  "39515000": "шторы и портьеры",
  "39515100": "шторы",
  "39515200": "портьеры",
  "39515300": "ламбрекены",
  "39516000": "текстиль для интерьера",
  "39516100": "текстиль для интерьера",
  "39516110": "подушки",
  "98393000": "пошив на заказ",
  "50830000": "ремонт одежды и текстиля",
};

/**
 * Could be her work, or a factory's: counts only when the lot's own words are
 * her craft. Clothing and uniforms are mostly bulk supply; a lot that says
 * "alterations to uniforms" or "costumes" is the exception.
 */
export const MAYBE_CPV: Readonly<Record<string, string>> = {
  // Blinds: a school's roller blinds are fitting, a Roman blind is sewing — the words decide
  "39515400": "жалюзи",
  "39515410": "жалюзи для помещений",
  "39515420": "тканевые шторы",
  "98394": "обивка",
  "39500": "текстильные изделия",
  "39510": "домашний текстиль",
  "39518": "больничный текстиль",
  "39520": "текстильные изделия",
  "39525": "текстильные изделия",
  "39561": "тесьма и отделка",
  "18": "одежда",
  "35811": "форменная одежда",
  "35812": "военная форма",
  "92312": "театр и искусство",
  // Contracts Finder often carries only the division: the words decide
  "39000000": "текстиль и мебель",
  "92000000": "культура",
  "98000000": "прочие услуги",
  "50000000": "ремонт",
};

/** Never hers, whatever a lot's words say */
export const NEVER_CPV: Readonly<Record<string, string>> = {
  "909": "уборка",
  "9831": "прачечная и химчистка",
  "45": "строительство",
  "44": "стройматериалы",
  "391": "мебель",
  "397": "бытовая техника",
  "39515110": "противодымные шторы",
  "39515430": "жалюзи",
  "39515440": "вертикальные жалюзи",
  "39518200": "одноразовые простыни",
  "185": "ювелирные изделия",
  "188": "обувь",
  "1814": "средства защиты",
  "1844": "головные уборы и каски",
  "18424": "перчатки",
  "35815": "бронежилеты",
};

/** Her craft in a lot's own words — never a bare "tailor" or "alteration", which in tenders are "tailored support" and building work */
export const CRAFT_WORDS =
  /\b(alterations? (to|of) (garments|clothing|uniforms?|curtains|dresses)|alterations? service|garment alterations?|uniform alterations?|tailoring (service|work)s?|made[- ]to[- ]measure|dressmak(er|ing)|seamstress|sewing|sewn|stitching|costumes?\b(?! jewel)|wardrobe (department|assistant|supervisor|maintenance)|curtains?\b(?![- ]?wall|[- ]sided)|drapes\b|valances?|pelmets?|roman blinds?|cushions?\b|soft furnishings?|re-?upholster|upholstery|hemming|repairs? (to|of) (garments|clothing|uniforms|linen|textiles))/i;

/** In a lot's title, these make a textile word cleaning, building or bulk supply */
export const NOT_SEWING_TITLE =
  /\b(cleaning|deep clean|laundry|laundering|dry[- ]clean|wash(ing)?|steam clean|plastic|PPE|protective)\b/i;

/** Anywhere in the notice, these are specialist products, not sewing: a hospital's disposable cubicle curtains, a fire curtain, a glass facade */
export const SPECIALIST =
  /\b(anti-?ligature|disposable|cubicle curtains?|curtain[- ]?wall(ing)?|curtain[- ]sided|fire curtains?|smoke curtains?|roller shutters?)\b/i;

// ─── Where: about an hour from Westwood Road

/**
 * Delivery regions within reach, NUTS/ITL as Find a Tender writes them,
 * checked against the buyers' own postcodes over a fortnight of notices:
 * SO → UKJ32/35/36, PO → UKJ31/34/35, BH and DT → UKK24/25, SP → UKJ36 or
 * UKK15, Worthing and Chichester → UKJ27, Crawley → UKJ28, Basingstoke → UKJ37.
 */
export const NEAR_REGIONS: Readonly<Record<string, string>> = {
  UKJ3: "Хэмпшир и остров Уайт",
  UKJ31: "Портсмут",
  UKJ32: "Саутгемптон",
  UKJ34: "остров Уайт",
  UKJ35: "Южный Хэмпшир",
  UKJ36: "Центральный Хэмпшир",
  UKJ37: "Северный Хэмпшир",
  UKK21: "Борнмут и Пул",
  UKK22: "Дорсет",
  UKK24: "Борнмут, Крайстчерч и Пул",
  UKK25: "Дорсет",
  UKK15: "Уилтшир",
  UKJ27: "Западный Сассекс",
  UKJ28: "Западный Сассекс",
};

/** The whole country, or a region too large to say: the buyer's own address decides */
export const BROAD_REGIONS = new Set(["UK", "GB", "UKJ", "UKK", "UKJ2", "UKK1", "UKK2"]);

/** A postcode's outward code within reach: SO, PO, BH, SP, DT; Petersfield to Haslemere; Basingstoke; Worthing to Brighton */
export function nearPostcode(postcode: string | undefined): boolean {
  const compact = (postcode ?? "").replace(/\s+/g, "").toUpperCase();
  if (compact.length < 5) return false;
  const outward = compact.slice(0, -3);
  return /^(SO|PO|BH|SP|DT)\d{1,2}$|^GU3[0-5]$|^RG2[1-9]$|^BN1[0-8]$/.test(outward);
}

const SOUTHAMPTON = { lat: 50.9097, lon: -1.4044 };
/** The same reach as the regions above: Weymouth, Chippenham and Crawley are all about 80–90 km */
export const NEAR_KM = 90;

export function kmFromSouthampton(lat: number, lon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat - SOUTHAMPTON.lat);
  const dLon = rad(lon - SOUTHAMPTON.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(SOUTHAMPTON.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * A lot reserved to suppliers "located in" somewhere means where the supplier
 * is based (PPN 005). She is based in Southampton: the whole UK, Great
 * Britain, England or Southampton itself let her in; Hampshire's county
 * council area (which leaves Southampton out) and the South East need asking;
 * anywhere else is closed to her.
 */
export const RESERVED_FOR_HER = new Set(["K02000001", "K03000001", "K04000001", "E92000001", "E06000045"]);
export const RESERVED_ASK = new Set(["E10000014", "E12000008"]);

// ─── Money: one person and a home atelier

/** A lot worth more than this over its whole term is a contract furnisher's, not hers */
export const MAX_LOT_VALUE = 50_000;
/** A framework above this is a list of big suppliers that guarantees nobody any work */
export const MAX_FRAMEWORK_VALUE = 100_000;
/** Fewer days than this to answer and there is no time to read it, ask and quote */
export const MIN_DAYS_TO_ANSWER = 3;

export interface TenderLot {
  id: string;
  title?: string;
  description?: string;
  cpv: string[];
  value?: number;
}

export interface TenderFacts {
  source: "findATender" | "contractsFinder";
  title: string;
  description: string;
  /** A call for bids, or notice of one to come (market engagement, a pipeline) */
  kind: "tender" | "planning";
  /** Every CPV code on the notice */
  cpv: string[];
  lots: TenderLot[];
  value?: number;
  framework: boolean;
  dps: boolean;
  /** Where the work is delivered, NUTS/ITL */
  deliveryRegions: string[];
  buyerRegion?: string;
  buyerPostcode?: string;
  buyerTown?: string;
  /** Contracts Finder: where the notice says it is */
  coordinates?: { lat: number; lon: number };
  /** Contracts Finder: "South East", "Any region" */
  regionNames?: string[];
  smeSuitable?: boolean;
  procurementMethod?: string;
  /** "smeVcse" keeps the big firms out; anything else keeps her out */
  reserved?: string[];
  reservedLocation?: { ids: string[]; description?: string };
  /** ISO: the deadline for bids, or for expressions of interest */
  deadline?: string;
}

export interface TenderVerdict {
  keep: boolean;
  score: number;
  /** In Russian, for «Почему показали» */
  why: string[];
  /** Why not, in Russian — for the tests and the logs */
  drop: string[];
  /** Where, in words she reads: "Винчестер · Центральный Хэмпшир" */
  place?: string;
  /** The value of the lot that is hers, when the buyer gave one */
  lotValue?: number;
}

function labelOf(code: string, table: Readonly<Record<string, string>>): string | null {
  const prefix = Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .find((p) => code.startsWith(p));
  return prefix ? table[prefix] : null;
}

const pounds = (value: number) => `£${Math.round(value).toLocaleString("en-GB")}`;

/** Her craft in this lot, and whether its codes say so without words */
function craftOf(lot: TenderLot, notice: TenderFacts): { label: string; sure: boolean } | null {
  const single = notice.lots.length <= 1;
  const title = `${lot.title ?? ""}${single ? `\n${notice.title}` : ""}`;
  const words = `${title}\n${lot.description ?? ""}${single ? `\n${notice.description}` : ""}`;
  if (NOT_SEWING_TITLE.test(title)) return null;
  // A "never" code is skipped, so a lot coded only as cleaning or building is never hers
  const codes = lot.cpv.length ? lot.cpv : notice.cpv;
  const craftCodes = codes.filter((code) => !labelOf(code, NEVER_CPV) && CRAFT_CPV[code]);
  if (craftCodes.length) {
    const label = CRAFT_CPV[craftCodes[0]];
    // Sure when her codes are most of the lot: one curtains code among a repairs
    // contract's eleven (cleaning, building, laundry) is a line in someone else's list
    if (codes.length <= 2 || craftCodes.length * 2 >= codes.length) return { label, sure: true };
    // Otherwise the lot's own title has to say it — not its description, where
    // an office chair's "seat cushions" would count
    if (CRAFT_WORDS.test(title)) return { label, sure: false };
  }
  for (const code of codes) {
    if (labelOf(code, NEVER_CPV)) continue;
    const maybe = labelOf(code, MAYBE_CPV);
    if (maybe && CRAFT_WORDS.test(words)) return { label: maybe, sure: false };
  }
  return null;
}

/**
 * A lot's own value can be a year's while the notice's is the whole term:
 * Lancaster's eight lots added up to a fifth of its total. When they do not
 * add up, the lot's share of the total is the honest size.
 */
function sizeOf(lot: TenderLot, notice: TenderFacts): number | undefined {
  if (notice.lots.length <= 1) return lot.value ?? notice.value;
  if (lot.value === undefined) return undefined;
  const sum = notice.lots.reduce((total, l) => total + (l.value ?? 0), 0);
  if (!notice.value || !sum || Math.abs(sum - notice.value) <= 1) return lot.value;
  return Math.max(lot.value, (notice.value * lot.value) / sum);
}

/** Near, the whole country, or too far — and where, in words */
export function whereIs(notice: TenderFacts): { near: boolean; broad: boolean; place?: string; far?: string } {
  const town = notice.buyerTown?.trim();
  if (notice.source === "contractsFinder") {
    const km = notice.coordinates ? kmFromSouthampton(notice.coordinates.lat, notice.coordinates.lon) : null;
    const place = [town, notice.buyerPostcode?.toUpperCase()].filter(Boolean).join(", ") || undefined;
    if (km !== null) {
      return km <= NEAR_KM ? { near: true, broad: false, place: place ?? `${Math.round(km)} км` } : { near: false, broad: false, far: `${Math.round(km)} км${place ? ` (${place})` : ""}` };
    }
    if (notice.buyerPostcode && /^[A-Z]{1,2}\d/i.test(notice.buyerPostcode.trim())) {
      return nearPostcode(notice.buyerPostcode) ? { near: true, broad: false, place } : { near: false, broad: false, far: place };
    }
    const names = notice.regionNames ?? [];
    if (!names.length || names.some((name) => /any region|south east|south west/i.test(name))) return { near: false, broad: true, place: names.join(", ") || undefined };
    return { near: false, broad: false, far: names.join(", ") };
  }

  const nearName = (code: string) => {
    const hit = Object.keys(NEAR_REGIONS)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => code.startsWith(prefix));
    return hit ? NEAR_REGIONS[hit] : null;
  };
  const delivered = notice.deliveryRegions.filter(Boolean);
  for (const code of delivered) {
    const name = nearName(code);
    if (name) return { near: true, broad: false, place: [town, name].filter(Boolean).join(" · ") };
  }
  const coarse = delivered.some((code) => BROAD_REGIONS.has(code));
  if (delivered.length && !coarse) return { near: false, broad: false, far: [town, ...delivered.slice(0, 3)].filter(Boolean).join(", ") };
  // No place of delivery, or the whole country or a large region: the buyer's own address decides
  const buyerName = notice.buyerRegion ? nearName(notice.buyerRegion) : null;
  if (buyerName || nearPostcode(notice.buyerPostcode)) {
    return { near: true, broad: false, place: [town, buyerName].filter(Boolean).join(" · ") || notice.buyerPostcode };
  }
  // A region delivered by a buyer inside it ("UKJ" from Kent, "UKK" from Cornwall): the work is in their patch
  const national = delivered.some((code) => code === "UK" || code === "GB");
  if (coarse && !national && notice.buyerRegion && delivered.some((code) => BROAD_REGIONS.has(code) && notice.buyerRegion!.startsWith(code))) {
    return { near: false, broad: false, far: [town, notice.buyerRegion].filter(Boolean).join(", ") };
  }
  // Delivered anywhere, by a buyer elsewhere: possible, flagged
  if (coarse) return { near: false, broad: true, place: town };
  // Nothing said about delivery: the work is where the buyer is
  const buyerKnown = notice.buyerRegion || notice.buyerPostcode;
  return buyerKnown
    ? { near: false, broad: false, far: [town, notice.buyerRegion].filter(Boolean).join(", ") }
    : { near: false, broad: true, place: town };
}

/**
 * The verdict. Kept only when every gate holds: a lot that is her craft, of
 * a size one person can take, not a framework that promises nothing, within
 * reach (or the whole country, flagged), not reserved for someone else, and
 * with days left to answer.
 */
export function judgeTender(notice: TenderFacts, now: Date): TenderVerdict {
  const why: string[] = [];
  const drop: string[] = [];
  let score = 0;

  // 1. Her craft, lot by lot
  const lots: TenderLot[] = notice.lots.length
    ? notice.lots
    : [{ id: "1", title: notice.title, description: notice.description, cpv: notice.cpv, value: notice.value }];
  const everything = `${notice.title}\n${notice.description}\n${lots.map((l) => `${l.title ?? ""}\n${l.description ?? ""}`).join("\n")}`;
  const specialist = SPECIALIST.exec(everything);
  const mine = specialist ? [] : lots.map((lot) => ({ lot, craft: craftOf(lot, notice) })).filter((x) => x.craft !== null);
  if (specialist) drop.push(`не шитьё: «${specialist[0]}»`);
  else if (mine.length === 0) {
    const codes = notice.cpv.slice(0, 3).map((code) => [code, labelOf(code, NEVER_CPV)].filter(Boolean).join(" "));
    drop.push(`не шитьё по коду закупки: ${codes.join(", ") || "кодов нет"}`);
  } else {
    for (const { lot, craft } of mine) {
      why.push(`${lots.length > 1 ? `лот ${lot.id}: ` : ""}${craft!.label}`);
      score += craft!.sure ? 6 : 3;
    }
  }

  // 2. Money: the smallest of her lots decides
  const sizes = mine.map(({ lot }) => sizeOf(lot, notice)).filter((v): v is number => typeof v === "number" && v > 0);
  let lotValue: number | undefined;
  if (mine.length && sizes.length === mine.length) {
    lotValue = Math.min(...sizes);
    if (lotValue > MAX_LOT_VALUE) drop.push(`велико для одной мастерской: ${pounds(lotValue)}`);
    // The message's header shows the whole notice: her lot's own sum is said as such
    else why.push(lots.length > 1 ? `сумма лота: ${pounds(lotValue)}` : pounds(lotValue));
  } else if (mine.length) {
    why.push("сумма не указана");
  }

  // 3. Frameworks and dynamic markets
  if (notice.dps) {
    why.push("динамический список: вступить можно в любой момент");
  } else if (notice.framework) {
    if ((notice.value ?? 0) > MAX_FRAMEWORK_VALUE) drop.push(`рамочное соглашение на ${pounds(notice.value!)}: работу не гарантируют`);
    else why.push("рамочное соглашение: работу не гарантируют");
  }

  // 4. Where
  const place = whereIs(notice);
  if (place.near) {
    why.push(`рядом: ${place.place ?? "Хэмпшир"}`);
    score += 3;
  } else if (place.broad) {
    why.push("место не названо или вся страна — уточнить");
  } else {
    drop.push(`далеко: ${place.far ?? "?"}`);
  }

  // 5. Who may bid, and how
  const reserved = notice.reserved ?? [];
  if (reserved.some((r) => r !== "smeVcse")) drop.push("только для соцпредприятий");
  if (reserved.includes("smeVcse")) {
    why.push("только для малого бизнеса — меньше конкурентов");
    score += 2;
  }
  const ids = notice.reservedLocation?.ids ?? [];
  if (ids.length && !ids.some((id) => RESERVED_FOR_HER.has(id))) {
    if (ids.some((id) => RESERVED_ASK.has(id))) why.push(`только для поставщиков из: ${notice.reservedLocation?.description ?? ids.join(", ")} — уточнить`);
    else drop.push(`только для поставщиков из: ${notice.reservedLocation?.description ?? ids.join(", ")}`);
  }
  if (notice.procurementMethod && /^(direct|limited)$/i.test(notice.procurementMethod)) drop.push("без конкурса");
  if (notice.smeSuitable) {
    why.push("подходит малому бизнесу");
    score += 1;
  }

  // 6. Time to answer
  if (notice.deadline) {
    const days = (new Date(notice.deadline).getTime() - now.getTime()) / 86_400_000;
    if (Number.isFinite(days) && days < MIN_DAYS_TO_ANSWER) drop.push(`подать до ${notice.deadline.slice(0, 10)} — не успеть`);
  }
  // First, so no message can cut it: this is not yet a call for bids
  if (notice.kind === "planning") why.unshift("ещё не конкурс — заказчик заранее опрашивает рынок");

  return { keep: drop.length === 0, score, why, drop, place: place.place ?? place.far, lotValue };
}

// ─── Reading the two APIs into facts

interface Classification {
  scheme?: string;
  id?: string;
}

/** A Find a Tender OCDS release, as much of it as the judge reads */
export interface OcdsRelease {
  id: string;
  /** One procurement's id, the same on its planning notice, its call for bids and every change */
  ocid?: string;
  tag?: string[];
  date?: string;
  buyer?: { name?: string };
  parties?: { name?: string; roles?: string[]; address?: { region?: string; postalCode?: string; locality?: string } }[];
  tender?: {
    title?: string;
    description?: string;
    status?: string;
    classification?: Classification;
    items?: {
      relatedLot?: string;
      classification?: Classification;
      additionalClassifications?: Classification[];
      deliveryAddresses?: { region?: string }[];
    }[];
    lots?: { id: string | number; title?: string; description?: string; value?: { amount?: number }; suitability?: { sme?: boolean } }[];
    value?: { amount?: number };
    techniques?: { hasFrameworkAgreement?: boolean; hasDynamicPurchasingSystem?: boolean };
    procurementMethod?: string;
    procurementMethodDetails?: string;
    otherRequirements?: {
      reservedParticipation?: string[];
      reservedParticipationLocation?: { description?: string; gazetteer?: { identifiers?: string[] } };
    };
    tenderPeriod?: { endDate?: string };
    expressionOfInterestDeadline?: string;
  };
}

const cpvOf = (c: Classification | undefined): string[] => (c?.scheme === "CPV" && c.id ? [c.id.slice(0, 8)] : []);

export function factsFromRelease(release: OcdsRelease): TenderFacts {
  const t = release.tender ?? {};
  const items = t.items ?? [];
  const codesFor = (lotId: string | null) =>
    items
      .filter((item) => lotId === null || !item.relatedLot || String(item.relatedLot) === lotId)
      .flatMap((item) => [...cpvOf(item.classification), ...(item.additionalClassifications ?? []).flatMap(cpvOf)]);
  const lots: TenderLot[] = (t.lots ?? []).map((lot) => ({
    id: String(lot.id),
    title: lot.title,
    description: lot.description,
    cpv: [...new Set(codesFor(String(lot.id)))],
    value: lot.value?.amount ?? undefined,
  }));
  const buyer = (release.parties ?? []).find((party) => (party.roles ?? []).includes("buyer"));
  const location = t.otherRequirements?.reservedParticipationLocation;
  return {
    source: "findATender",
    title: t.title ?? "",
    description: t.description ?? "",
    // A notice that is an open call is one, whatever planning tag it also carries
    kind: (release.tag ?? []).some((tag) => tag === "tender" || tag === "tenderUpdate")
      ? "tender"
      : (release.tag ?? []).some((tag) => tag.startsWith("planning"))
        ? "planning"
        : "tender",
    cpv: [...new Set([...cpvOf(t.classification), ...codesFor(null)])],
    lots,
    value: t.value?.amount,
    framework: t.techniques?.hasFrameworkAgreement === true,
    dps: t.techniques?.hasDynamicPurchasingSystem === true || /dynamic market/i.test(t.procurementMethodDetails ?? ""),
    deliveryRegions: [...new Set(items.flatMap((item) => (item.deliveryAddresses ?? []).map((a) => a.region ?? "")).filter(Boolean))],
    buyerRegion: buyer?.address?.region,
    buyerPostcode: buyer?.address?.postalCode,
    buyerTown: buyer?.address?.locality,
    smeSuitable: (t.lots ?? []).some((lot) => lot.suitability?.sme === true) || undefined,
    procurementMethod: t.procurementMethod,
    reserved: t.otherRequirements?.reservedParticipation ?? [],
    reservedLocation: location?.gazetteer ? { ids: location.gazetteer.identifiers ?? [], description: location.description } : undefined,
    deadline: t.tenderPeriod?.endDate ?? t.expressionOfInterestDeadline,
  };
}

/** A Contracts Finder search hit, as much of it as the judge reads */
export interface ContractsFinderItem {
  id: string;
  title: string;
  description?: string;
  organisationName?: string;
  noticeType?: string;
  cpvCodes?: string;
  valueLow?: number;
  valueHigh?: number;
  postcode?: string;
  coordinates?: string;
  regionText?: string;
  isSuitableForSme?: boolean;
  deadlineDate?: string;
  publishedDate?: string;
}

export function factsFromContractsFinder(item: ContractsFinderItem): TenderFacts {
  const text = `${item.title}\n${item.description ?? ""}`;
  const [lat, lon] = String(item.coordinates ?? "").split(",").map(Number);
  return {
    source: "contractsFinder",
    title: item.title,
    description: item.description ?? "",
    kind: item.noticeType === "Pipeline" || item.noticeType === "PreProcurement" ? "planning" : "tender",
    cpv: String(item.cpvCodes ?? "").split(/\s+/).filter(Boolean),
    lots: [],
    value: item.valueHigh || item.valueLow || undefined,
    // "This is not a framework agreement" is not a framework
    framework: /\bframework\b/i.test(text) && !/\bnot (a |an )?framework\b/i.test(text),
    dps: /\bdynamic purchasing\b|\bDPS\b/.test(text),
    deliveryRegions: [],
    buyerPostcode: item.postcode ?? undefined,
    coordinates: Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? { lat, lon } : undefined,
    regionNames: String(item.regionText ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    smeSuitable: item.isSuitableForSme === true || undefined,
    deadline: item.deadlineDate ?? undefined,
  };
}
