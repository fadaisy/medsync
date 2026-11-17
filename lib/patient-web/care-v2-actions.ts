"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { careModeOn } from "@/lib/patient-web/flags";
import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";

/**
 * Care mode writes on the web, v2 (Step 9), through the same Edge Functions as the phone, each with a client key
 * made in the browser: a retry sends the same key, so a tick or a message is saved once (S18, MR13).
 */
type Result = { ok: true } | { ok: false; error: string };
const refresh = () => revalidatePath("/pw/patient/care", "layout");
const off: Result = { ok: false, error: "Care mode is not on for you yet." };

export async function tickDoseAction(input: {
  clientKey: string;
  planVersionId: string;
  medicineKey: string;
  dueAtIso: string;
}): Promise<Result> {
  await requirePatientScope();
  if (!careModeOn()) return off;
  const p = z
    .object({
      clientKey: z.string().min(8).max(80),
      planVersionId: z.uuid(),
      medicineKey: z.string().min(1).max(80),
      dueAtIso: z.iso.datetime(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "That tick could not be read." };
  const res = await callEdge(
    "pt-dose-event",
    {
      clientKey: p.data.clientKey,
      planVersionId: p.data.planVersionId,
      medicineKey: p.data.medicineKey,
      dueAt: p.data.dueAtIso,
      status: "taken",
    },
    "patient-web.care.tick",
  );
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true };
}

export async function sendCareMessageAction(clientKey: string, body: string): Promise<Result> {
  await requirePatientScope();
  if (!careModeOn()) return off;
  const p = z
    .object({ clientKey: z.string().min(8).max(80), body: z.string().trim().min(1).max(1000) })
    .safeParse({ clientKey, body });
  if (!p.success) return { ok: false, error: "A message is 1 to 1000 characters." };
  const res = await callEdge("pt-care-message", p.data, "patient-web.care.message");
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true };
}
