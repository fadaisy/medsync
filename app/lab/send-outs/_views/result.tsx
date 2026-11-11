import "server-only";

import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { Tag } from "@/components/medsync/tag";
import { Ident } from "@/components/tide/work/kit";
import { LABWS2_SEND_OUTS } from "@/content/lab-workspace-v2-send-outs";
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
import { identitiesFor } from "@/lib/emr/read/results";
import { scansFor } from "@/lib/lab/referral-read";
import { referralForEntry } from "@/lib/lab/referral-results-store";
import { ResultForm } from "../_components/result-form";
import { dateWords } from "../../_lib/days";

/**
 * Result back on paper (Lab Phase 4 §5.4, artboard 4): opened from a referral, never free-standing (RB-1). The
 * identity is typed from the paper and compared with the referral before any value is entered (RB-2). Rendered
 * by /lab/send-outs/[id]/result and the old /lab/referrals/[id]/result; `header` is each route's own heading.
 */
export async function ResultBack({
  scope,
  id,
  header,
  doneHref,
}: {
  scope: LabTechScope;
  id: string;
  header: (number: string) => ReactNode;
  doneHref: string;
}) {
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
    <div className="flex flex-col gap-5">
      {header(r.number)}
      <div className="text-body-s flex flex-wrap items-center gap-3">
        <Tag hue="sky">Referred</Tag>
        <span>
          {r.number} · {r.partnerName}
        </span>
        <span className="text-muted-foreground">
          Patient {who?.name ?? "Name withheld"} · <Ident>{who?.mrn}</Ident> · their form{" "}
          {r.theirNumbers.length ? (
            <Ident>{r.theirNumbers.join(", ")}</Ident>
          ) : (
            LABWS2_SEND_OUTS.noFormNumber
          )}
        </span>
      </div>
      <ResultForm
        referralId={r.id}
        doneHref={doneHref}
        partner={r.partnerName}
        components={data.concepts.map((c) => ({
          conceptId: c,
          name: name.get(c) ?? LABWS2_SEND_OUTS.unnamedComponent,
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
