"use server";

import { revalidatePath } from "next/cache";

import { getAuthState } from "@/lib/auth";
import { reviewProposal } from "@/lib/catalog/governance";

/**
 * Review a symptom-catalog proposal — superadmin (CSO) only. Approve of a
 * `symptom` performs the governed insert into the versioned catalog; the shared
 * catalog is never mutated except through this path.
 */
export type ReviewResult = { ok: true } | { ok: false; error: string };

export async function reviewCatalogProposalAction(
  proposalId: string,
  decision: "approved" | "rejected",
  reviewNote?: string,
): Promise<ReviewResult> {
  const state = await getAuthState();
  if (!state.user || !state.roles.includes("superadmin")) {
    return { ok: false, error: "Superadmin only." };
  }
  const res = await reviewProposal({
    proposalId,
    reviewerUserId: state.user.id,
    decision,
    reviewNote,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/catalog-proposals");
  return { ok: true };
}
