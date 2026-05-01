import { getSiteSettings, DEFAULT_FREE_THRESHOLD } from "@/lib/siteSettings";
import Header from "./Header";

export default async function HeaderWrapper() {
  const settings = await getSiteSettings();
  const threshold = settings.shipping?.freeShippingThreshold ?? DEFAULT_FREE_THRESHOLD;
  return <Header freeShippingThreshold={threshold} />;
}
