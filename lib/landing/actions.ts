"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { parseLead } from "@/lib/landing/lead";
import { logger } from "@/lib/logger";
import { allow } from "@/lib/onboarding/rate-limit";

/**
 * "Register your clinic" (D-LP-09): validate, then store one row with the service role. A bot (honeypot)
 * or a sixth try in an hour is refused silently: it sees the same success, and nothing is stored.
 * The email never goes to a log or an analytics event.
 *
 * Shared by the hospital app's /tether and the standalone site (apps/tether-site), so it reads only the two
 * variables it needs, not the hospital app's validated env (lib/env), which the site does not carry.
 */
export async function registerClinic(input: {
  email: string;
  company: string;
}): Promise<{ ok: true } | { ok: false; error: "bad" | "failed" }> {
  const lead = parseLead(input);
  if (lead.kind === "bad") return { ok: false, error: "bad" };
  if (lead.kind === "bot" || !(await allow("clinic-leads", 5, 3_600_000))) return { ok: true };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.error("clinic_leads.not_configured");
    return { ok: false, error: "failed" };
  }
  const ua = (await headers()).get("user-agent");
  const { error } = await createClient(url, key, { auth: { persistSession: false } })
    .from("clinic_leads")
    .insert({
      email: lead.email,
      source: "landing",
      user_agent_hash: ua ? createHash("sha256").update(ua).digest("hex") : null,
    });
  if (error) {
    logger.error("clinic_leads.insert_failed", { code: error.code });
    return { ok: false, error: "failed" };
  }
  return { ok: true };
}
