import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-config";

const BASE = SITE_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/styleguide`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/sign-up`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    {
      url: `${BASE}/onboarding/patient`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE}/onboarding/clinical`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE}/onboarding/hospital`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
