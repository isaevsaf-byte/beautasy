/**
 * The atelier's price guide: the tabs on /atelier, and the few lines the home
 * page shows under "Local services". One list, so the home page cannot quote
 * a price the guide has since changed. Plain data with no imports, so the
 * home page's script carries these few lines and nothing else of /atelier.
 */

export interface PriceItem {
  name: string;
  price: string;
}

export interface ServiceCategory {
  id: string;
  label: string;
  items: PriceItem[];
}

export const pricingCategories: ServiceCategory[] = [
  {
    id: "denim",
    label: "Denim & Trousers",
    items: [
      { name: "Shorten Jeans (Standard)", price: "from £15.50" },
      { name: "Shorten Jeans (Keep Original Hem)", price: "from £17.00" },
      { name: "Waist Adjustment", price: "from £22.00" },
      { name: "Replace Zip", price: "from £18.00" },
    ],
  },
  {
    id: "dresses",
    label: "Dresses & Skirts",
    items: [
      { name: "Day Dress Shorten", price: "from £15.00" },
      { name: "Evening / Prom Dress Shorten", price: "from £30.00" },
      { name: "Take in Sides (Resize)", price: "from £28.00" },
      { name: "Strap Adjustments", price: "from £20.00" },
    ],
  },
  {
    id: "coats",
    label: "Coats & Jackets",
    items: [
      { name: "Shorten Sleeves", price: "from £36.00" },
      { name: "New Zip (Coat)", price: "from £45.00" },
      { name: "Relining", price: "from £80.00" },
    ],
  },
  {
    id: "home",
    label: "Home Textiles",
    items: [
      { name: "Curtain Hemming (per panel)", price: "from £20.00" },
      { name: "Cushion Cover (custom)", price: "from £25.00" },
      { name: "Table Runner / Napkins", price: "from £18.00" },
    ],
  },
];

/**
 * The jobs people ask for most, one from each kind of garment, named as the
 * guide names them. Picked by name rather than copied, so the price shown on
 * the home page is always the guide's own.
 */
export const COMMON_JOBS = [
  "Shorten Jeans (Standard)",
  "Day Dress Shorten",
  "Replace Zip",
  "Take in Sides (Resize)",
  "Curtain Hemming (per panel)",
];

/** The common jobs' lines from the guide, in COMMON_JOBS' order; a name the guide dropped is left out */
export function commonPrices(
  names: readonly string[] = COMMON_JOBS,
  categories: readonly ServiceCategory[] = pricingCategories,
): PriceItem[] {
  const all = categories.flatMap((category) => category.items);
  return names.flatMap((name) => all.filter((item) => item.name === name));
}
