import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /r/ is a friend's personal landing page — one per person, not a page to find
        disallow: ["/studio/", "/api/", "/sign-in/", "/sign-up/", "/r/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
