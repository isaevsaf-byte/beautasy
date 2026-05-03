import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/studio/", "/api/", "/sign-in/", "/sign-up/"],
      },
    ],
    sitemap: "https://beautasy.co.uk/sitemap.xml",
  };
}
