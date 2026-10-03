import { pounds } from "./friendsLink";

/**
 * Collection and return.
 *
 * The best-paid work is often the heaviest to carry: four curtain panels, a
 * winter coat, a bag of school uniform. And the atelier's address is not
 * published, so "bring it round" always needed a message first. Since
 * 30 September 2026 things are collected and brought back, priced by postcode
 * district rather than by the mile, so a customer sees the price the moment
 * they type their postcode and nobody measures a map.
 *
 * Kristina drives, from 3 October 2026. So there are no set windows: the
 * customer says when they are usually in, and Kristina picks a time from her
 * diary in the Studio ("🚗 Назначить забор"). That time is taken from the
 * diary for the whole trip, since nobody can be pinned in the atelier while
 * she is out (see the "collect" action in /api/studio/diary).
 *
 * Plain data and plain functions, shared by the booking form (which shows the
 * price as they type) and the booking route (which decides again, because a
 * form is only ever a suggestion). The numbers live in the Studio, Настройки
 * сайта → «Забор и доставка»; the defaults below are only what the site uses
 * when a field there is empty.
 */

export interface CollectionZone {
  /** Where it is, as the customer reads it: "Southampton" */
  name: string;
  /** Postcode districts, the half before the space: "SO17" */
  districts: string[];
  /** Pence for collection and return together, charged below `freeFrom` */
  fee: number;
  /** Pence: an order this size or more is collected free. 0 means there is no free threshold. */
  freeFrom: number;
}

export interface CollectionSettings {
  enabled: boolean;
  zones: CollectionZone[];
  /** Which jobs it suits, one or two lines of English under the choice */
  note: string;
}

/**
 * How long a trip can take in the diary, in minutes, as Kristina picks it when
 * she gives a collection its time. The diary is in half-hour slots.
 */
export const COLLECTION_TRIP_MINUTES = [30, 60, 90, 120] as const;
export const DEFAULT_TRIP_MINUTES = 60;

/** The longest "when suits you" the form keeps: a line, not a letter. */
export const WHEN_MAX = 120;

/**
 * What was agreed on 29 September 2026. The city is free from the average
 * order up, because the point of collecting is bigger orders and a home
 * address nobody has to be given, not a profit on the driving; the outer ring
 * costs more because it is two to three times the miles.
 *
 * No times here: Kristina chooses each one from her diary.
 */
export const COLLECTION_DEFAULTS: CollectionSettings = {
  enabled: true,
  zones: [
    {
      name: "Southampton",
      districts: ["SO14", "SO15", "SO16", "SO17", "SO18", "SO19"],
      fee: 800,
      freeFrom: 4000,
    },
    {
      name: "Hedge End, Totton, Eastleigh and Chandler's Ford",
      districts: ["SO30", "SO40", "SO50", "SO53"],
      fee: 1200,
      freeFrom: 8000,
    },
  ],
  note: "Best for curtains, zips, repairs and hems you've pinned yourself. Dresses and trousers that need pinning on you are best at a fitting.",
};

const OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const INWARD = /^\d[A-Z]{2}$/;

function tidy(input: string): string {
  // "S0" with a zero is the typo everybody in Southampton makes, and no
  // postcode area is "S0", so reading it as "SO" can only ever help
  return input.trim().toUpperCase().replace(/^S0(?=\d)/, "SO");
}

/**
 * The district of a UK postcode, "so17 1ab" → "SO17", or null when it is not
 * one. The half before the space is enough to price a collection, and it is
 * all the site keeps: the full address is agreed in a message.
 *
 * Read from the first word when there is a space, so the price stays on screen
 * while the rest of the postcode is still being typed.
 */
export function postcodeDistrict(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = tidy(input);
  const [first, ...rest] = raw.split(/\s+/);
  // Only while what follows could still become the second half — "1", "1A", "1AB"
  if (rest.length > 0 && OUTWARD.test(first) && /^(\d[A-Z]{0,2})?$/.test(rest.join(""))) return first;
  const joined = raw.replace(/\s+/g, "");
  if (joined.length < 2 || joined.length > 7) return null;
  const outward = joined.length >= 5 && INWARD.test(joined.slice(-3)) ? joined.slice(0, -3) : joined;
  return OUTWARD.test(outward) ? outward : null;
}

/** The postcode as it is written on an envelope, "so171ab" → "SO17 1AB", or the district alone. */
export function formatPostcode(input: unknown): string | null {
  const district = postcodeDistrict(input);
  if (!district || typeof input !== "string") return district;
  const joined = tidy(input).replace(/\s+/g, "");
  const inward = joined.slice(district.length);
  return INWARD.test(inward) ? `${district} ${inward}` : district;
}

/**
 * Whether a postcode typed so far is on its way to one of these districts:
 * "SO1" before the 7 of SO17, "SO5" before the 3 of SO53. Each of those is a
 * district in its own right, so the form holds its "sorry" until this is
 * false — nobody is turned away halfway through typing their own postcode.
 */
export function onItsWayTo(districts: string[], input: string): boolean {
  const typed = tidy(input).replace(/\s+/g, "");
  return typed.length > 0 && districts.some((d) => d.length > typed.length && d.startsWith(typed));
}

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function zoneFrom(raw: unknown): CollectionZone | null {
  if (!raw || typeof raw !== "object") return null;
  const zone = raw as Record<string, unknown>;
  const name = typeof zone.name === "string" ? zone.name.trim() : "";
  const districts = Array.isArray(zone.districts)
    ? [...new Set(zone.districts.map((d) => postcodeDistrict(d)).filter((d): d is string => d !== null))]
    : [];
  // A zone with no price is not free, it is unfinished: offering it would
  // promise something nobody decided
  const fee = money(zone.fee);
  if (!name || districts.length === 0 || fee === null) return null;
  return { name, districts, fee, freeFrom: money(zone.freeFrom) ?? 0 };
}

/**
 * The settings as the Studio holds them, with the defaults under anything
 * left empty. A list that is there but empty is taken at its word: no zones
 * means nowhere to collect from. The windows the Studio may still hold from
 * before Kristina drove are not read.
 */
export function collectionSettingsFrom(raw: unknown): CollectionSettings {
  const defaults = COLLECTION_DEFAULTS;
  if (!raw || typeof raw !== "object") {
    return { ...defaults, zones: defaults.zones.map((z) => ({ ...z, districts: [...z.districts] })) };
  }
  const settings = raw as Record<string, unknown>;
  const zones = Array.isArray(settings.zones)
    ? settings.zones.map(zoneFrom).filter((z): z is CollectionZone => z !== null)
    : defaults.zones.map((z) => ({ ...z, districts: [...z.districts] }));
  const note = typeof settings.note === "string" && settings.note.trim() ? settings.note.trim() : defaults.note;
  return { enabled: settings.enabled !== false, zones, note };
}

export function collectionOffered(settings: CollectionSettings): boolean {
  return settings.enabled && settings.zones.length > 0;
}

export function zoneFor(settings: Pick<CollectionSettings, "zones">, district: string | null): CollectionZone | null {
  if (!district) return null;
  return settings.zones.find((zone) => zone.districts.includes(district)) ?? null;
}

/** What it costs, as the customer reads it: "Free on orders from £40, otherwise £8". */
export function collectionTerms(zone: Pick<CollectionZone, "fee" | "freeFrom">): string {
  if (zone.fee <= 0) return "Free";
  if (zone.freeFrom <= 0) return pounds(zone.fee);
  return `Free on orders from ${pounds(zone.freeFrom)}, otherwise ${pounds(zone.fee)}`;
}

/** The one line a page shows: "Free collection & return in Southampton on orders from £40". */
export function collectionHeadline(zone: CollectionZone): string {
  if (zone.fee <= 0) return `Free collection & return in ${zone.name}`;
  if (zone.freeFrom <= 0) return `Collection & return in ${zone.name}, ${pounds(zone.fee)}`;
  return `Free collection & return in ${zone.name} on orders from ${pounds(zone.freeFrom)}`;
}

/** What the booking form is handed: enough to price a postcode as it is typed, nothing more. */
export interface CollectionOffer {
  zones: { name: string; districts: string[]; terms: string }[];
  note: string;
  headline: string;
}

export function collectionOffer(settings: CollectionSettings): CollectionOffer | null {
  if (!collectionOffered(settings)) return null;
  return {
    zones: settings.zones.map((zone) => ({ name: zone.name, districts: zone.districts, terms: collectionTerms(zone) })),
    note: settings.note,
    headline: collectionHeadline(settings.zones[0]),
  };
}

/** What a booking keeps about a collection: the district, never the street. */
export interface CollectionRequest {
  district: string;
  zone: string;
  terms: string;
}

/**
 * `when` is what the customer typed about when they are usually in. It is
 * their own words, so it never goes into the booking's public fields: the
 * route seals it with their notes and puts it in Kristina's email.
 */
export type CollectionVerdict =
  | { ok: true; request: CollectionRequest; postcode: string; when?: string }
  | { ok: false; error: string };

/** "  weekday\n mornings  " → "weekday mornings", cut to a line; nothing when nothing was said. */
export function whenSuits(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const line = input
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, WHEN_MAX)
    .trim();
  return line || undefined;
}

/**
 * Whether a collection can be promised, decided on the server from the
 * settings as they are now. The form shows the same answer while the
 * customer types, but only this one is kept: a stale page, or a request
 * written by hand, must not book a collection from a district nobody drives to.
 */
export function judgeCollection(settings: CollectionSettings, input: unknown): CollectionVerdict {
  if (!collectionOffered(settings)) {
    return { ok: false, error: "Collection isn't available at the moment. Please book a fitting, or message us on WhatsApp." };
  }
  const { postcode, when } = (input && typeof input === "object" ? input : {}) as {
    postcode?: unknown;
    when?: unknown;
  };
  const district = postcodeDistrict(postcode);
  if (!district) return { ok: false, error: "Please enter your postcode, like SO17 1AB." };
  const zone = zoneFor(settings, district);
  if (!zone) {
    return {
      ok: false,
      error: `Sorry, we don't collect from ${district} yet. You're welcome to book a fitting, or message us on WhatsApp.`,
    };
  }
  // When they are in is a preference and never a reason to refuse: Kristina
  // picks the time from her diary and tells them
  const said = whenSuits(when);
  return {
    ok: true,
    postcode: formatPostcode(postcode) ?? district,
    request: { district, zone: zone.name, terms: collectionTerms(zone) },
    ...(said ? { when: said } : {}),
  };
}
