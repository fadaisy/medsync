import type { LimitRowDraft } from "./_components/limits-editor";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { LAB } from "@/content/lab";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labCriticalsLiveFor, labUnitsRangesLiveFor } from "@/lib/lab/feature";
import { loadLimitsSetup } from "@/lib/lab/limits";
import { loadMeasuresSetup } from "@/lib/lab/measures-setup";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { SetupHeader } from "../_components/setup-header";
import { Caution } from "../../criticals/_components/alert-bits";
import { bandFromDays } from "../ranges/_lib/ages";
import { LimitsEditor } from "./_components/limits-editor";

export const metadata: Metadata = { title: "Critical limits · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Critical limits (Lab Phase 1 §5.8, the limits half of artboard 11). The banner states the truth for
 * this hospital: not signed, so MedSync does not flag; or signed, with the date and version. A limit
 * whose test's unit has since changed never fires and is listed (FL-5).
 */
export default async function LimitsSetupPage() {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !emrV1LiveFor(scope.hospitalId)) notFound();
  if (!labCriticalsLiveFor(scope.hospitalId) || !labUnitsRangesLiveFor(scope.hospitalId))
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const [setup, measures] = await Promise.all([
    db.transaction((tx) => loadLimitsSetup(tx as never, scope.hospitalId)),
    db.transaction((tx) => loadMeasuresSetup(tx as never, scope.hospitalId)),
  ]);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: LAB_TIME_ZONE,
  });
  const signed = setup.versions.find((v) => v.status === "signed");
  const draft = setup.versions.find((v) => v.status === "draft");
  const numeric = measures.components.filter(
    (c) => c.measure?.resultType === "number" && c.measure.unitUcum,
  );
  const unitOf = new Map(numeric.map((c) => [`${c.testId}:${c.conceptId}`, c.measure!.unitUcum!]));
  const label = new Map(
    numeric.map((c) => [`${c.testId}:${c.conceptId}`, `${c.test}: ${c.display}`]),
  );
  const shown = draft ?? signed;
  const initial: LimitRowDraft[] = shown
    ? setup.limits
        .filter((l) => l.versionId === shown.id)
        .map((l) => {
          const f = bandFromDays(l.ageFromDays);
          const t = bandFromDays(l.ageToDays);
          return {
            key: l.id,
            component: `${l.testId}:${l.conceptId}`,
            from: f.n,
            fromUnit: f.unit,
            to: t.n,
            toUnit: t.unit,
            low: l.low ?? "",
            high: l.high ?? "",
            referenceId: l.referenceId,
            source: l.source,
          };
        })
    : [];
  const stale = signed
    ? setup.limits.filter(
        (l) => l.versionId === signed.id && unitOf.get(`${l.testId}:${l.conceptId}`) !== l.unitUcum,
      )
    : [];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Critical limits"
      />
      {signed ? (
        <p className="text-body-s flex flex-wrap items-center gap-2">
          <StatusWord>Signed</StatusWord>
          Version {signed.version}, in force since{" "}
          {signed.inForceFrom ? date.format(signed.inForceFrom) : "signing"}. MedSync flags values
          at or beyond these limits; the lab still marks any other result by hand.
        </p>
      ) : (
        <Caution>
          No critical limits are signed for this hospital, so MedSync does not flag critical values.
          Mark critical results by hand.
        </Caution>
      )}
      {stale.length ? (
        <Caution>
          {stale.length === 1 ? "One signed limit" : `${stale.length} signed limits`} no longer
          match their test&apos;s unit and never fire:{" "}
          {stale
            .map(
              (l) => label.get(`${l.testId}:${l.conceptId}`) ?? LABWS2_SETUP.sweep.unknownComponent,
            )
            .join(", ")}
          . Draft them again in the new unit.
        </Caution>
      ) : null}
      <p className="text-body-s text-muted-foreground max-w-[75ch]">
        Consult the lab&apos;s current critical-call list, RCPath G158 (May 2026) Appendices A and
        B, the kit inserts and any national guidance the laboratory lead holds. Limits and response
        times are signed as two separate sets.
      </p>
      <LimitsEditor
        components={numeric.map((c) => ({
          value: `${c.testId}:${c.conceptId}`,
          label: `${c.test}: ${c.display}`,
          unit: c.measure!.unitDisplay ?? c.measure!.unitUcum!,
        }))}
        initial={initial}
        draftId={draft?.id ?? null}
        canSign={!!draft && !draft.leadSignedBy}
        authoredByMe={draft?.authoredBy === scope.userId}
      />
    </div>
  );
}
