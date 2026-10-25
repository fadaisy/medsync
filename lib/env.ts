import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Validated environment variables for MedSync.
 *
 * - Required server vars throw on first access if absent.
 * - Required public vars throw at build/runtime if absent.
 * - Optional vars wired ahead of the sub-phase that consumes them.
 *
 * To skip validation locally during scaffolding work, set
 * `SKIP_ENV_VALIDATION=1` in `.env.local` — do NOT ship this to Vercel.
 */
export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "Required: server-only Supabase service role key"),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (v) => v.includes(":6543") || v.includes("pooler"),
        "DATABASE_URL should point at the Supabase connection pooler (port 6543).",
      ),
    DATABASE_DIRECT_URL: z
      .string()
      .url()
      .refine(
        (v) => v.includes(":5432") || !v.includes(":6543"),
        "DATABASE_DIRECT_URL should be the direct connection (port 5432, not the pooler).",
      ),

    // Phase 0.7 — populated when the encryption lib lands.
    MEDSYNC_PHI_KEY: z
      .string()
      .min(44, "MEDSYNC_PHI_KEY must be a base64-encoded 32-byte key (44 chars).")
      .optional(),

    // Phase 0.8 — populated when Sentry wires in.
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),

    // Phase 5+ — populated when SMS goes live.
    AFRICASTALKING_USERNAME: z.string().optional(),
    AFRICASTALKING_API_KEY: z.string().optional(),
    AFRICASTALKING_SENDER_ID: z.string().optional(),

    /**
     * Phase 1 GATE G — shared secret the Vercel Cron hook supplies as
     * `Authorization: Bearer ${CRON_SECRET}` so only the scheduler can
     * trigger the cleanup route. Generate with
     *   openssl rand -hex 32
     * and set in Vercel project env (and .env.local for dev).
     */
    CRON_SECRET: z.string().min(16, "CRON_SECRET should be ≥ 16 chars.").optional(),

    /**
     * Gate E (ADR 0090). EXPO_PUSH_ACCESS_TOKEN is optional (Expo's enhanced
     * push security). SMS_WEBHOOK_SECRET is the path segment Africa's Talking
     * posts delivery reports to: /api/sms/dlr/<secret>. `openssl rand -hex 32`.
     */
    EXPO_PUSH_ACCESS_TOKEN: z.string().optional(),
    SMS_WEBHOOK_SECRET: z.string().min(16, "SMS_WEBHOOK_SECRET should be ≥ 16 chars.").optional(),
    /**
     * Gate F (ADR 0091). USSD_WEBHOOK_SECRET is the path segment Africa's
     * Talking posts USSD callbacks to: /api/ussd/<secret>. AT_CALLBACK_IPS is
     * an optional comma-separated allowlist of AT's published source IPs,
     * enforced on every AT webhook only when set (docs/ops-channels.md).
     */
    USSD_WEBHOOK_SECRET: z.string().min(16, "USSD_WEBHOOK_SECRET should be ≥ 16 chars.").optional(),
    AT_CALLBACK_IPS: z.string().optional(),
    /**
     * ADR 0411. Reads the numbers off a photo of a home BP monitor, sugar meter
     * or scale for the phone's "Log a reading". Optional: without it the photo
     * button says it is not switched on, and typing and voice still work.
     */
    ANTHROPIC_API_KEY: z.string().min(20).optional(),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL."),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "Required: Supabase anon key."),

    // Phase 0.8 — public Sentry DSN for client-side error reporting.
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
  /**
   * Next.js inlines NEXT_PUBLIC_* at build time. Server vars must be referenced
   * explicitly here so they're not accidentally bundled into the client.
   */
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
    MEDSYNC_PHI_KEY: process.env.MEDSYNC_PHI_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY,
    AFRICASTALKING_SENDER_ID: process.env.AFRICASTALKING_SENDER_ID,
    CRON_SECRET: process.env.CRON_SECRET,
    EXPO_PUSH_ACCESS_TOKEN: process.env.EXPO_PUSH_ACCESS_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SMS_WEBHOOK_SECRET: process.env.SMS_WEBHOOK_SECRET,
    USSD_WEBHOOK_SECRET: process.env.USSD_WEBHOOK_SECRET,
    AT_CALLBACK_IPS: process.env.AT_CALLBACK_IPS,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
