/**
 * The local landing pages under /alterations.
 *
 * One page per thing people actually type into Google — "wedding dress
 * alterations southampton", "school uniform hemming", "replace a zip near me".
 * The atelier page answers "what does Beautasy do"; these answer one question
 * each, which is what a search result has to do to earn the click.
 *
 * Content lives here rather than in Sanity on purpose: prices already live in
 * code on /atelier, the pages carry structured data that has to stay in step
 * with the copy, and they change once a year at most.
 */

export interface PriceLine {
  name: string;
  price: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface LocalService {
  /** URL segment under /alterations */
  slug: string;
  /** The one keyword this page is for, as a person would say it */
  h1: string;
  metaTitle: string;
  metaDescription: string;
  /** Small label above the heading */
  eyebrow: string;
  /** Opening copy — first paragraph is also the schema.org description */
  intro: string[];
  /** schema.org Service name, and the label the booking form arrives with */
  serviceName: string;
  prices: PriceLine[];
  priceNote?: string;
  turnaround: string;
  steps: { title: string; text: string }[];
  faqs: Faq[];
  /** Sibling pages to link to — internal links are how these pages lift each other */
  related: string[];
  /** Shown as a banner when the service has a season running */
  seasonal?: string;
}

export const LOCAL_SERVICES: LocalService[] = [
  {
    slug: "wedding-dress-southampton",
    h1: "Wedding Dress Alterations in Southampton",
    metaTitle: "Wedding Dress Alterations Southampton | Bridal Fitting — Beautasy",
    metaDescription:
      "Wedding dress alterations in Southampton by an experienced seamstress. Taking in, hemming, bustles, straps and cups — three fittings, from £150. Book a bridal fitting.",
    eyebrow: "Bridal",
    serviceName: "Wedding Dress Alterations",
    intro: [
      "Almost no wedding dress fits straight off the rail — bridal shops sell to the largest measurement and expect the dress to be taken in afterwards. That work is where a dress stops looking bought and starts looking like yours.",
      "Beautasy is a small Southampton atelier, so your dress is altered by the same pair of hands from the first fitting to the last. Three fittings is the usual rhythm: pin, adjust, and a final check close to the day. Bridesmaids and mother-of-the-bride dresses can be booked into the same appointment.",
    ],
    prices: [
      { name: "Take in bodice / sides", price: "from £60" },
      { name: "Hem with original lace or horsehair", price: "from £85" },
      { name: "Straps, cups and bust adjustment", price: "from £45" },
      { name: "Add a bustle (French or American)", price: "from £45" },
      { name: "Full alteration package, 3 fittings", price: "from £150" },
    ],
    priceNote:
      "Bridal prices depend on the fabric and the number of layers — beaded and lace gowns take longer. You get a firm quote at the first fitting, before any work starts.",
    turnaround: "Book 8–12 weeks before the wedding. Rush work possible — ask.",
    steps: [
      {
        title: "First fitting",
        text: "Bring the dress, your wedding shoes and the underwear you'll wear on the day. Everything is pinned on you and quoted before a stitch is sewn.",
      },
      {
        title: "The work",
        text: "Seams are opened and re-sewn to follow the original construction, so the dress keeps its shape and its finish.",
      },
      {
        title: "Final fitting",
        text: "A last check two to three weeks before the wedding, plus a bustle lesson for whoever is helping you on the day.",
      },
    ],
    faqs: [
      {
        q: "How far in advance should I book wedding dress alterations?",
        a: "Eight to twelve weeks before the wedding is comfortable. That leaves room for three fittings and for your body to settle at its final measurements. Later bookings are often possible — ask rather than assume.",
      },
      {
        q: "How much do wedding dress alterations cost in Southampton?",
        a: "A full package with three fittings starts at £150. Single jobs start lower: sides from £60, a hem from £85. Beading, lace and multiple layers add time, so the exact figure comes at the first fitting.",
      },
      {
        q: "What should I bring to the first fitting?",
        a: "The dress, the shoes you'll wear on the day, and the exact underwear you'll have on. Heel height changes the hem, and the right bra changes the bodice — guessing either means altering twice.",
      },
      {
        q: "Can you alter a dress bought online or second-hand?",
        a: "Yes. Preloved and online gowns are altered often, and they're usually the ones that need the most work. Bring it as early as you can so there's room to solve surprises.",
      },
    ],
    related: ["prom-and-evening-dress-southampton", "zip-replacement-southampton"],
  },
  {
    slug: "school-uniform-southampton",
    h1: "School Uniform Alterations & Hemming in Southampton",
    metaTitle: "School Uniform Alterations Southampton | Hemming from £8 — Beautasy",
    metaDescription:
      "School trousers, skirts and blazers hemmed and taken in, in Southampton. From £8 per item, bundle price for five. Turned around in 3–5 days.",
    eyebrow: "Back to school",
    serviceName: "School Uniform Alterations",
    seasonal:
      "September rush is on — uniform brought in this month is back within 3–5 days.",
    intro: [
      "Uniform is sold in sizes, and children come in shapes. Buying the next size up and turning the hem under works until the first PE lesson, and a blazer that swamps the shoulders never stops looking borrowed.",
      "Hems shortened properly, waists taken in, sleeves adjusted, name tapes sewn where they won't scratch. Bring a bag of it at once — five items priced as a bundle costs less than five separate jobs.",
    ],
    prices: [
      { name: "Shorten trousers or skirt", price: "£8" },
      { name: "Take in waist", price: "£12" },
      { name: "Shorten blazer sleeves", price: "from £18" },
      { name: "Replace a broken zip", price: "from £14" },
      { name: "Bundle of five items", price: "£35" },
    ],
    priceNote:
      "Hems let down as a child grows are charged at the same price — the fabric is already there, so the growing room costs nothing extra.",
    turnaround: "3–5 days. Same week during term time.",
    steps: [
      {
        title: "Drop it off",
        text: "Bring the uniform with the child if you can, or with a pair of trousers that already fits well as a guide.",
      },
      {
        title: "Pinned and priced",
        text: "Each item is measured and quoted on the spot. No surprises when you collect.",
      },
      {
        title: "Collect",
        text: "Ready within the week, pressed and folded, with the leftover length kept inside the hem for next year.",
      },
    ],
    faqs: [
      {
        q: "How much does it cost to hem school trousers?",
        a: "£8 per pair. Five items brought in together are £35, which works out cheaper than pricing each one separately.",
      },
      {
        q: "How quickly can uniform be done?",
        a: "Three to five days as standard, and same-week during term time. In the last two weeks of August the queue is longest, so earlier is better.",
      },
      {
        q: "Can you leave room for growth?",
        a: "Yes, and it's the default. Hems are turned so the extra length stays inside the garment and can be let down next year at the same price.",
      },
      {
        q: "Do you sew on name tapes?",
        a: "Yes — sewn into a seam where they won't rub against skin, which iron-on labels tend to do once they start lifting.",
      },
    ],
    related: ["jeans-and-trousers-southampton", "zip-replacement-southampton"],
  },
  {
    slug: "prom-and-evening-dress-southampton",
    h1: "Prom & Evening Dress Alterations in Southampton",
    metaTitle: "Prom & Evening Dress Alterations Southampton | Beautasy",
    metaDescription:
      "Prom, ball and evening dress alterations in Southampton. Taken in, hemmed, straps and cups adjusted — from £28. Student rate available. Book a fitting.",
    eyebrow: "Prom & balls",
    serviceName: "Prom and Evening Dress Alterations",
    intro: [
      "An evening dress has one job: to sit right for a few hours of photographs. Bought online, it usually arrives too long, too loose at the back, or gaping at the bust — three problems that are quick to fix and impossible to ignore in pictures.",
      "Southampton runs on balls, graduations and prom season, so this work is booked in waves. A student rate applies to university and college events — bring your student card.",
    ],
    prices: [
      { name: "Shorten an evening dress", price: "from £30" },
      { name: "Take in sides or back", price: "from £28" },
      { name: "Strap adjustment", price: "£20" },
      { name: "Add cups or bust support", price: "from £25" },
      { name: "Take in a lined gown", price: "from £40" },
    ],
    priceNote: "Students get 10% off with a valid student card.",
    turnaround: "5–7 days. Say the date of the event when you book.",
    steps: [
      {
        title: "Bring the shoes",
        text: "The hem is set from the heel you'll actually wear. Without the shoes, the length is a guess.",
      },
      {
        title: "Pinned on you",
        text: "Fit is decided in the mirror together — how it should sit is a decision, not a measurement.",
      },
      {
        title: "Ready before the night",
        text: "Collected with time to spare, never the day before.",
      },
    ],
    faqs: [
      {
        q: "How long do prom dress alterations take?",
        a: "Five to seven days normally. Tell us the date of the event when you book and the work is planned around it.",
      },
      {
        q: "Can you alter a dress that arrived from an online shop?",
        a: "Yes — most of this work is exactly that. Online gowns are cut generously and almost always need the back or sides taken in.",
      },
      {
        q: "Is there a student discount?",
        a: "Yes, 10% off with a student card from either Southampton university. Ball and graduation season books up quickly, so come early.",
      },
      {
        q: "My dress is too small — can it be let out?",
        a: "Sometimes. It depends on how much seam allowance the maker left inside. Bring it in and we'll look together before you buy another one.",
      },
    ],
    related: ["wedding-dress-southampton", "zip-replacement-southampton"],
  },
  {
    slug: "jeans-and-trousers-southampton",
    h1: "Jeans & Trouser Hemming in Southampton",
    metaTitle: "Jeans & Trouser Hemming Southampton | From £15.50 — Beautasy",
    metaDescription:
      "Jeans shortened with the original hem kept, trousers taken in at the waist, tapered legs. Southampton atelier, from £15.50, ready in 3–5 days.",
    eyebrow: "Everyday",
    serviceName: "Jeans and Trouser Alterations",
    intro: [
      "Jeans are made for one leg length and sold to everyone. Turning them up works with trainers and looks wrong with everything else, and cutting them off loses the faded original hem that makes denim look like denim.",
      "The original hem can be kept: the leg is shortened from above and the worn edge stitched back on, so nothing about the finish gives it away.",
    ],
    prices: [
      { name: "Shorten jeans, standard hem", price: "£15.50" },
      { name: "Shorten jeans, keep original hem", price: "£17.00" },
      { name: "Waist adjustment", price: "£22.00" },
      { name: "Taper legs", price: "from £25.00" },
      { name: "Replace a zip", price: "£18.00" },
    ],
    turnaround: "3–5 days.",
    steps: [
      {
        title: "Wear your shoes",
        text: "Come in the shoes you wear with those trousers. Length is decided standing up, not on a table.",
      },
      {
        title: "Marked and pinned",
        text: "Pinned on you and checked in the mirror before anything is cut.",
      },
      {
        title: "Collect",
        text: "Ready within the week, pressed.",
      },
    ],
    faqs: [
      {
        q: "How much does it cost to shorten jeans?",
        a: "£15.50 for a standard hem, £17.00 to keep the original faded hem so the shortening is invisible.",
      },
      {
        q: "Can you take in a waistband?",
        a: "Yes, £22. Taken in at the centre back so the belt loops stay evenly spaced, which is what stops it looking altered.",
      },
      {
        q: "Can wide-leg jeans be made slimmer?",
        a: "Yes — tapering from the knee down starts at £25. It's the alteration that changes how a pair looks the most for the least money.",
      },
      {
        q: "Do I need an appointment?",
        a: "For small jobs you can drop in during opening hours. Booking a slot means you're seen straight away rather than waiting.",
      },
    ],
    related: ["school-uniform-southampton", "zip-replacement-southampton"],
  },
  {
    slug: "zip-replacement-southampton",
    h1: "Zip Replacement & Repairs in Southampton",
    metaTitle: "Zip Replacement Southampton | Coats, Dresses, Boots — Beautasy",
    metaDescription:
      "Broken zip replaced on coats, dresses, jeans and bags in Southampton. From £14, most jobs back within a week. Bring the thing you've stopped wearing.",
    eyebrow: "Repairs",
    serviceName: "Zip Replacement and Clothing Repairs",
    intro: [
      "A broken zip is why most good coats stop being worn. The coat is fine, the lining is fine, and it hangs in the hall for two winters because replacing the zip feels like more trouble than it is.",
      "Coats, dresses, jeans, bags, cushion covers. Zips are matched to the original in weight and colour, and on a lined coat the lining is reopened and closed by hand so the repair doesn't show from inside either.",
    ],
    prices: [
      { name: "Zip in trousers or jeans", price: "£18" },
      { name: "Zip in a dress or skirt", price: "from £22" },
      { name: "Zip in a lined coat", price: "from £45" },
      { name: "Zip in a bag or cushion", price: "from £14" },
      { name: "Seam repair or tear mend", price: "from £12" },
    ],
    turnaround: "5–7 days. Coats a little longer.",
    steps: [
      {
        title: "Bring it in",
        text: "No appointment needed for a repair. It's quoted while you wait.",
      },
      {
        title: "Matched, not just replaced",
        text: "The new zip is matched to the original in weight, length and colour, so the garment doesn't look repaired.",
      },
      {
        title: "Back in the wardrobe",
        text: "Collect within the week and go back to wearing it.",
      },
    ],
    faqs: [
      {
        q: "How much does it cost to replace a zip?",
        a: "£18 in jeans or trousers, from £22 in a dress, from £45 in a lined coat. Coats cost more because the lining has to be opened and closed by hand.",
      },
      {
        q: "Is it worth repairing rather than replacing the garment?",
        a: "Almost always, if you liked the garment. A £45 coat zip against a new coat is not a close comparison, and the coat you already own already fits you.",
      },
      {
        q: "Can you repair bags and home items?",
        a: "Yes — bags, cushion covers, sleeping bags and pushchair covers all come through. From £14.",
      },
      {
        q: "Do you fix moth holes and tears?",
        a: "Small tears and seam splits from £12. Moth holes in knitwear depend on the yarn — bring it and we'll look.",
      },
    ],
    related: ["jeans-and-trousers-southampton", "curtains-and-home-southampton"],
  },
  {
    slug: "curtains-and-home-southampton",
    h1: "Curtain Alterations & Home Textiles in Southampton",
    metaTitle: "Curtain Alterations Southampton | Hemming & Cushions — Beautasy",
    metaDescription:
      "Curtains shortened and re-headed, cushion covers and roman blinds made to measure in Southampton. From £20 per panel. Measuring advice included.",
    eyebrow: "Home",
    serviceName: "Curtain Alterations and Home Textiles",
    intro: [
      "Ready-made curtains come in three drops, and windows don't. Curtains that stop short of the floor make a whole room look unfinished, and the fix is an hour of work per panel.",
      "Panels shortened with a proper weighted hem, headings changed between pencil pleat, eyelet and tape, cushion covers and runners made to measure from your own fabric or ours.",
    ],
    prices: [
      { name: "Curtain hemming, per panel", price: "from £20" },
      { name: "Change the heading", price: "from £30" },
      { name: "Narrow a panel", price: "from £25" },
      { name: "Cushion cover, made to measure", price: "from £25" },
      { name: "Table runner or napkins", price: "from £18" },
      { name: "Roman blind, made to measure", price: "from £55" },
    ],
    priceNote:
      "Lined and interlined curtains are priced individually — the weight is what determines the work.",
    turnaround: "7–10 days.",
    steps: [
      {
        title: "Measure",
        text: "Measure from the top of the track or pole to where you want the hem to land. Send the numbers by email and get a price before you carry anything across town.",
      },
      {
        title: "Hemmed with weight",
        text: "A proper deep hem with weights in the corners, so the panels hang straight instead of curling.",
      },
      {
        title: "Hang them",
        text: "Ready within a week and a half, pressed and folded on the fold lines.",
      },
    ],
    faqs: [
      {
        q: "How much does curtain hemming cost?",
        a: "From £20 per panel. Lined and interlined curtains are quoted individually because the weight changes the work.",
      },
      {
        q: "How do I measure my curtains?",
        a: "From the top of the pole or track down to where you want the hem — floor length, or 1cm above the floor so they clear the carpet. Email the measurements and get a price before bringing them in.",
      },
      {
        q: "Can you change eyelet curtains to pencil pleat?",
        a: "Yes, from £30 per panel. It's a common change when people move house and inherit the wrong track.",
      },
      {
        q: "Can you make cushions from my own fabric?",
        a: "Yes. Bring the fabric and the pad size, or the old cover to copy. From £25.",
      },
    ],
    related: ["zip-replacement-southampton", "jeans-and-trousers-southampton"],
  },
];

export function getLocalService(slug: string): LocalService | undefined {
  return LOCAL_SERVICES.find((s) => s.slug === slug);
}
