"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { callEdge } from "@/lib/supabase/edge";

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
  const result = await callEdge("sa-open-break-glass", parsed.data, "admin.break-glass");
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
  const result = await callEdge("sa-close-break-glass", parsed.data, "admin.break-glass");
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/break-glass");
  return { ok: true };
}
