import type { MetadataRoute } from "next";

import { SITE_URL } from "./site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: "weekly" }];
}
