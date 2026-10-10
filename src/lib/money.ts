/**
 * Pence as the shop writes prices: "£24.00", "£1,234.56".
 *
 * Prices were written with toFixed(2) in each component, which is fine until
 * a basket passes a thousand pounds and reads "£1234.56". One formatter, in
 * British style, so every total on the site looks like a price.
 */
const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPence(pence: number): string {
  return GBP.format(pence / 100);
}
