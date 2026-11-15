/**
 * The site's own address: TETHER_SITE_URL, else the production domain Vercel provides. Either may be a bare
 * host (`tether.ug`), so https:// is added when no scheme is given.
 */
const raw =
  process.env.TETHER_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "localhost:3010";
const host = raw.trim().replace(/\/+$/, "");

export const SITE_URL = /^https?:\/\//.test(host)
  ? host
  : `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
