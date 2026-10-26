import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

import { LAB_REDIRECTS } from "./lib/lab/redirects";

const nextConfig: NextConfig = {
  // The build's own type check took 11.7 of 15 minutes; the pre-commit hook already runs `npm run typecheck` on every
  // commit. Run it by hand before deploying uncommitted code.
  typescript: { ignoreBuildErrors: true },
  // Vercel Analytics is loaded via @vercel/analytics in app/layout.tsx (0.8).
  experimental: {
    serverActions: {
      // Default is 1 MB. Registration posts an optional photo (≤ 8 MB raw,
      // ADR 0085 §1) and the hospital form two licence documents.
      bodySizeLimit: "10mb",
    },
  },
  images: { formats: ["image/avif", "image/webp"] },
  // Lab Phase 2: the drafts page hashes these files at request time (the addendum and the research import are
  // signed by their SHA-256). Their paths are built from constants, which file tracing cannot follow, so name them.
  outputFileTracingIncludes: {
    "/lab/setup/**": [
      "./data/emr/clinical-fact-concepts.v1.6.json",
      "./docs/lab/catalogue-research/lab-catalogue-research.v1.json",
    ],
    // Lab Phase 3 Step 9: the HMIS 105 form file is read and hashed at request time (lib/lab/hmis-form.ts).
    "/lab/**": ["./data/lab/hmis105-2019-09.json"],
    "/hmis/**": ["./data/lab/hmis105-2019-09.json"],
    "/hmis": ["./data/lab/hmis105-2019-09.json"],
    "/api/cron/hmis-changes": ["./data/lab/hmis105-2019-09.json"],
  },
  // Landing v4 route audit: one route family. The old /onboarding/* doors
  // became /signup/*; keep the old links (and search results) working.
  // Lab Workspace v2 (ADR 0349): every old lab route answers 308 to its new home, ids and query kept.
  async redirects() {
    return [
      ...["patient", "clinical", "hospital"].map((door) => ({
        source: `/onboarding/${door}`,
        destination: `/signup/${door}`,
        permanent: true,
      })),
      ...LAB_REDIRECTS,
    ];
  },

  async rewrites() {
    return [
      // The bionic islet sensor bench. A self-contained static build that
      // lives in public/bioniccell/, so Next already serves
      // /bioniccell/index.html verbatim; this makes the bare /bioniccell work
      // too, which is the URL people will type and share. Regenerate the
      // build with `npm run bench:embed` whenever the bench changes.
      { source: "/bioniccell", destination: "/bioniccell/index.html" },
    ];
  },
};

/**
 * Gate H (ADR 0094, PRD §4.5): `npm run analyze` writes .next/analyze/*.html
 * treemaps. The plugin is webpack-only, so that script passes `--webpack`;
 * a normal (Turbopack) build never sees it. The size gate itself is
 * `npm run budget` (scripts/check-budget.mjs) — the analyzer is for finding
 * WHAT grew, not for deciding whether it may.
 */
const withAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

/**
 * Wrap with Sentry only if a DSN is present — keeps local dev builds clean
 * for anyone working without a Sentry project.
 */
export default process.env.SENTRY_DSN
  ? withSentryConfig(withAnalyzer(nextConfig), {
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
  : withAnalyzer(nextConfig);
