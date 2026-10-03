import { getSiteSettings, DEFAULT_FREE_THRESHOLD } from "@/lib/siteSettings";
import Header from "./Header";

/**
 * The header for a server-rendered page, with the announcement bar and the
 * free-delivery line already read. The menu no longer lists the shop's
 * sections, so it has no need of the shelves (see ./Header.tsx).
 */
export default async function HeaderWrapper() {
  const settings = await getSiteSettings();
  const threshold = settings.shipping?.freeShippingThreshold ?? DEFAULT_FREE_THRESHOLD;
  return (
    <Header
      freeShippingThreshold={threshold}
      announcementBar={settings.announcementBar ?? null}
    />
  );
}
