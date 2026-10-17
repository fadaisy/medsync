import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { LAB5 } from "@/content/lab-phase-5";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadConfigs } from "@/lib/lab/catalogue-v2";
import { patientResultsLiveFor } from "@/lib/lab/feature";
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
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
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
        <PlainWordsDialog />
        <MinorsDialog />
        <SmsTemplateDialog />
        <FloorAdditionsDialog />
      </div>
      {configs.length === 0 ? (
        <p className="border-border text-body-s text-muted-foreground rounded-lg border border-dashed p-8 text-center">
          Nothing drafted yet. Until a release table is signed, no patient sees any result in the
          app.
        </p>
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
                  <td className="px-3 py-2 font-mono">{c.key}</td>
                  <td className="px-3 py-2 font-mono">v{c.version}</td>
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
