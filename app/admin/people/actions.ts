"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { callEdge } from "@/lib/supabase/edge";

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

export async function suspendUserAction(
  _prev: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const parsed = TargetReasonSchema.safeParse({
    user_id: formData.get("user_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const result = await callEdge("sa-suspend-user", parsed.data, "admin.people");
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
  const result = await callEdge("sa-reset-user-mfa", parsed.data, "admin.people");
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
  const result = await callEdge("sa-deactivate-user", parsed.data, "admin.people");
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
  const result = await callEdge("sa-create-superadmin", parsed.data, "admin.people");
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/people");
  const data = result.data as { awaiting_second_approval?: boolean; pending_id?: string } | null;
  if (data?.awaiting_second_approval) {
    return { ok: true, awaitingSecondApproval: true, pendingId: data.pending_id };
  }
  return { ok: true };
}
