/**
 * Single source of truth for the public-facing site URL.
 *
 * Currently Vercel's project-canonical URL (the *-fadhulusama-* alias is
 * the stable one Vercel auto-promotes with each production deploy; the
 * earlier `medsync-bice` vanity alias was retired during a project
 * reconnect). Swap to the custom domain once `medsync.health` is
 * registered + pointed at Vercel.
 */
export const SITE_URL = "https://medsync-fadhulusama-gmailcoms-projects.vercel.app" as const;
export const SITE_NAME = "MedSync" as const;
export const SITE_TITLE = "MedSync — A digital hospital that doesn't stop at the gate" as const;
export const SITE_DESCRIPTION =
  "MedSync is the digital hospital operating system for Uganda — built for hospitals up to national-referral scale, keeping care going after patients leave the gate." as const;
