"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const TargetReasonSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().min(8),
});

const CreateSuperadminSchema = z.object({
  target_user_id: z.string().uuid(),
  justification: z.string().min(8),
});

export type PeopleActionState = {
  ok?: boolean;
  error?: string;
  /** Set when a four-eyes-class action is awaiting a second approval. */
  awaitingSecondApproval?: boolean;
  pendingId?: string;
};

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
      logger.warn(`admin.people.${name}.failed`, { status: res.status });
      const err =
        (parsed as { error?: string } | null)?.error ?? text ?? `Edge Function ${res.status}.`;
      return { ok: false, error: err };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    logger.error(`admin.people.${name}.network`, { reason: String(e) });
    return { ok: false, error: `Couldn't reach ${name}.` };
  }
}

export async function suspendUserAction(
  _prev: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const parsed = TargetReasonSchema.safeParse({
    user_id: formData.get("user_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const result = await callEdgeFunction("sa-suspend-user", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/people");
  return { ok: true };
}

export async function resetUserMfaAction(
  _prev: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const parsed = TargetReasonSchema.safeParse({
    user_id: formData.get("user_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const result = await callEdgeFunction("sa-reset-user-mfa", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/people");
  return { ok: true };
}

export async function deactivateUserAction(
  _prev: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const parsed = TargetReasonSchema.safeParse({
    user_id: formData.get("user_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const result = await callEdgeFunction("sa-deactivate-user", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/people");
  return { ok: true };
}

export async function createSuperadminAction(
  _prev: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const parsed = CreateSuperadminSchema.safeParse({
    target_user_id: formData.get("target_user_id"),
    justification: formData.get("justification"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const result = await callEdgeFunction("sa-create-superadmin", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/people");
  const data = result.data as { awaiting_second_approval?: boolean; pending_id?: string } | null;
  if (data?.awaiting_second_approval) {
    return { ok: true, awaitingSecondApproval: true, pendingId: data.pending_id };
  }
  return { ok: true };
}
