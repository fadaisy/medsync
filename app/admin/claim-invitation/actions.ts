"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const ClaimSchema = z.object({
  token: z.string().min(10).max(200),
});

export type ClaimState = { ok?: true; designation?: string; error?: string };

export async function claimInvitationAction(
  _prev: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const parsed = ClaimSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { error: "Invalid token." };

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "Not authenticated." };

  try {
    const res = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/accept-hospital-admin-invitation`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify({ token: parsed.data.token }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      logger.warn("admin.claim_invitation.failed", { status: res.status });
      return { error: text || `Edge Function returned ${res.status}.` };
    }
    const body = (await res.json()) as {
      hospital_id: string;
      designation: string;
      claimed: boolean;
    };
    revalidatePath("/admin");
    revalidatePath("/admin/setup");
    return { ok: true, designation: body.designation };
  } catch (e) {
    logger.error("admin.claim_invitation.network", { reason: String(e) });
    return { error: "Couldn't reach the claim service." };
  }
}
