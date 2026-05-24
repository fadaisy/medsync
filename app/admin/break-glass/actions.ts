"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const OpenSchema = z.object({
  patient_id: z.string().uuid(),
  purpose: z.string().min(16),
  category: z.enum([
    "emergency",
    "regulator_request",
    "safety_review",
    "research_per_pdc",
    "other",
  ]),
  minutes: z.number().int().min(5).max(60),
});

const CloseSchema = z.object({
  grant_id: z.string().uuid(),
  reason: z.string().min(4),
});

export type BreakGlassState = { ok?: boolean; error?: string; grantId?: string };

async function callEdgeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "Not authenticated." };
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      logger.warn(`admin.break-glass.${name}.failed`, { status: res.status });
      const err = (parsed as { error?: string } | null)?.error ?? text ?? `Edge ${res.status}.`;
      return { ok: false, error: err };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    logger.error(`admin.break-glass.${name}.network`, { reason: String(e) });
    return { ok: false, error: `Couldn't reach ${name}.` };
  }
}

export async function openBreakGlassAction(
  _prev: BreakGlassState,
  formData: FormData,
): Promise<BreakGlassState> {
  const parsed = OpenSchema.safeParse({
    patient_id: formData.get("patient_id"),
    purpose: formData.get("purpose"),
    category: formData.get("category"),
    minutes: Number(formData.get("minutes") ?? 15),
  });
  if (!parsed.success) {
    const issues = parsed.error.flatten();
    const firstError =
      issues.fieldErrors.purpose?.[0] ??
      issues.fieldErrors.minutes?.[0] ??
      issues.fieldErrors.category?.[0] ??
      issues.fieldErrors.patient_id?.[0] ??
      "Invalid input.";
    return { error: firstError };
  }
  const result = await callEdgeFunction("sa-open-break-glass", parsed.data);
  if (!result.ok) return { error: result.error };
  const data = result.data as { grant_id?: string } | null;
  revalidatePath("/admin/break-glass");
  return { ok: true, grantId: data?.grant_id };
}

export async function closeBreakGlassAction(
  _prev: BreakGlassState,
  formData: FormData,
): Promise<BreakGlassState> {
  const parsed = CloseSchema.safeParse({
    grant_id: formData.get("grant_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const result = await callEdgeFunction("sa-close-break-glass", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/break-glass");
  return { ok: true };
}
