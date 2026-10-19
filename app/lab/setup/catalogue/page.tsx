import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { testsWithoutUnit } from "@/lib/lab/criticals/readiness";
import { labCatalogueV2LiveFor, labUnitsRangesLiveFor } from "@/lib/lab/feature";
import { loadMeasuresSetup } from "@/lib/lab/measures-setup";
import { SetupHeader } from "../_components/setup-header";
import { MeasureForm } from "./_components/measure-form";

export const metadata: Metadata = { title: "Test catalogue · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Test catalogue (Lab Phase 1 §5.6, artboard 9): each lab test's components with their result type,
 * unit, decimals and LOINC code, and whether they can be resulted. Measurement facts only: a test's
 * name, section and where it is offered stay with the Departments and services hub.
 */
export default async function CatalogueSetupPage({
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
  const [s, blocked] = await Promise.all([
    db.transaction((tx) => loadMeasuresSetup(tx as never, scope.hospitalId)),
    testsWithoutUnit(scope.hospitalId),
  ]);
  const editing = edit
    ? s.components.find((c) => `${c.testId}:${c.conceptId}` === edit)
    : undefined;
  const typeWords = { number: "Number", coded: "Positive or negative", text: "Text" } as const;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Test catalogue"
        right={
          blocked.length ? (
            <StatusWord tone="caution">
              {blocked.length} {blocked.length === 1 ? "test in use cannot" : "tests in use cannot"}{" "}
              be resulted yet
            </StatusWord>
          ) : (
            <StatusWord>Every test in use has its units</StatusWord>
          )
        }
      />
      {editing ? (
        <MeasureForm
          key={edit}
          testId={editing.testId}
          conceptId={editing.conceptId}
          title={`${editing.test}: ${editing.display}`}
          current={{
            resultType:
              (editing.measure?.resultType as "number" | "coded" | "text") ??
              (editing.valueType === "quantity"
                ? "number"
                : editing.valueType === "coded"
                  ? "coded"
                  : "text"),
            unitUcum: editing.measure?.unitUcum ?? null,
            decimalPlaces: editing.measure?.decimalPlaces ?? null,
            loincCode: editing.measure?.loincCode ?? null,
            entryCheckLow: editing.measure?.entryCheckLow ?? null,
            entryCheckHigh: editing.measure?.entryCheckHigh ?? null,
            version: editing.measure?.version ?? null,
            methodCode: editing.measure?.methodCode ?? null,
            idmsTraceable: editing.measure?.idmsTraceable ?? null,
          }}
          units={s.units.map((u) => ({ code: u.code, display: u.display, words: u.words }))}
          methodRegister={labCatalogueV2LiveFor(scope.hospitalId)}
        />
      ) : null}
      <div className="border-border bg-card overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Test catalogue</caption>
          <thead>
            <tr className="bg-muted text-ink-600 text-caption">
              {[
                "Test",
                "Component",
                "Result type",
                "Unit",
                "Decimals",
                "LOINC",
                "State",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-border h-[34px] border-b px-3 font-medium whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.components.map((c) => {
              const m = c.measure;
              const numeric =
                (m?.resultType ?? (c.valueType === "quantity" ? "number" : "coded")) === "number";
              const ready = numeric ? !!m?.unitUcum : true;
              return (
                <tr
                  key={`${c.testId}:${c.conceptId}`}
                  className="border-ink-150 text-body-s border-b last:border-b-0"
                >
                  <td className="px-3 py-2">{c.test}</td>
                  <td className="px-3 py-2">{c.display}</td>
                  <td className="px-3 py-2">
                    {
                      typeWords[
                        (m?.resultType as keyof typeof typeWords) ?? (numeric ? "number" : "coded")
                      ]
                    }
                  </td>
                  <td className="px-3 py-2 font-mono">{m?.unitDisplay ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{m?.decimalPlaces ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{m?.loincCode ?? "—"}</td>
                  <td className="px-3 py-2">
                    {ready ? (
                      <StatusWord>{m ? `Ready · v${m.version}` : "Ready"}</StatusWord>
                    ) : (
                      <StatusWord tone="caution">Needs a unit</StatusWord>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/lab/setup/catalogue?edit=${c.testId}:${c.conceptId}`}
                      scroll={false}
                      className="font-medium text-teal-700 underline-offset-4 hover:underline"
                    >
                      Edit<span className="sr-only"> {c.display}</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
