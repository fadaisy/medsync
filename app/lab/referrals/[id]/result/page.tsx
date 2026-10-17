import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { PageHeader } from "@/components/medsync/page-header";
import { Tag } from "@/components/medsync/tag";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import {
  cadres,
  clinicalConcepts,
  labComponentMeasures,
  staffAffiliations,
  testCatalogue,
  ucumUnits,
  users,
} from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { scansFor } from "@/lib/lab/referral-read";
import { referralForEntry } from "@/lib/lab/referral-results-store";
import { dateWords } from "../../../_lib/days";
import { ResultForm } from "./result-form";

export const metadata: Metadata = { title: "Result back on paper · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Result back on paper (Lab Phase 4 §5.4, artboard 4): opened from a referral, never free-standing (RB-1). The
 * identity is typed from the paper and compared with the referral before any value is entered (RB-2).
 */
export default async function ResultBackPage({ params }: { params: Promise<{ id: string }> }) {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labReferralLiveFor(scope.hospitalId)
  )
    notFound();
  const { id } = await params;
  const data = await db.transaction(async (tx) => {
    const r = await referralForEntry(tx, scope.hospitalId, id).catch(() => null);
    if (!r) return null;
    const [test] = r.testId
      ? await tx.select().from(testCatalogue).where(eq(testCatalogue.id, r.testId))
      : [];
    const concepts = test?.components ?? [];
    const [names, measures, units, checkers, scans] = await Promise.all([
      concepts.length
        ? tx
            .select({ id: clinicalConcepts.id, display: clinicalConcepts.display })
            .from(clinicalConcepts)
            .where(inArray(clinicalConcepts.id, concepts))
        : [],
      r.testId && concepts.length
        ? tx
            .select({
              conceptId: labComponentMeasures.conceptId,
              unit: labComponentMeasures.unitUcum,
            })
            .from(labComponentMeasures)
            .where(
              and(
                eq(labComponentMeasures.hospitalId, scope.hospitalId),
                eq(labComponentMeasures.testId, r.testId),
                isNull(labComponentMeasures.supersededBy),
              ),
            )
        : [],
      tx.select({ code: ucumUnits.code, display: ucumUnits.display }).from(ucumUnits),
      tx
        .selectDistinct({ id: users.id, name: users.fullName })
        .from(staffAffiliations)
        .innerJoin(users, eq(users.id, staffAffiliations.userId))
        .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
        .where(
          and(
            eq(staffAffiliations.hospitalId, scope.hospitalId),
            inArray(staffAffiliations.state, ["active", "approved"]),
            inArray(cadres.code, ["LAB_TECH", "LAB_TECHNOLOGIST"]),
          ),
        ),
      scansFor(tx, scope.hospitalId, id),
    ]);
    return { r, test, concepts, names, measures, units, checkers, scans };
  });
  if (!data) notFound();
  const { r } = data;
  const who = (await identitiesFor(scope, [r.patientUserId], "lab_referral_result")).get(
    r.patientUserId,
  );
  const name = new Map(data.names.map((n) => [n.id, n.display]));
  const unit = new Map(data.measures.map((m) => [m.conceptId, m.unit]));
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place} / Referrals / ${r.number}`}
        placeInTopBar
        title="Result back on paper"
      />
      <div className="text-body-s flex flex-wrap items-center gap-3">
        <Tag hue="sky">Referred</Tag>
        <span>
          {r.number} · {r.partnerName}
        </span>
        <span className="text-muted-foreground">
          Patient {who?.name ?? "Name withheld"} · <span className="font-mono">{who?.mrn}</span> ·
          their form <span className="font-mono">{r.theirNumbers.join(", ") || "—"}</span>
        </span>
      </div>
      <ResultForm
        referralId={r.id}
        partner={r.partnerName}
        components={data.concepts.map((c) => ({
          conceptId: c,
          name: name.get(c) ?? c,
          hospitalUnit: unit.get(c) ?? null,
        }))}
        units={data.units}
        checkers={data.checkers.filter((c) => c.id !== scope.userId)}
        scans={data.scans.map((s) => ({
          theirReport: s.theirReport,
          uploadedAt: dateWords(s.uploadedAt),
        }))}
      />
    </div>
  );
}
