/**
 * Single source of truth for the public-facing site URL.
 *
 * Currently the Vercel preview URL — swap to the custom domain in GATE F
 * once `medsync.health` is registered + pointed at Vercel. Until then,
 * canonical, sitemap, robots, and OG metadata all resolve here so previews
 * are self-consistent.
 */
export const SITE_URL = "https://medsync-bice.vercel.app" as const;
export const SITE_NAME = "MedSync" as const;
export const SITE_TITLE = "MedSync — A digital hospital that doesn't stop at the gate" as const;
export const SITE_DESCRIPTION =
  "MedSync is the digital hospital operating system for Uganda — built to run Mulago-scale referrals and to keep care going after patients leave the gate." as const;
