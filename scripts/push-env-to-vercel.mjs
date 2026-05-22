/* eslint-disable no-console -- CLI script: console output is the UI. */
/**
 * One-off: read .env.local (via @next/env to handle quirky lines) and push
 * each variable to Vercel (production + preview + development).
 *
 * The current Vercel CLI requires `--value <v> --yes` (stdin no longer
 * accepted for preview, which prompts about branch scope). The script
 * is idempotent — `--force` overwrites.
 *
 * Values pass via spawn argv; on a shared host this would briefly appear
 * in `ps`. On a single-user dev box this is acceptable; long-term env
 * management should use `vercel env pull` for inbound and the dashboard
 * (or this script run in a clean shell) for outbound.
 *
 * Run: node scripts/push-env-to-vercel.mjs
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

// @next/env skips .env.local when NODE_ENV=test; override during load.
const env = process.env;
const saved = env.NODE_ENV;
env.NODE_ENV = "development";
loadEnvConfig(process.cwd());
if (saved === undefined) delete env.NODE_ENV;
else env.NODE_ENV = saved;

const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DATABASE_DIRECT_URL",
  "MEDSYNC_PHI_KEY",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "AFRICASTALKING_USERNAME",
  "AFRICASTALKING_API_KEY",
  "AFRICASTALKING_SENDER_ID",
];

const ENVS = ["production", "preview", "development"];

let pushed = 0;
let skipped = 0;
let failed = 0;

for (const key of VARS) {
  const value = process.env[key];
  if (!value) {
    console.log(`  · skipped ${key} (not in .env.local)`);
    skipped++;
    continue;
  }

  let envOk = 0;
  for (const e of ENVS) {
    const r = spawnSync(
      "npx",
      ["vercel", "env", "add", key, e, "--value", value, "--force", "--yes"],
      { encoding: "utf8" },
    );
    if (r.status === 0) {
      envOk++;
    } else {
      const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
      if (out.includes("already exists") || out.includes('"status": "ok"')) {
        envOk++;
      } else {
        console.error(`  ✗ ${key} (${e}) status=${r.status}`);
      }
    }
  }
  if (envOk === ENVS.length) {
    console.log(`  ✓ pushed ${key} → ${ENVS.join(", ")}`);
    pushed++;
  } else {
    failed++;
  }
}

console.log(`\nDone. pushed=${pushed} skipped=${skipped} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
