import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Vercel Analytics is loaded via @vercel/analytics in app/layout.tsx (0.8).
};

/**
 * Wrap with Sentry only if a DSN is present — keeps local dev builds clean
 * for anyone working without a Sentry project.
 */
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: !process.env.CI,
      // Org/project come from env so we don't hard-code Usama's account here.
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Source maps: upload on prod build, skip in dev.
      sourcemaps: { disable: process.env.NODE_ENV !== "production" },
      // Don't auto-instrument Vercel Cron Monitors — we don't use them yet.
      automaticVercelMonitors: false,
      // Tunnel Sentry events through a Next route to bypass ad-blockers.
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
