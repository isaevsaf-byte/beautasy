import { escapeHtml } from "@/lib/escapeHtml";
import { ATELIER_TIME_ZONE } from "@/lib/slots";

/**
 * The care label in the thank-you email (11.10.2026): every finished piece
 * leaves the atelier with one, as a garment leaves a tailor's.
 *
 * It is drawn from type and one dashed gold line — the topstitch of the
 * site's buttons — and says what only the hands that did the work can say:
 *
 *     BEAUTASY · SOUTHAMPTON
 *     Altered by hand for Anna
 *     Hem taken up 4 cm, 2 cm left in should you want it longer
 *     OCTOBER 2026
 *
 * Kristina never writes English. With «✓ Работа готова» (src/sanity/
 * doneAction.tsx) she picks up to two lines from the phrases below in
 * Russian and taps in the centimetres; the booking keeps only the phrase's
 * key and the numbers, and the English is written here, when the email is.
 * So a wording can be improved later, and the two languages cannot drift.
 * Every phrase is a claim in the customer's inbox, so each says only what
 * she did, in the words British alteration shops use (checked 11.10.2026:
 * "taken up", "let out", "taken in", "turn-ups", "drop").
 *
 * With no line picked, a line for the service stands in, true of any job in
 * it. "Not sure — free 10-minute look" may have been a look and nothing
 * more, so it gets no label at all unless she picks a line.
 *
 * Pure: the Studio's dialog, the email and the tests all read it.
 */

export type Verb = "Altered" | "Mended" | "Made";

/** A service's own line may also be "Finished": true of a curtain taken up and a cushion made */
export type FallbackVerb = Verb | "Finished";

export type GroupKey = "length" | "trousers" | "fit" | "occasion" | "uniform" | "repairs" | "home" | "made";

/** A number she taps in: what it measures, in the dialog's words, and how large it can be */
export interface Slot {
  ru: string;
  max: number;
}

export interface Phrase {
  key: string;
  group: GroupKey;
  verb: Verb;
  /** The chip in the dialog, in Russian */
  chip: string;
  /**
   * The line, in Russian for her and in English for the customer. "{a}" and
   * "{b}" become "4 см" / "4 cm"; "{a#}" the number alone. A tail is said
   * only when its number is given.
   */
  ru: string;
  ruTail?: string;
  en: string;
  enTail?: string;
  a?: Slot;
  b?: Slot;
  /** The line itself says the work was by hand, so the label's top line need not */
  byHand?: boolean;
}

export const GROUPS: readonly { key: GroupKey; ru: string }[] = [
  { key: "length", ru: "Длина" },
  { key: "trousers", ru: "Джинсы и брюки" },
  { key: "fit", ru: "По фигуре" },
  { key: "occasion", ru: "Свадьба и вечер" },
  { key: "uniform", ru: "Школьная форма" },
  { key: "repairs", ru: "Ремонт" },
  { key: "home", ru: "Шторы и дом" },
  { key: "made", ru: "Сшито с нуля" },
];

const BY = (ru: string, max: number): Slot => ({ ru, max });

export const PHRASES: readonly Phrase[] = [
  // ─── Length ───
  {
    key: "hem",
    group: "length",
    verb: "Altered",
    chip: "Низ укорочен",
    ru: "Низ укорочен на {a}",
    ruTail: ", при желании можно будет удлинить на {b}",
    en: "Hem taken up {a}",
    enTail: ", {b} left in should you want it longer",
    a: BY("на сколько укоротили", 40),
    b: BY("на сколько потом можно удлинить — если оставили запас", 15),
  },
  {
    key: "hem-lining",
    group: "length",
    verb: "Altered",
    chip: "Укорочено вместе с подкладкой",
    ru: "Низ и подкладка укорочены на {a}",
    en: "Hem taken up {a}, lining taken up to match",
    a: BY("на сколько укоротили", 40),
  },
  {
    key: "hem-hand",
    group: "length",
    verb: "Altered",
    chip: "Укорочено, низ подшит вручную",
    ru: "Укорочено на {a}, низ подшит вручную",
    en: "Taken up {a} with a hand-sewn hem",
    a: BY("на сколько укоротили", 40),
    byHand: true,
  },
  {
    key: "let-down",
    group: "length",
    verb: "Altered",
    chip: "Удлинено (низ выпущен)",
    ru: "Низ выпущен на {a}",
    ruTail: ", можно удлинить ещё на {b}",
    en: "Hem let down {a}",
    enTail: ", {b} still left in",
    a: BY("на сколько выпустили", 15),
    b: BY("на сколько можно удлинить ещё — если можно", 15),
  },
  {
    key: "sleeves",
    group: "length",
    verb: "Altered",
    chip: "Рукава укорочены",
    ru: "Рукава укорочены на {a}",
    en: "Sleeves shortened {a}",
    a: BY("на сколько укоротили", 20),
  },
  {
    key: "straps",
    group: "length",
    verb: "Altered",
    chip: "Бретели укорочены",
    ru: "Бретели укорочены на {a} каждая",
    en: "Straps shortened {a} each",
    a: BY("на сколько укоротили каждую", 15),
  },
  // ─── Jeans and trousers ───
  {
    key: "jeans-original",
    group: "trousers",
    verb: "Altered",
    chip: "Укорочено с фабричным низом",
    ru: "Укорочено на {a} с сохранением фабричного низа",
    en: "Taken up {a}, original hem sewn back on",
    a: BY("на сколько укоротили", 40),
  },
  {
    key: "turn-ups",
    group: "trousers",
    verb: "Altered",
    chip: "Укорочено, с отворотами",
    ru: "Укорочено на {a}, отвороты {b}",
    en: "Taken up {a}, with {b} turn-ups",
    a: BY("на сколько укоротили", 40),
    b: BY("ширина отворота", 8),
  },
  {
    key: "waist-in",
    group: "trousers",
    verb: "Altered",
    chip: "Пояс ушит",
    ru: "Пояс ушит на {a} по среднему шву сзади",
    en: "Waist taken in {a} at the centre back",
    a: BY("на сколько ушили (всего)", 15),
  },
  {
    key: "waist-out",
    group: "trousers",
    verb: "Altered",
    chip: "Пояс расставлен",
    ru: "Пояс расставлен на {a} по среднему шву сзади",
    en: "Waist let out {a} at the centre back",
    a: BY("на сколько расставили (всего)", 10),
  },
  {
    key: "taper",
    group: "trousers",
    verb: "Altered",
    chip: "Брючины заужены от колена",
    ru: "Брючины заужены от колена",
    en: "Legs tapered from the knee down",
  },
  // ─── Fit ───
  {
    key: "in-sides",
    group: "fit",
    verb: "Altered",
    chip: "Ушито по бокам",
    ru: "Ушито по бокам на {a} (всего)",
    en: "Taken in {a} in all at the sides",
    a: BY("на сколько ушили — всего, не с каждой стороны", 20),
  },
  {
    key: "in-back",
    group: "fit",
    verb: "Altered",
    chip: "Ушито по спинке",
    ru: "Ушито по среднему шву спинки на {a} (всего)",
    en: "Taken in {a} at the centre back",
    a: BY("на сколько ушили — всего, не с каждой стороны шва", 15),
  },
  {
    key: "out-sides",
    group: "fit",
    verb: "Altered",
    chip: "Выпущено по бокам",
    ru: "Выпущено по бокам на {a} (всего)",
    en: "Let out {a} in all at the sides",
    a: BY("на сколько выпустили — всего, не с каждой стороны", 10),
  },
  {
    key: "in-lined",
    group: "fit",
    verb: "Altered",
    chip: "Ушито вместе с подкладкой",
    ru: "Ушито на {a} (всего), подкладка тоже",
    en: "Taken in {a} in all, lining altered to match",
    a: BY("на сколько ушили — всего", 20),
  },
  {
    key: "darts",
    group: "fit",
    verb: "Altered",
    chip: "Вытачки на спинке",
    ru: "Добавлены вытачки на спинке",
    en: "Back darts added for a closer fit",
  },
  // ─── Wedding and evening ───
  {
    key: "train-front",
    group: "occasion",
    verb: "Altered",
    chip: "Подол спереди, плавно к шлейфу",
    ru: "Подол укорочен на {a} спереди, плавно сходит в шлейф",
    en: "Hem taken up {a} at the front, tapered into the train",
    a: BY("на сколько укоротили спереди", 30),
  },
  {
    key: "train-all",
    group: "occasion",
    verb: "Altered",
    chip: "Подол по кругу, со шлейфом",
    ru: "Подол укорочен на {a} по кругу, вместе со шлейфом",
    en: "Hem taken up {a} all round, train included",
    a: BY("на сколько укоротили", 30),
  },
  {
    key: "layers",
    group: "occasion",
    verb: "Altered",
    chip: "Укорочено во всех слоях",
    ru: "Укорочено на {a} во всех слоях",
    en: "Taken up {a} through every layer",
    a: BY("на сколько укоротили", 30),
  },
  {
    key: "heels",
    group: "occasion",
    verb: "Altered",
    chip: "Укорочено под её каблук",
    ru: "Укорочено на {a} под её каблук — подкалывали в её туфлях",
    en: "Hem taken up {a}, set to the height of your heels",
    a: BY("на сколько укоротили", 30),
  },
  {
    key: "bodice",
    group: "occasion",
    verb: "Altered",
    chip: "Лиф ушит",
    ru: "Лиф ушит на {a} (всего) по боковым швам",
    en: "Bodice taken in {a} in all at the side seams",
    a: BY("на сколько ушили — всего", 15),
  },
  {
    key: "bustle",
    group: "occasion",
    verb: "Altered",
    chip: "Турнюр для шлейфа",
    ru: "Сделан турнюр — шлейф подбирается",
    en: "Bustle added to lift the train",
  },
  // ─── School uniform ───
  {
    key: "growing",
    group: "uniform",
    verb: "Altered",
    chip: "Укорочено, запас на вырост",
    ru: "Укорочено на {a}, в подгибе {b} на вырост",
    en: "Taken up {a}, {b} kept in the hem for growing room",
    a: BY("на сколько укоротили", 30),
    b: BY("сколько оставили на вырост", 15),
  },
  {
    key: "blazer",
    group: "uniform",
    verb: "Altered",
    chip: "Рукава пиджака, запас на вырост",
    ru: "Рукава пиджака укорочены на {a}",
    ruTail: ", {b} подвёрнуто на вырост",
    en: "Blazer sleeves shortened {a}",
    enTail: ", {b} kept in for growing",
    a: BY("на сколько укоротили", 15),
    b: BY("сколько подвернули на вырост (если подвернули)", 10),
  },
  {
    key: "name-tapes",
    group: "uniform",
    verb: "Altered",
    chip: "Именные ярлычки",
    ru: "Пришиты именные ярлычки — там, где не царапают",
    en: "Name tapes sewn in where they won't scratch",
  },
  // ─── Repairs ───
  {
    key: "zip",
    group: "repairs",
    verb: "Mended",
    chip: "Новая молния в цвет",
    ru: "Заменена молния — подобрана в цвет и по плотности",
    en: "Zip replaced, matched in colour and weight",
  },
  {
    key: "zip-concealed",
    group: "repairs",
    verb: "Mended",
    chip: "Новая потайная молния",
    ru: "Вшита новая потайная молния",
    en: "New concealed zip sewn in",
  },
  {
    key: "zip-slider",
    group: "repairs",
    verb: "Mended",
    chip: "Новый бегунок",
    ru: "Заменён бегунок, молния родная",
    en: "New zip slider, original zip kept",
  },
  {
    key: "seam",
    group: "repairs",
    verb: "Mended",
    chip: "Разошедшийся шов",
    ru: "Зашит разошедшийся шов",
    en: "Split seam sewn up",
  },
  {
    key: "tear",
    group: "repairs",
    verb: "Mended",
    chip: "Дырка зашита вручную",
    ru: "Дырка зашита вручную",
    en: "Tear sewn up by hand",
    byHand: true,
  },
  {
    key: "moth",
    group: "repairs",
    verb: "Mended",
    chip: "Дырочки от моли",
    ru: "Заштопаны дырочки от моли",
    en: "Moth holes darned by hand",
    byHand: true,
  },
  {
    key: "buttons",
    group: "repairs",
    verb: "Mended",
    chip: "Пуговицы пришиты",
    ru: "Пуговицы пришиты на место",
    en: "Buttons sewn back on",
  },
  {
    key: "buttons-new",
    group: "repairs",
    verb: "Mended",
    chip: "Новые пуговицы",
    ru: "Пришиты новые пуговицы",
    en: "New buttons sewn on",
  },
  {
    key: "lining",
    group: "repairs",
    verb: "Mended",
    chip: "Подкладка починена",
    ru: "Подкладка починена",
    en: "Lining repaired",
  },
  {
    key: "pockets",
    group: "repairs",
    verb: "Mended",
    chip: "Новые мешковины карманов",
    ru: "Заменены мешковины карманов",
    en: "Pocket linings replaced",
  },
  {
    key: "elastic",
    group: "repairs",
    verb: "Mended",
    chip: "Новая резинка в поясе",
    ru: "Заменена резинка в поясе",
    en: "Elastic replaced at the waist",
  },
  // ─── Curtains and home ───
  {
    key: "curtains-weights",
    group: "home",
    verb: "Altered",
    chip: "Шторы укорочены, грузики на месте",
    ru: "Шторы укорочены на {a}, грузики вшиты обратно в углы",
    en: "Curtains taken up {a}, weights back in the corners",
    a: BY("на сколько укоротили", 100),
  },
  {
    key: "curtains-length",
    group: "home",
    verb: "Altered",
    chip: "Шторы укорочены, новая длина",
    ru: "Шторы укорочены на {a}, длина теперь {b}",
    en: "Curtains taken up {a}, now {b} long",
    a: BY("на сколько укоротили", 100),
    b: BY("какая длина теперь", 400),
  },
  {
    key: "eyelets-to-pencil",
    group: "home",
    verb: "Altered",
    chip: "Люверсы → лента «карандаш»",
    ru: "Люверсы заменены на ленту «карандаш»",
    en: "Changed from eyelets to pencil pleat",
  },
  {
    key: "pencil-to-eyelets",
    group: "home",
    verb: "Altered",
    chip: "Лента «карандаш» → люверсы",
    ru: "Лента «карандаш» заменена на люверсы",
    en: "Changed from pencil pleat to eyelets",
  },
  {
    key: "heading-tape",
    group: "home",
    verb: "Altered",
    chip: "Новая шторная лента",
    ru: "Пришита новая шторная лента",
    en: "New heading tape sewn on",
  },
  {
    key: "offcut-cushions",
    group: "home",
    verb: "Altered",
    chip: "Укорочено, из обрезков — чехлы",
    ru: "Укорочено на {a}, из обрезков сшиты чехлы на подушки",
    en: "Cut down {a}, the offcut sewn into cushion covers",
    a: BY("на сколько укоротили", 100),
  },
  {
    key: "cushion",
    group: "home",
    verb: "Made",
    chip: "Чехол на подушку",
    ru: "Чехол на подушку {a#} × {b}",
    en: "Cushion cover for your {a#} × {b} pad",
    a: BY("ширина подушки", 120),
    b: BY("высота подушки", 120),
  },
  {
    key: "blind",
    group: "home",
    verb: "Made",
    chip: "Римская штора",
    ru: "Римская штора, ширина {a}, высота {b}",
    en: "Roman blind, {a} wide by {b} drop",
    a: BY("ширина", 300),
    b: BY("высота (drop)", 400),
  },
  {
    key: "runner",
    group: "home",
    verb: "Made",
    chip: "Дорожка на стол",
    ru: "Дорожка на стол длиной {a}",
    en: "Table runner, {a} long",
    a: BY("длина", 400),
  },
  // ─── Made from scratch ───
  {
    key: "scratch",
    group: "made",
    verb: "Made",
    chip: "Сшито с нуля по меркам",
    ru: "Сшито с нуля по меркам",
    en: "Cut and sewn from scratch to your measurements",
  },
  {
    key: "own-fabric",
    group: "made",
    verb: "Made",
    chip: "Из ткани клиента",
    ru: "Из ткани клиента",
    en: "From your own fabric",
  },
  {
    key: "copied",
    group: "made",
    verb: "Made",
    chip: "Скопировано с любимой вещи",
    ru: "Скопировано с вещи, которую клиент уже носит",
    en: "Copied from a piece you already wear",
  },
  {
    key: "lined",
    group: "made",
    verb: "Made",
    chip: "На подкладке",
    ru: "Полностью на подкладке",
    en: "Fully lined",
  },
];

const BY_KEY = new Map(PHRASES.map((phrase) => [phrase.key, phrase]));

export function phraseOf(key: unknown): Phrase | undefined {
  return typeof key === "string" ? BY_KEY.get(key) : undefined;
}

/** At most this many lines: a label says one or two things */
export const MAX_LINES = 2;

/** What the booking keeps: a phrase's key and its numbers, never words */
export interface CareLine {
  phrase: string;
  a?: number;
  b?: number;
}

/**
 * What the label says when she picks no line: true of any job the service
 * covers, and in the service's own verb. Every name a booking can arrive
 * with is here — the form's, each landing page's and the old "Other / Not
 * Sure" (careLabel.test.ts holds the lists together). null: no label at all.
 */
export const FALLBACK: Readonly<Record<string, { verb: FallbackVerb; line: string } | null>> = {
  Alterations: { verb: "Altered", line: "Made to fit" },
  // The wedding page takes bridesmaids and the bride's mother too
  "Bridal fitting": { verb: "Altered", line: "Ready for the wedding" },
  "Wedding Dress Alterations": { verb: "Altered", line: "Ready for the wedding" },
  "Prom and Evening Dress Alterations": { verb: "Altered", line: "Evening dress · ready for the night" },
  "School Uniform Alterations": { verb: "Altered", line: "School uniform · ready for term" },
  "Jeans and Trouser Alterations": { verb: "Altered", line: "Made to fit" },
  Repairs: { verb: "Mended", line: "Ready to use again" },
  "Zip Replacement and Clothing Repairs": { verb: "Mended", line: "Ready to use again" },
  "Custom Sewing": { verb: "Made", line: "Cut and sewn from scratch" },
  // Curtains taken up and cushions made alike: "Finished" is true of both
  "Home Textiles": { verb: "Finished", line: "Ready for your home" },
  "Curtain Alterations and Home Textiles": { verb: "Finished", line: "Ready for your home" },
  // A look may be all it was
  "Not sure — free 10-minute look": null,
  "Other / Not Sure": null,
};

/** The groups a service's own jobs are in, shown first in the dialog */
const OWN_GROUPS: Readonly<Record<string, GroupKey[]>> = {
  Alterations: ["length", "fit", "trousers"],
  "Bridal fitting": ["occasion", "length", "fit"],
  "Wedding Dress Alterations": ["occasion", "length", "fit"],
  "Prom and Evening Dress Alterations": ["occasion", "length", "fit"],
  "School Uniform Alterations": ["uniform", "length", "trousers"],
  "Jeans and Trouser Alterations": ["trousers", "length", "fit"],
  Repairs: ["repairs"],
  "Zip Replacement and Clothing Repairs": ["repairs"],
  "Custom Sewing": ["made"],
  "Home Textiles": ["home"],
  "Curtain Alterations and Home Textiles": ["home"],
};

/** The groups of a service's own jobs — none for a look, or a name not known */
export function ownGroups(service: string | null | undefined): GroupKey[] {
  return (typeof service === "string" && OWN_GROUPS[service]) || [];
}

/** Every group, the service's own first, then the rest in their usual order */
export function groupsFor(service: string | null | undefined): GroupKey[] {
  const own = ownGroups(service);
  return [...own, ...GROUPS.map((group) => group.key).filter((key) => !own.includes(key))];
}

/** Whether a number is one she can tap in: 0.5 up to the slot's largest, in halves */
function fits(value: unknown, slot: Slot): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.5 && value <= slot.max && Number.isInteger(value * 2);
}

/** "1,5" or "1.5" or " 4 " as she types it, as a number of centimetres — or null */
export function parseCm(typed: string): number | null {
  const cleaned = typed.trim().replace(",", ".").replace(/\s*(см|cm)$/i, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** What is wrong with a line, in the Studio's words — or null when it can go on the label */
export function careLineProblem(line: CareLine | null | undefined): string | null {
  const phrase = phraseOf(line?.phrase);
  if (!line || !phrase) return "Такой строки для бирки нет — выберите строку из списка.";
  for (const name of ["a", "b"] as const) {
    const slot = phrase[name];
    const value = line[name];
    if (!slot) {
      if (value !== undefined) return "У этой строки нет такого числа — выберите строку заново.";
      continue;
    }
    const optional = name === "b" && Boolean(phrase.enTail);
    if (value === undefined || value === null) {
      if (optional) continue;
      return `Укажите: ${slot.ru}.`;
    }
    if (!fits(value, slot)) return `«${capitalised(slot.ru)}» — от 0,5 до ${slot.max} см, шагом 0,5.`;
  }
  return null;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 4 → "4", 1.5 → "1.5" for the customer, "1,5" for Kristina — never "4.0", never a locale's guess */
function figure(value: number, lang: "en" | "ru"): string {
  const written = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return lang === "ru" ? written.replace(".", ",") : written;
}

/** A phrase with its numbers in, as plain text: "Hem taken up 4 cm, 2 cm left in…" */
export function lineText(line: CareLine, lang: "en" | "ru"): string | null {
  if (careLineProblem(line)) return null;
  const phrase = phraseOf(line.phrase) as Phrase;
  const unit = lang === "ru" ? "см" : "cm";
  const fill = (template: string) =>
    template.replace(/\{([ab])(#?)\}/g, (_, name: "a" | "b", bare: string) => {
      const value = line[name] as number;
      return bare ? figure(value, lang) : `${figure(value, lang)} ${unit}`;
    });
  const main = lang === "ru" ? phrase.ru : phrase.en;
  const tail = lang === "ru" ? phrase.ruTail : phrase.enTail;
  return fill(main) + (tail && line.b !== undefined && line.b !== null ? fill(tail) : "");
}

/** Words that are a title, not a name: "Altered by hand for Mrs" says nothing */
const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "sir", "lady", "madam", "madame"]);

/**
 * The name on the label: the first word of the name she gave, as she wrote
 * it — but "anna" or "ANNA" written as a name is written ("anne-marie" as
 * "Anne-Marie", "o'brien" as "O'Brien"), initials such as "AJ" are kept, and
 * a title or a very long word is left off rather than printed.
 */
export function nameOnLabel(displayName: string | null | undefined): string | null {
  const first = (displayName ?? "").trim().split(/\s+/)[0]?.replace(/[.,;:!]+$/, "") ?? "";
  if (!first || first.length > 20 || TITLES.has(first.toLowerCase()) || !/\p{L}/u.test(first)) return null;
  const lower = first.toLowerCase();
  if (first !== lower && first !== first.toUpperCase()) return first;
  // Initials are written in capitals: "AJ" stays as she typed it
  if (first === first.toUpperCase() && first.replace(/[^\p{L}]/gu, "").length <= 2) return first;
  // Each part of a double name gets its capital, and so does O' or D'
  return lower.replace(/(?<=^|-|^\p{L}['’])\p{L}/gu, (letter) => letter.toUpperCase());
}

/** The name an email greets with: as the label writes it, or as given, or "there" */
export function greetingName(displayName: string | null | undefined): string {
  return nameOnLabel(displayName) ?? displayName ?? "there";
}

/** "October 2026", by Southampton's calendar */
export function labelMonth(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: ATELIER_TIME_ZONE }).format(now);
}

export interface CareLabel {
  /** "Altered by hand for Anna" */
  maker: string;
  /** One or two lines, plain text */
  lines: string[];
  /** "October 2026" */
  month: string;
}

/** The verb of the work: one kind of job is named alone, two kinds both — never "Made" for what she altered */
function verbOf(verbs: Verb[]): string {
  const kinds = new Set(verbs);
  if (kinds.size === 1) return verbs[0];
  if (kinds.has("Made")) return kinds.has("Mended") ? "Made & mended" : "Made & altered";
  return "Altered & mended";
}

/**
 * The label for a finished booking, or null for none: the lines she picked
 * that are whole, or the service's own line — and nothing for a look.
 */
export function careLabelOf(
  booking: { displayName?: string | null; service?: string | null; careLabel?: readonly CareLine[] | null },
  now: Date
): CareLabel | null {
  const picked = (booking.careLabel ?? []).filter((line) => !careLineProblem(line)).slice(0, MAX_LINES);
  const service = typeof booking.service === "string" ? booking.service : "";
  const fallback = service in FALLBACK ? FALLBACK[service] : FALLBACK.Alterations;
  if (picked.length === 0 && !fallback) return null;

  const phrases = picked.map((line) => phraseOf(line.phrase) as Phrase);
  const lines = picked.length > 0 ? picked.map((line) => lineText(line, "en") as string) : [fallback!.line];
  const verb = picked.length > 0 ? verbOf(phrases.map((phrase) => phrase.verb)) : fallback!.verb;
  const byHand = phrases.some((phrase) => phrase.byHand);
  const name = nameOnLabel(booking.displayName);
  return {
    maker: `${verb}${byHand ? "" : " by hand"}${name ? ` for ${name}` : ""}`,
    lines,
    month: labelMonth(now),
  };
}

/** The label's colours: the band a shade off the card's white, the stitch the brand's gold */
export const LABEL_COLOURS = { band: "#F6F0E4", stitch: "#B08848", small: "#6B5A3E", ink: "#2d2d2d", line: "#3d3d3d" } as const;

/**
 * A number and its unit never part at the end of a line, and a line that
 * wraps never leaves one word alone under it ("…at the centre / back").
 * `space` is the no-break space as the place it goes writes one: "&nbsp;"
 * in the email, the character itself in the Studio's preview.
 */
export function holdTogether(text: string, space: string): string {
  const held = text.replace(/(\d) cm\b/g, `$1${space}cm`).replace(/ × /g, `${space}×${space}`);
  return held.split(" ").length > 3 ? held.replace(/ (\S+)$/, `${space}$1`) : held;
}

/**
 * The label as email HTML. Two nested tables — the outer cell is the cloth,
 * the inner one carries the dashed stitch — because Outlook on Windows draws
 * a border reliably only on a table cell; square, because a cut woven label
 * is, and because that Outlook would square it anyway. Capitals are typed, not
 * styled, and every paragraph names its face: Outlook's cells forget what
 * they inherit. No colours for dark mode: like the rest of the email, it is
 * left to each app, and a gold line reads on a darkened band.
 */
export function careLabelHtml(label: CareLabel): string {
  const { band, stitch, small, ink, line } = LABEL_COLOURS;
  const face = "font-family:Georgia,'Times New Roman',serif;mso-line-height-rule:exactly;";
  const lines = label.lines
    .map(
      (text, k) =>
        `<p style="${face}margin:0 0 ${k === label.lines.length - 1 ? 12 : 6}px;font-size:14px;line-height:20px;color:${line};">${holdTogether(escapeHtml(text), "&nbsp;")}</p>`
    )
    .join("\n          ");
  return `
<!--[if mso]><table role="presentation" align="center" width="280" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:280px;margin:0 auto 28px;border-collapse:separate;">
  <tr>
    <td bgcolor="${band}" style="background-color:${band};padding:5px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
        <tr>
          <td bgcolor="${band}" align="center" style="background-color:${band};border:1px dashed ${stitch};padding:16px 18px 14px;text-align:center;">
          <p style="${face}margin:0 0 10px;font-size:10px;line-height:14px;letter-spacing:2px;color:${small};">BEAUTASY &middot; SOUTHAMPTON</p>
          <p style="${face}margin:0 0 8px;font-size:18px;line-height:24px;font-style:italic;color:${ink};">${escapeHtml(label.maker)}</p>
          ${lines}
          <p style="${face}margin:0;font-size:10px;line-height:14px;letter-spacing:2px;color:${small};">${escapeHtml(label.month.toUpperCase())}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->`;
}
