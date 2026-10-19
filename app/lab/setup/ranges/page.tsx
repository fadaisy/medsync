import type { EditableBand } from "./_components/range-editor";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadCutoffs } from "@/lib/lab/cutoffs-read";
import { labCatalogueV2LiveFor, labUnitsRangesLiveFor } from "@/lib/lab/feature";
import { loadMeasuresSetup } from "@/lib/lab/measures-setup";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { SetupHeader } from "../_components/setup-header";
import { RangeEditor } from "./_components/range-editor";
import { SchemeSection } from "./_components/scheme-section";
import { bandFromDays } from "./_lib/ages";

export const metadata: Metadata = { title: "Reference ranges · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Reference ranges (Lab Phase 1 §5.7, artboard 10): each numeric component with its state, and the
 * editor for one. Gaps between bands are allowed; the preview shows what a patient in a gap gets. No
 * band ships: every number is typed by the hospital, with its source (Law 5). With labCatalogueV2 on
 * (Lab Phase 2 §5.12, artboard 12) the page is "Ranges and cut-offs": the same reference intervals, then
 * the decision cut-offs.
 */
export default async function RangesSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labUnitsRangesLiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const { edit } = await searchParams;
  const v2 = labCatalogueV2LiveFor(scope.hospitalId);
  const [s, cutoffs] = await db.transaction((tx) =>
    Promise.all([
      loadMeasuresSetup(tx as never, scope.hospitalId),
      v2 ? loadCutoffs(tx as never, scope.hospitalId, new Date()) : null,
    ]),
  );
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: LAB_TIME_ZONE,
  });
  const numeric = s.components.filter(
    (c) =>
      (c.measure?.resultType ?? (c.valueType === "quantity" ? "number" : "coded")) === "number",
  );
  const editing = edit ? numeric.find((c) => `${c.testId}:${c.conceptId}` === edit) : undefined;
  const state = (c: (typeof numeric)[number]) =>
    !c.measure?.unitUcum ? (
      <StatusWord tone="caution">Needs a unit</StatusWord>
    ) : c.draft?.leadSignedBy ? (
      <StatusWord tone="caution">Waiting for the CSO</StatusWord>
    ) : c.signed ? (
      <StatusWord>
        Signed {c.signed.inForceFrom ? date.format(c.signed.inForceFrom) : ""}
        {c.draft ? " · draft open" : ""}
      </StatusWord>
    ) : c.draft ? (
      <StatusWord tone="caution">Draft</StatusWord>
    ) : (
      <StatusWord tone="caution">No range</StatusWord>
    );
  const source = editing?.draft ?? editing?.signed ?? null;
  const initial: EditableBand[] = source
    ? s.bands
        .filter((b) => b.versionId === source.id)
        .map((b) => {
          const f = bandFromDays(b.ageFromDays);
          const t = bandFromDays(b.ageToDays);
          return {
            sex: b.sex as EditableBand["sex"],
            from: f.n,
            fromUnit: f.unit,
            to: t.n,
            toUnit: t.unit,
            low: b.low ?? "",
            high: b.high ?? "",
            source: b.source,
          };
        })
    : [];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={v2 ? "Ranges and cut-offs" : "Reference ranges"}
      />
      <p className="text-body-s text-muted-foreground max-w-[75ch]">
        A range is used only once the laboratory lead and the CSO have signed it. An interval from a
        kit insert or the literature is verified on 20 local reference samples and accepted if no
        more than 2 fall outside (CLSI EP28-A3c). Until a range is signed, technologists type the
        lab&apos;s range as today and the result is marked unsigned.
      </p>
      {editing && editing.measure?.unitUcum ? (
        <RangeEditor
          key={edit}
          testId={editing.testId}
          conceptId={editing.conceptId}
          unit={editing.measure.unitUcum}
          initial={initial}
          draftId={editing.draft?.id ?? null}
          canSign={!!editing.draft && !editing.draft.leadSignedBy}
          authoredByMe={editing.draft?.authoredBy === scope.userId}
        />
      ) : editing ? (
        <p className="text-body-s">
          Set this component&apos;s unit in the{" "}
          <Link
            href={`/lab/setup/catalogue?edit=${editing.testId}:${editing.conceptId}`}
            className="text-teal-700 underline-offset-4 hover:underline"
          >
            test catalogue
          </Link>{" "}
          first.
        </p>
      ) : null}
      <div className="border-border bg-card overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Reference ranges</caption>
          <thead>
            <tr className="bg-muted text-ink-600 text-caption">
              {["Test", "Component", "Unit", "State", "Actions"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-border h-[34px] border-b px-3 font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numeric.map((c) => (
              <tr
                key={`${c.testId}:${c.conceptId}`}
                className="border-ink-150 text-body-s border-b last:border-b-0"
              >
                <td className="px-3 py-2">{c.test}</td>
                <td className="px-3 py-2">{c.display}</td>
                <td className="px-3 py-2 font-mono">{c.measure?.unitDisplay ?? "—"}</td>
                <td className="px-3 py-2">{state(c)}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/lab/setup/ranges?edit=${c.testId}:${c.conceptId}`}
                    scroll={false}
                    className="font-medium text-teal-700 underline-offset-4 hover:underline"
                  >
                    Edit<span className="sr-only"> {c.display}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cutoffs ? (
        <SchemeSection
          concepts={cutoffs.concepts}
          elevation={cutoffs.elevation}
          userId={scope.userId}
        />
      ) : null}
    </div>
  );
}
