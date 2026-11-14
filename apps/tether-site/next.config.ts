import path from "node:path";
import type { NextConfig } from "next";

/** The site builds from this folder but compiles the landing code shared with the hospital app, two levels up. */
const root = path.join(__dirname, "../..");

/**
 * The page's links to sign-in, sign-up and the emergency pathway are the hospital app's, so this site sends them
 * there. HOSPITAL_APP_URL may be a bare host; unset (local dev), they stay as they are.
 */
const app = (process.env.HOSPITAL_APP_URL ?? "").trim().replace(/\/+$/, "");
const appUrl = !app || /^https?:\/\//.test(app) ? app : `https://${app}`;
const APP_PATHS = ["/sign-in", "/signup", "/emergency"];

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  async redirects() {
    if (!appUrl) return [];
    return APP_PATHS.flatMap((p) => [
      { source: p, destination: `${appUrl}${p}`, permanent: false },
      { source: `${p}/:rest*`, destination: `${appUrl}${p}/:rest*`, permanent: false },
    ]);
  },
};

export default nextConfig;
