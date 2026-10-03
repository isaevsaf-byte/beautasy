import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Each is a prefix, so no trailing slash: "/sign-in/" left /sign-in
        // itself open, and Google indexed it under the home page's title.
        // /r/ is a friend's personal landing page — one per person, not a page to find
        disallow: ["/studio", "/api/", "/sign-in", "/sign-up", "/r/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
