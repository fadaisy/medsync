/* eslint-disable no-console -- owner CLI */
/**
 * D-REL-17 (dx-relations-design §5.2): what today's note-level links (`impression.meta[parent].with`)
 * become as relations. UNSIGNED drafts only; a signed note is never read. Read-only by design: a
 * relation is the clinician's assertion, so nothing is written under their name. Each link becomes a
 * PROPOSAL the desk offers when the draft is next opened; the clinician's Confirm writes it with
 * createRelation(origin 'backfill_confirmed'), and only then.
 *
 *   - due_to / complication: the pair is a signed complication (data/clerking/dx-associations.v1.json)
 *   - associated_with: the pair is a signed goes_with
 *   - ask: anything else, or an end no longer a working/final diagnosis on the visit (asked on open)
 * A pair already related in the record is skipped. `flagged` stays on the draft (a property of the
 * diagnosis, not of the link).
 *
 *   npm run emr:backfill-relations        # report: drafts, proposals by kind (counts only, no PHI)
 */
import type { EmrDb } from "@/lib/emr/db";
import { and, eq, isNull, sql } from "drizzle-orm";

import ASSOCIATIONS from "@/data/clerking/dx-associations.v1.json";
import { clinicalNotes, conditionRelations, conditions } from "@/db/schema/emr";
import { DX_TERM_IDS } from "@/lib/clerking/impression/load";
import { newestVersions } from "@/lib/emr/diagnoses";
import { decrypt } from "@/lib/encryption";
import { runCli } from "./_cli";

type Assoc = { complications?: string[]; goes_with?: string[] };
const DATA = ASSOCIATIONS as {
  id: string;
  version: string;
  status: string;
  associations: Record<string, Assoc>;
};

export interface VisitDx {
  logicalId: string;
  /** The `dx.*` id of its term, when it has one. */
  dxId: string | null;
  verification: string;
}

export type Proposal =
  | {
      kind: "due_to" | "associated_with";
      conditionId: string;
      relatedConditionId: string;
      label: "complication" | null;
      catalogueRef: string;
    }
  | { kind: "ask"; parentLogicalId: string; childDxId: string };

/** The proposals for one draft's Impression. Pure. */
export function proposeRelations(
  meta: Record<string, { with?: string[] } | undefined>,
  visit: readonly VisitDx[],
  related: ReadonlySet<string> = new Set(),
  data = DATA,
): Proposal[] {
  if (!data.status.startsWith("signed")) return [];
  const byLogical = new Map(visit.map((d) => [d.logicalId, d]));
  const byDx = new Map(visit.flatMap((d) => (d.dxId ? [[d.dxId, d] as const] : [])));
  const live = (d?: VisitDx) =>
    !!d && d.verification !== "differential" && d.verification !== "refuted";
  const out: Proposal[] = [];
  for (const [parentId, m] of Object.entries(meta)) {
    const parent = byLogical.get(parentId);
    for (const childDx of m?.with ?? []) {
      const child = byDx.get(childDx);
      const entry = parent?.dxId ? data.associations[parent.dxId] : undefined;
      const ref = `${data.id}@${data.version}:${parent?.dxId}>${childDx}`;
      const ask = { kind: "ask", parentLogicalId: parentId, childDxId: childDx } as const;
      if (!live(parent) || !live(child) || child!.logicalId === parentId) {
        out.push(ask);
      } else if (entry?.complications?.includes(childDx)) {
        if (!related.has(`due_to|${child!.logicalId}|${parentId}`))
          out.push({
            kind: "due_to",
            conditionId: child!.logicalId,
            relatedConditionId: parentId,
            label: "complication",
            catalogueRef: ref,
          });
      } else if (entry?.goes_with?.includes(childDx)) {
        const [a, b] = [child!.logicalId, parentId].sort() as [string, string];
        if (!related.has(`associated_with|${a}|${b}`))
          out.push({
            kind: "associated_with",
            conditionId: a,
            relatedConditionId: b,
            label: null,
            catalogueRef: ref,
          });
      } else out.push(ask);
    }
  }
  return out;
}

/** Every unsigned clerking draft's proposals, counted. Reads only. */
export async function backfillRelationsReport(db: EmrDb): Promise<{
  drafts: number;
  withLinks: number;
  due_to: number;
  associated_with: number;
  ask: number;
}> {
  const drafts = await db
    .select({
      encounterId: clinicalNotes.encounterId,
      patientUserId: clinicalNotes.patientUserId,
      content: clinicalNotes.contentCiphertext,
    })
    .from(clinicalNotes)
    .where(and(eq(clinicalNotes.state, "draft"), isNull(clinicalNotes.addendumTo)));
  const n = { drafts: drafts.length, withLinks: 0, due_to: 0, associated_with: 0, ask: 0 };
  for (const d of drafts) {
    let meta: Record<string, { with?: string[] }> | undefined;
    try {
      meta = (JSON.parse(decrypt(d.content)) as { impression?: { meta?: typeof meta } }).impression
        ?.meta;
    } catch {
      continue; // unreadable draft: nothing to propose
    }
    if (!meta || !Object.values(meta).some((m) => m?.with?.length)) continue;
    n.withLinks++;
    const rows = newestVersions(
      await db
        .select({
          logicalId: conditions.logicalId,
          version: conditions.version,
          termId: conditions.termId,
          verification: conditions.verification,
          status: conditions.status,
          category: conditions.category,
          encounterId: conditions.encounterId,
        })
        .from(conditions)
        .where(eq(conditions.patientUserId, d.patientUserId)),
    ).filter(
      (c) =>
        c.category === "encounter_diagnosis" &&
        c.encounterId === d.encounterId &&
        c.status !== "entered_in_error" &&
        c.status !== "cancelled",
    );
    const related = new Set(
      (
        await db
          .select({
            t: conditionRelations.relationType,
            a: conditionRelations.conditionId,
            b: conditionRelations.relatedConditionId,
          })
          .from(conditionRelations)
          .where(
            and(
              eq(conditionRelations.patientUserId, d.patientUserId),
              eq(conditionRelations.state, "active"),
              sql`NOT EXISTS (SELECT 1 FROM public.condition_relations s WHERE s.supersedes_id = ${conditionRelations.id})`,
            ),
          )
      ).map((r) => `${r.t}|${r.a}|${r.b}`),
    );
    const visit = rows.map((c) => ({
      logicalId: c.logicalId,
      dxId: c.termId ? (DX_TERM_IDS[c.termId] ?? null) : null,
      verification: c.verification,
    }));
    for (const p of proposeRelations(meta, visit, related)) n[p.kind]++;
  }
  return n;
}

if (process.argv[1]?.endsWith("backfill-relations.ts"))
  void runCli(
    `
D-REL-17: what each unsigned draft's note-level links become as relations (counts only).
Read only: the desk proposes them when the draft is next opened; the clinician confirms each.`,
    async ({ db }) => {
      const r = await backfillRelationsReport(db);
      console.log(
        `Unsigned drafts: ${r.drafts}; with links: ${r.withLinks}. Proposals: due_to (complication) ${r.due_to}, associated_with ${r.associated_with}, ask the clinician ${r.ask}.`,
      );
    },
    { writes: false },
  );
