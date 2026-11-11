import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { EmptyState } from "@/components/tide/work/kit";
import { LAB } from "@/content/lab";
import { LAB5 } from "@/content/lab-phase-5";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { db } from "@/db";
import { testCatalogue } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { conceptDef } from "@/lib/facts/project/shared";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadConfigs } from "@/lib/lab/catalogue-v2";
import { patientResultsLiveFor } from "@/lib/lab/feature";
import { keyWords } from "@/lib/lab/setup-hub";
import { SetupHeader } from "../_components/setup-header";
import { SignRule } from "../delta/_components/delta-forms";
import {
  FloorAdditionsDialog,
  MinorsDialog,
  PlainWordsDialog,
  ReleaseTableDialog,
  SmsTemplateDialog,
} from "./_components/release-forms";

export const metadata: Metadata = { title: "What patients see · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const W = LABWS2_SETUP.sweep;

const KIND: Record<string, string> = {
  patient_release: "Release table",
  plain_words: "Plain words",
  minors_rule: "Minors rule",
  sms_template: "Results-ready message",
  patient_floor_additions: "Never in the app: additions",
  results_consent_notice: "Consent wording (data protection lead)",
};

/**
 * What patients see (Lab Phase 5 §5.5, artboard 5; PR-2, PR-11, PW-1..6, PS-1, PS-4). For `lab.manage`: the signed
 * release table, plain words per test and language, the minors rule, the results-ready message and additions to the
 * never-in-the-app floor. Each is drafted here, signed by another laboratory lead, and countersigned by the CSO.
 * Nothing reaches a patient until both have signed. MedSync suggests no group setting, window or wording.
 */
export default async function PatientReleaseSetupPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !patientResultsLiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const configs = (await db.transaction((tx) => loadConfigs(tx, scope.hospitalId)))
    .filter((c) => c.kind in KIND && c.status !== "superseded")
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
  // Pick by name (v2 field kit): the same test codes and result ids the drafts always posted.
  const menu = await db
    .select({
      code: testCatalogue.code,
      name: testCatalogue.display,
      components: testCatalogue.components,
    })
    .from(testCatalogue)
    .where(
      and(
        eq(testCatalogue.kind, "lab"),
        eq(testCatalogue.active, true),
        or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, scope.hospitalId)),
      ),
    )
    .orderBy(testCatalogue.display);
  const tests = [
    ...new Map(
      menu.filter((t) => /^test\.[a-z0-9_]+$/.test(t.code)).map((t) => [t.code, t]),
    ).values(),
  ];
  const testOptions = tests.map((t) => ({ value: t.code, label: t.name }));
  const inTests = new Map<string, string[]>();
  for (const t of tests)
    for (const c of t.components ?? [])
      if (/^obs\.[a-z0-9_]+$/.test(c)) inTests.set(c, [...(inTests.get(c) ?? []), t.name]);
  const componentOptions = [...inTests]
    .flatMap(([id, names]) => {
      const label = conceptDef(id)?.display;
      return label ? [{ value: id, label, detail: names.join(", ") }] : [];
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="What patients see"
      />
      <p role="note" className="border-border bg-muted text-body-s max-w-4xl rounded-md border p-3">
        {LAB5.inPerson} HIV, pregnancy, tissue and cytology results are never shown in the app,
        whatever is set here. Everything else waits for a signed release table.
      </p>
      <div className="flex flex-wrap gap-2">
        <ReleaseTableDialog />
        <PlainWordsDialog components={componentOptions} />
        <MinorsDialog />
        <SmsTemplateDialog />
        <FloorAdditionsDialog tests={testOptions} />
      </div>
      {configs.length === 0 ? (
        <EmptyState title={W.nothingYetTitle} why={W.releaseWhy} />
      ) : (
        <div
          className="border-border bg-card overflow-auto rounded-lg border"
          tabIndex={0}
          role="region"
          aria-label="What patients see"
        >
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Release settings and their status</caption>
            <thead>
              <tr className="bg-muted">
                {["Setting", "Key", "Version", "Status", "Actions"].map((x) => (
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
              {configs.map((c) => (
                <tr key={c.id} className="border-ink-150 text-body-s border-b last:border-b-0">
                  <td className="px-3 py-2">{KIND[c.kind]}</td>
                  <td className="px-3 py-2">{keyWords(c.key) ?? W.thisHospital}</td>
                  <td className="px-3 py-2 tabular-nums">v{c.version}</td>
                  <td className="px-3 py-2">
                    <StatusWord>{c.status === "draft" ? "Draft" : "Signed"}</StatusWord>
                  </td>
                  <td className="px-3 py-2">
                    {c.status === "draft" && c.kind !== "results_consent_notice" ? (
                      <SignRule configId={c.id} authoredByMe={false} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
