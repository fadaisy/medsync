"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const ActivateSchema = z.object({
  hospital_id: z.string().uuid(),
  reason: z.string().min(8),
});

export type ActivateState = { ok?: boolean; error?: string };

export async function activateHospitalAction(
  _prev: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  const parsed = ActivateSchema.safeParse({
    hospital_id: formData.get("hospital_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "Not authenticated." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sa-activate-hospital`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        hospital_id: parsed.data.hospital_id,
        reason: parsed.data.reason,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn("admin.activate-hospital.failed", { status: res.status });
      return { error: text || `Edge Function returned ${res.status}.` };
    }
    revalidatePath("/admin/tenants");
    return { ok: true };
  } catch (e) {
    logger.error("admin.activate-hospital.network", { reason: String(e) });
    return { error: "Couldn't reach the activation service." };
  }
}
