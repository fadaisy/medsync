import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { LAB } from "@/content/lab";
import { LAB5 } from "@/content/lab-phase-5";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { db } from "@/db";
import { clinicalConcepts, labComponentMeasures, testCatalogue } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { deltaRulesWithReview } from "@/lib/lab/delta-read";
import { labDeltaChecksLiveFor } from "@/lib/lab/feature";
import { SetupHeader } from "../_components/setup-header";
import { EmptyState } from "@/components/tide/work/kit";
import {
  DeltaRuleDialog,
  PanelRuleDialog,
  PatternRuleDialog,
  SignRule,
  TrialButton,
} from "./_components/delta-forms";

export const metadata: Metadata = { title: "Delta checks · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const W = LABWS2_SETUP.sweep;

const TYPE: Record<string, string> = {
  absolute: "absolute change",
  percent: "per cent change",
  rate_absolute: "change per day",
  rate_percent: "per cent change per day",
  rcv: "change beyond the reference change value",
};
const KIND: Record<string, string> = {
  delta_rule: "Delta",
  panel_rule: "Panel",
  pattern_rule: "Pattern",
};

/**
 * Delta check rules (Lab Phase 5 §5.7, artboard 7; DL-1, DL-8, DL-9). For `lab.manage`: the rules with their
 * status and the last 30 days, a read-only trial on past results, and the forms. A rule without a signed limit and
 * basis never runs; the laboratory lead signs, the CSO countersigns in the admin console.
 */
export default async function DeltaRulesPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labDeltaChecksLiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const h = scope.hospitalId;
  const [rules, measures] = await Promise.all([
    db.transaction((tx) => deltaRulesWithReview(tx, h, new Date())),
    db
      .selectDistinct({
        testId: labComponentMeasures.testId,
        concept: labComponentMeasures.conceptId,
        name: clinicalConcepts.display,
      })
      .from(labComponentMeasures)
      .innerJoin(clinicalConcepts, eq(clinicalConcepts.id, labComponentMeasures.conceptId))
      .where(
        and(eq(labComponentMeasures.hospitalId, h), eq(labComponentMeasures.resultType, "number")),
      ),
  ]);
  const testIds = [...new Set(measures.map((m) => m.testId))];
  const tests = testIds.length
    ? await db
        .select({ id: testCatalogue.id, code: testCatalogue.code, name: testCatalogue.display })
        .from(testCatalogue)
        .where(inArray(testCatalogue.id, testIds))
    : [];
  const concepts = [
    ...new Map(measures.map((m) => [m.concept, { id: m.concept, name: m.name }])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const conceptName = new Map(concepts.map((c) => [c.id, c.name]));
  const panelTests = tests.map((t) => ({
    code: t.code,
    name: t.name,
    components: measures
      .filter((m) => m.testId === t.id)
      .map((m) => ({ id: m.concept, name: m.name })),
  }));
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Delta checks"
      />
      <p role="note" className="border-border bg-muted text-body-s max-w-4xl rounded-md border p-3">
        {LAB5.deltaNote} A rule runs only once the laboratory lead has signed it with the source of
        its limit and the CSO has countersigned it. No limit is suggested by MedSync.
      </p>
      <div className="flex flex-wrap gap-2">
        <DeltaRuleDialog concepts={concepts} />
        <PanelRuleDialog tests={panelTests} />
        <PatternRuleDialog concepts={concepts} />
      </div>
      {rules.length === 0 ? (
        <EmptyState title={W.deltaTitle} why={W.deltaWhy} />
      ) : (
        <div
          className="border-border bg-card overflow-auto rounded-lg border"
          tabIndex={0}
          role="region"
          aria-label="Delta rules"
        >
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Delta, panel and pattern rules</caption>
            <thead>
              <tr className="bg-muted">
                {[
                  "Rule",
                  "Component",
                  "Compared as",
                  "Limit",
                  "Previous result within",
                  "Flagged, last 30 days",
                  "Status",
                  "Actions",
                ].map((x) => (
                  <th
                    key={x}
                    scope="col"
                    className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium"
                  >
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const p = r.payload as Record<string, unknown>;
                const limit = p.limit as
                  | { both?: number; rise?: number | null; fall?: number | null }
                  | null
                  | undefined;
                return (
                  <tr
                    key={r.id}
                    className="border-ink-150 text-body-s border-b align-top last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono">
                      {r.key}
                      <span className="text-muted-foreground block font-sans">
                        {KIND[r.kind]} · v{r.version}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.kind === "delta_rule"
                        ? (conceptName.get(String(p.concept)) ?? W.unknownComponent)
                        : r.kind === "panel_rule"
                          ? `${String(p.k)} of ${(p.components as string[]).length} components`
                          : String(p.name)}
                    </td>
                    <td className="px-3 py-2">
                      {r.kind === "delta_rule" ? TYPE[String(p.type)] : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.kind !== "delta_rule"
                        ? "—"
                        : !limit
                          ? "Computed"
                          : limit.both !== undefined
                            ? String(limit.both)
                            : `rise ${limit.rise ?? "—"}, fall ${limit.fall ?? "—"}`}
                    </td>
                    <td className="px-3 py-2">
                      {r.kind === "delta_rule" ? `${String(p.windowHours)} hours` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.review.rate === null
                        ? LAB5.noData
                        : `${r.flags} (${(r.review.rate * 100).toFixed(1)} %)`}
                    </td>
                    <td className="px-3 py-2">
                      {r.status === "draft" ? (
                        <StatusWord>Draft</StatusWord>
                      ) : r.review.flagsOften ? (
                        <StatusWord tone="caution">Flags often · review</StatusWord>
                      ) : (
                        <StatusWord>Signed</StatusWord>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-2">
                        {r.kind === "delta_rule" ? <TrialButton payload={p} name={r.key} /> : null}
                        {r.status === "draft" ? (
                          <SignRule configId={r.id} authoredByMe={false} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
