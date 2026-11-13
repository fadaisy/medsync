import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: process.env.TETHER_SITE_URL ?? "http://localhost:3010", changeFrequency: "weekly" },
  ];
}
