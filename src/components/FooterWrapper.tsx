import { getSiteSettings } from "@/lib/siteSettings";
import Footer from "@/components/Footer";

/**
 * Async server component — fetches site settings from Sanity and passes
 * them to the Footer client component. Use this in server page files.
 *
 * "use client" pages (e.g. page.tsx, ShopContent.tsx) import Footer directly
 * and render <Footer /> without props, which uses built-in defaults.
 */
export default async function FooterWrapper() {
  const settings = await getSiteSettings();
  return <Footer settings={settings} />;
}
