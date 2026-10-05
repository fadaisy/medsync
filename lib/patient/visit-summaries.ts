import "server-only";

import type { VisitSummaryContent } from "@/lib/patient/visit-summary";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { patientVisitSummaries } from "@/db/schema/admissions";
import { hospitals } from "@/db/schema/hospitals";
import { selfMedications } from "@/db/schema/patient-self-tracking";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { parseVisitSummary } from "@/lib/patient/visit-summary";

/**
 * The patient's shared visit summaries (ADR 0203). Every read is the caller's OWN rows, shared and current
 * (`superseded_at IS NULL`); a held or superseded copy never reaches a patient. A copy that will not decrypt or
 * parse is skipped with a warning naming the row, never its content.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const t = patientVisitSummaries;
const mineShared = (patientUserId: string) =>
  and(eq(t.patientUserId, patientUserId), eq(t.state, "shared"), isNull(t.supersededAt));

function open(id: string, ciphertext: string | null): VisitSummaryContent | null {
  let content: VisitSummaryContent | null = null;
  try {
    if (ciphertext) content = parseVisitSummary(decrypt(ciphertext));
  } catch {
    content = null;
  }
  if (!content) logger.warn("patient.visit_summary.unreadable", { summaryId: id });
  return content;
}

export interface VisitSummaryListItem {
  id: string;
  encounterId: string;
  decidedAt: Date;
  /** A later version replaced the first one shared. */
  updated: boolean;
  hospitalName: string;
  outcome: string;
}

export async function listVisitSummaries(patientUserId: string): Promise<VisitSummaryListItem[]> {
  const rows = await db
    .select({
      id: t.id,
      encounterId: t.encounterId,
      decidedAt: t.decidedAt,
      version: t.version,
      ciphertext: t.copyCiphertext,
      hospitalName: hospitals.name,
    })
    .from(t)
    .innerJoin(hospitals, eq(hospitals.id, t.hospitalId))
    .where(mineShared(patientUserId))
    .orderBy(desc(t.decidedAt));

  return rows.flatMap((r) => {
    const content = open(r.id, r.ciphertext);
    return content
      ? [
          {
            id: r.id,
            encounterId: r.encounterId,
            decidedAt: r.decidedAt,
            updated: r.version > 1,
            hospitalName: r.hospitalName,
            outcome: content.outcome,
          },
        ]
      : [];
  });
}

export async function getVisitSummary(
  patientUserId: string,
  summaryId: string,
): Promise<VisitSummaryContent | null> {
  if (!UUID.test(summaryId)) return null;
  const [row] = await db
    .select({ ciphertext: t.copyCiphertext })
    .from(t)
    .where(and(eq(t.id, summaryId), mineShared(patientUserId)))
    .limit(1);
  return row ? open(summaryId, row.ciphertext) : null;
}

/** Of these prescriptions, the ones already in the patient's tracker (any state). */
export async function prescriptionsInTracker(
  patientUserId: string,
  prescriptionIds: string[],
): Promise<Set<string>> {
  const ids = prescriptionIds.filter((id) => UUID.test(id));
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: selfMedications.sourcePrescriptionId })
    .from(selfMedications)
    .where(
      and(
        eq(selfMedications.patientUserId, patientUserId),
        inArray(selfMedications.sourcePrescriptionId, ids),
      ),
    );
  return new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
}
