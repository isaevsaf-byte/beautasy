import { getSiteSettings, DEFAULT_FREE_THRESHOLD } from "@/lib/siteSettings";
import { getShelves } from "@/lib/getShelves";
import Header from "./Header";

export default async function HeaderWrapper() {
  const [settings, shelves] = await Promise.all([getSiteSettings(), getShelves()]);
  const threshold = settings.shipping?.freeShippingThreshold ?? DEFAULT_FREE_THRESHOLD;
  return (
    <Header
      freeShippingThreshold={threshold}
      announcementBar={settings.announcementBar ?? null}
      shelves={shelves}
    />
  );
}
