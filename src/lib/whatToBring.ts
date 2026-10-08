/**
 * What to bring to a fitting, by the service booked: the words the service
 * pages already give ("Bring the shoes", "Wear your shoes"), carried to where
 * they are needed — the night before, by the door.
 *
 * A fitting without the shoes or the right underwear is a second fitting:
 * the hem is set from the heel and the bodice from the bra. The pages say so,
 * but they are read before booking and forgotten by the day. So the
 * confirmation email's "Bring" says it for the job booked, and the calendar
 * event carries it in its title — the one line every calendar shows in its
 * reminder (a reminder's own text is shown by none of Apple, Google or
 * Outlook) — with its alarm at 7pm the evening before (@/lib/bookingCalendar).
 */
export interface Bring {
  /** For the email and the event's notes: a whole sentence */
  sentence: string;
  /** For the event's title, after "Beautasy fitting · ": short enough for a lock screen */
  title: string;
}

const WEDDING: Bring = {
  sentence: "The dress, your wedding shoes and the underwear you'll wear on the day.",
  title: "bring dress, wedding shoes & underwear",
};
const PROM: Bring = {
  sentence: "The dress, and the shoes you'll wear with it — the hem is set from the heel.",
  title: "bring the dress & your shoes",
};
const UNIFORM: Bring = {
  sentence: "The uniform, with your child if you can, or a pair of trousers that already fits well as a guide.",
  title: "bring the uniform & your child",
};
const TROUSERS: Bring = {
  sentence: "The trousers — and come in the shoes you wear with them. Length is decided standing up.",
  title: "bring the trousers & wear their shoes",
};
/** Curtains, blinds, cushions and runners all book as home textiles */
const HOME: Bring = {
  sentence:
    "The curtains with the hooks out, or your fabric — with the measurements: from the top of the pole or track to where the hem should land, or the cushion pad's size.",
  title: "bring curtains or fabric & measurements",
};
const REPAIR: Bring = {
  sentence: "The piece that needs mending.",
  title: "bring the piece",
};
const CUSTOM: Bring = {
  sentence: "Any fabric you have for it, and a picture of what you'd like.",
  title: "bring fabric & a picture",
};
const LOOK: Bring = {
  sentence: "The piece you'd like Kristina to look at.",
  title: "bring the piece",
};
const ALTERATION: Bring = {
  sentence: "The piece you'd like altered, and if we're changing the length, the shoes you'll wear with it.",
  title: "bring the piece & your shoes",
};

/**
 * By the names a booking arrives with: the form's list (@/lib/atelierServices),
 * each service page's serviceName (@/lib/localServices) and the old "Other /
 * Not Sure". A name not here gets the general one — a test holds the lists
 * together, so a new service cannot slip through unasked.
 */
export const BRING: Readonly<Record<string, Bring>> = {
  "Bridal fitting": WEDDING,
  "Wedding Dress Alterations": WEDDING,
  "Prom and Evening Dress Alterations": PROM,
  "School Uniform Alterations": UNIFORM,
  "Jeans and Trouser Alterations": TROUSERS,
  "Curtain Alterations and Home Textiles": HOME,
  "Home Textiles": HOME,
  "Zip Replacement and Clothing Repairs": REPAIR,
  Repairs: REPAIR,
  "Custom Sewing": CUSTOM,
  "Not sure — free 10-minute look": LOOK,
  "Other / Not Sure": LOOK,
  Alterations: ALTERATION,
};

export function whatToBring(service: string | null | undefined): Bring {
  return (typeof service === "string" && BRING[service]) || ALTERATION;
}
