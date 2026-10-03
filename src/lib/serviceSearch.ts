import { LOCAL_SERVICES } from "./localServices";
import { lowestPrice } from "./siteCopy";

/**
 * The atelier's side of site search.
 *
 * Search used to look only at the shop's products and gift boxes, so the
 * words clients actually type — hem, wedding, curtains, school uniform —
 * found nothing, and "zip" offered a corduroy pouch. The money comes from the
 * atelier, so its services are matched here, from the same copy and price
 * lists the service pages print, and shown before any product.
 *
 * Pure and static: no Sanity read, so these answers survive the dataset being
 * slow or down.
 */

export interface ServiceHit {
  _id: string;
  kind: "service";
  name: string;
  href: string;
  /** Small line under the name */
  label: string;
  /** "from £8": as the page prints it, not a number of pence */
  priceLabel: string | null;
}

interface Entry extends ServiceHit {
  /** What the service is called: a hit here is what the person is after */
  titleWords: string[];
  /** What else it covers, from its price list: still a hit, ranked lower */
  otherWords: string[];
}

/**
 * Words people use that a page's own copy does not, page by page. "Zipper" is
 * not a prefix of "zip", and nobody searching "bride" types "bridal".
 */
const EXTRA_WORDS: Record<string, string[]> = {
  "wedding-dress-southampton": ["bridal", "bride", "bridesmaid", "gown", "dress", "dresses"],
  "school-uniform-southampton": ["school", "uniform", "children", "kids", "blazer", "skirt", "hem", "hemming"],
  "prom-and-evening-dress-southampton": ["prom", "ball", "gown", "evening", "formal", "dress", "dresses"],
  "jeans-and-trousers-southampton": ["jeans", "trousers", "denim", "hem", "hemming", "shorten", "taper", "waist"],
  "zip-replacement-southampton": ["zip", "zipper", "zips", "repair", "repairs", "mend", "mending", "tear", "coat", "jacket"],
  "curtains-and-home-southampton": ["curtain", "curtains", "blind", "blinds", "cushion", "home", "napkins"],
};

/** Words that say nothing about which job: "alterations near me" is "alterations" */
const STOP_WORDS = new Set(["a", "an", "and", "the", "in", "on", "for", "of", "to", "my", "me", "near", "with", "your"]);

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
}

/** "from £8", or nothing when a page lists no price */
function fromPrice(price: string | null): string | null {
  return price ? `from ${price}` : null;
}

/**
 * The overview first, so "alterations" opens on every price at once, then
 * each service page. On a tie this is the order shown.
 */
const ENTRIES: Entry[] = [
  {
    _id: "service:alterations",
    kind: "service",
    name: "Alterations & repairs — all prices",
    href: "/alterations",
    label: "Southampton atelier · by appointment",
    priceLabel: fromPrice(lowestPrice()),
    titleWords: [
      "alterations", "alteration", "alter", "altering", "repairs", "repair", "mending", "mend", "seamstress",
      "tailor", "tailors", "dressmaker", "prices", "price",
    ],
    otherWords: [],
  },
  ...LOCAL_SERVICES.map((service) => ({
    _id: `service:${service.slug}`,
    kind: "service" as const,
    name: service.h1.replace(/ in Southampton$/, ""),
    href: `/alterations/${service.slug}`,
    label: `Alterations · ${service.eyebrow}`,
    // The cheapest job on the page: its first line can be a dearer one
    priceLabel: fromPrice(lowestPrice(service.prices)),
    titleWords: [
      ...wordsOf(service.h1),
      ...wordsOf(service.serviceName),
      ...wordsOf(service.eyebrow),
      ...wordsOf(service.slug),
      ...(EXTRA_WORDS[service.slug] ?? []),
    ],
    otherWords: service.prices.flatMap((line) => wordsOf(line.name)),
  })),
  {
    _id: "service:custom",
    kind: "service",
    name: "Custom sewing & made to measure",
    href: "/atelier",
    label: "Southampton atelier",
    priceLabel: null,
    titleWords: ["custom", "bespoke", "made", "measure", "tailoring", "sewing"],
    otherWords: ["tailor", "dressmaker", "seamstress"],
  },
  {
    _id: "service:book",
    kind: "service",
    name: "Choose a time for a fitting",
    href: "/atelier#book",
    label: "Book online · Southampton",
    priceLabel: null,
    titleWords: ["book", "booking", "appointment", "fitting", "visit", "consultation"],
    otherWords: [],
  },
];

/** The most services shown, so a broad word still leaves room for the shop */
export const MAX_SERVICE_HITS = 4;

/** "curtains" also tries "curtain", "dresses" also "dress" */
function formsOf(word: string): string[] {
  const forms = [word];
  if (word.length > 4 && word.endsWith("es")) forms.push(word.slice(0, -2));
  if (word.length > 3 && word.endsWith("s")) forms.push(word.slice(0, -1));
  return forms;
}

/**
 * The services a query is about. Every meaningful word of the query has to
 * start some word of the service (as GROQ's `match` does for products, so
 * "wedd" finds the wedding page). A whole word in the service's name ranks
 * above one in its price list, and either above a prefix: "zip" is the zip
 * page first, then the pages that list a zip among other jobs.
 */
export function searchServices(query: string, limit = MAX_SERVICE_HITS): ServiceHit[] {
  const terms = wordsOf(query).filter((word) => !STOP_WORDS.has(word));
  if (terms.length === 0) return [];

  const scored: { entry: Entry; score: number; index: number }[] = [];
  ENTRIES.forEach((entry, index) => {
    let score = 0;
    for (const term of terms) {
      const forms = formsOf(term);
      const words = [...entry.titleWords, ...entry.otherWords];
      if (entry.titleWords.some((word) => forms.includes(word))) score += 3;
      else if (entry.otherWords.some((word) => forms.includes(word))) score += 2;
      else if (words.some((word) => forms.some((form) => word.startsWith(form)))) score += 1;
      else return;
    }
    scored.push({ entry, score, index });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => ({
      _id: entry._id,
      kind: entry.kind,
      name: entry.name,
      href: entry.href,
      label: entry.label,
      priceLabel: entry.priceLabel,
    }));
}
