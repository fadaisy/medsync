import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { catalogProposals, symptomCatalog, symptomPropertyMap } from "@/db/schema/symptom-catalog";
import { logger } from "@/lib/logger";

/**
 * Governed contribution to the shared catalog. Clerkers PROPOSE; CSO/superadmin
 * REVIEW. The shared catalog is NEVER directly mutated by a user — an approval
 * is the only path a proposal enters the versioned catalog. Per-encounter ad-hoc
 * items (in the clerkship section_data) are unaffected by this. Server-only.
 */

export type ProposalKind = "symptom" | "property" | "option" | "mapping";

export async function proposeCatalogItem(args: {
  proposerUserId: string;
  hospitalId: string | null;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  note?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const [row] = await db
      .insert(catalogProposals)
      .values({
        proposerUserId: args.proposerUserId,
        hospitalId: args.hospitalId,
        kind: args.kind,
        payload: args.payload,
        note: args.note ?? null,
      })
      .returning({ id: catalogProposals.id });
    return { ok: true, id: row!.id };
  } catch (e) {
    logger.error("proposeCatalogItem failed", { error: String(e) });
    return { ok: false, error: "Failed to submit the proposal." };
  }
}

export interface PendingProposalRow {
  id: string;
  kind: string;
  payload: unknown;
  note: string | null;
  proposerUserId: string;
  createdAtIso: string;
}

export async function listPendingProposals(): Promise<PendingProposalRow[]> {
  const rows = await db
    .select({
      id: catalogProposals.id,
      kind: catalogProposals.kind,
      payload: catalogProposals.payload,
      note: catalogProposals.note,
      proposerUserId: catalogProposals.proposerUserId,
      createdAt: catalogProposals.createdAt,
    })
    .from(catalogProposals)
    .where(eq(catalogProposals.status, "pending"))
    .orderBy(desc(catalogProposals.createdAt));
  return rows.map((r) => ({ ...r, createdAtIso: r.createdAt.toISOString() }));
}

/**
 * Review a proposal. On APPROVE of a `symptom`, insert it into the versioned
 * catalog (the governed mutation — only happens here, on approval). Other kinds
 * are recorded as approved for a curator to apply in a catalog migration (v1
 * auto-applies symptoms; properties/options/mappings are applied by the curator
 * to keep value-set + mapping integrity under review).
 */
export async function reviewProposal(args: {
  proposalId: string;
  reviewerUserId: string;
  decision: "approved" | "rejected";
  reviewNote?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [p] = await db
    .select({
      kind: catalogProposals.kind,
      payload: catalogProposals.payload,
      status: catalogProposals.status,
    })
    .from(catalogProposals)
    .where(eq(catalogProposals.id, args.proposalId))
    .limit(1);
  if (!p) return { ok: false, error: "Proposal not found." };
  if (p.status !== "pending") return { ok: false, error: "Already reviewed." };

  try {
    if (args.decision === "approved" && p.kind === "symptom") {
      const payload = p.payload as {
        code?: string;
        display?: string;
        system?: string;
        synonyms?: string[];
        mapping?: { propertyCode?: string; required?: boolean; sortOrder?: number }[];
      };
      if (payload.code && payload.display && payload.system) {
        // Governed PROMOTION: a doctor's personal template becomes shared (or a
        // brand-new one is inserted shared). created_by_* are immutable (DB
        // trigger) and untouched here, so the creator's attribution is preserved.
        await db
          .insert(symptomCatalog)
          .values({
            code: payload.code,
            display: payload.display,
            system: payload.system,
            synonyms: payload.synonyms ?? [],
            version: "shared",
            source: "clinician proposal (approved)",
            scope: "shared",
            origin: "approved",
          })
          .onConflictDoUpdate({
            target: symptomCatalog.code,
            set: { scope: "shared", origin: "approved", active: true },
          });
        // Apply the proposed property mapping (structure only — never values).
        const mapping = (payload.mapping ?? []).filter((m) => m.propertyCode);
        if (mapping.length) {
          await db
            .insert(symptomPropertyMap)
            .values(
              mapping.map((m) => ({
                symptomCode: payload.code!,
                propertyCode: m.propertyCode!,
                required: !!m.required,
                sortOrder: m.sortOrder ?? 0,
              })),
            )
            .onConflictDoNothing();
        }
      }
    }
    await db
      .update(catalogProposals)
      .set({
        status: args.decision,
        reviewerUserId: args.reviewerUserId,
        reviewedAt: new Date(),
        reviewNote: args.reviewNote ?? null,
      })
      .where(and(eq(catalogProposals.id, args.proposalId), eq(catalogProposals.status, "pending")));
    return { ok: true };
  } catch (e) {
    logger.error("reviewProposal failed", { error: String(e) });
    return { ok: false, error: "Failed to record the review." };
  }
}
