"use server";

import type { PromptView } from "@patient-core/payments";
import { revalidatePath } from "next/cache";
import { normaliseUgMsisdn } from "@patient-core/payments";
import { z } from "zod";

import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";

/** Plus and the medical ID on the web (Step 10), through `pt-plus` and `pt-medical-id-token`. */
type Fail = { ok: false; error: string };
const Tier = z.enum(["plus_family", "plus_care", "family_care"]);

export async function startTrialAction(tier: string): Promise<{ ok: true } | Fail> {
  await requirePatientScope();
  const t = Tier.safeParse(tier);
  if (!t.success) return { ok: false, error: "That plan was not found." };
  const res = await callEdge(
    "pt-plus",
    { action: "trial", tier: t.data },
    "patient-web.plus.trial",
  );
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/pw/patient/me");
  return { ok: true };
}

export async function payPlusAction(input: {
  tier: string;
  period: string;
  network: "mtn" | "airtel";
  msisdn: string;
  idempotencyKey: string;
}): Promise<{ ok: true; view: PromptView } | Fail> {
  await requirePatientScope();
  if (!normaliseUgMsisdn(input.msisdn))
    return { ok: false, error: "That is not a Ugandan mobile number." };
  const res = await callEdge<{ data?: { view: PromptView } }>(
    "pt-plus",
    { action: "pay", ...input },
    "patient-web.plus.pay",
  );
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/pw/patient/me");
  return { ok: true, view: res.data?.data?.view ?? "nothing_taken" };
}

export async function medicalIdTokenAction(): Promise<
  { ok: true; modules: string[]; expiresAt: string } | Fail
> {
  await requirePatientScope();
  const res = await callEdge<{ data?: { modules: string[]; expiresAt: string } }>(
    "pt-medical-id-token",
    {},
    "patient-web.medical-id",
  );
  if (!res.ok || !res.data?.data) return { ok: false, error: res.ok ? "No code yet." : res.error };
  return { ok: true, modules: res.data.data.modules, expiresAt: res.data.data.expiresAt };
}
