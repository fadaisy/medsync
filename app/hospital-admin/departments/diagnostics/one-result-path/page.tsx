import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { liveCutover, readinessFor } from "@/lib/lab/cutover-store";
import { BriefingForm, SwitchControls } from "./switch-controls";

export const metadata: Metadata = { title: "One result path · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const TITLES = {
  legacy_clear: "The old list is clear",
  setup_complete: "Set-up is complete",
  drill_recorded: "A downtime drill is recorded",
  briefing_recorded: "The lab and the wards are briefed",
} as const;

const EVIDENCE: Record<string, (v: string) => string> = {
  open_legacy: (n) => `${n} open ${n === "1" ? "item" : "items"} on the old list`,
  no_unit: (t) => `${t} has no unit in the test catalogue`,
  notice_unsigned: () => "The critical-flagging notice is not signed",
  alert_wording_unsigned: () => "The alert wording is not signed by the CSO",
  response_times_unsigned: () => "No response times are signed",
  no_level1: (d) => `Nobody receives escalations for ${d}`,
  drills: (n) => (n === "0" ? "No drill recorded" : `${n} recorded`),
  briefings: (n) => (n === "0" ? "No briefing recorded" : `${n} recorded`),
};
const words = (e: string) => {
  const [k, ...rest] = e.split(":");
  return EVIDENCE[k!]?.(rest.join(":")) ?? e;
};

/**
 * One result path (Lab Phase 1 §5.9, artboard 14; CO-1 to CO-4): four conditions, each with its state
 * and what to do; the switch opens only when all four are met and needs a second admin. After it the
 * old list is read-only for this hospital.
 */
export default async function OneResultPathPage() {
  const scope = await requireHospitalAdminScope();
  if (!emrV1LiveFor(scope.hospitalId)) notFound();
  const now = new Date();
  const [readiness, live] = await db.transaction(async (tx) => [
    await readinessFor(tx as never, scope.hospitalId, now),
    await liveCutover(tx as never, scope.hospitalId),
  ]);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Kampala",
  });
  const state = live?.switchedAt
    ? "switched"
    : live
      ? "requested"
      : readiness.ready
        ? "ready"
        : "not_ready";
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/hospital-admin/departments/diagnostics"
          className="text-body-s text-teal-700 underline-offset-4 hover:underline"
        >
          Back to diagnostics
        </Link>
        <h1 className="text-heading-m">One result path for the laboratory</h1>
        <p className="text-body-s text-muted-foreground max-w-[70ch]">
          Today results can arrive by two paths. Switching closes the old one for this hospital:
          every result is then entered on the worklist, with its units, ranges and critical alerts,
          and the old list stays readable as Older results.
        </p>
      </header>
      {state === "switched" ? (
        <p className="text-body-s flex flex-wrap items-center gap-2">
          <StatusWord>Switched</StatusWord> One result path since {date.format(live!.switchedAt!)}.
          A superadmin can reverse it with a second superadmin and a reason.
        </p>
      ) : null}
      <ol className="flex flex-col gap-3">
        {readiness.conditions.map((c, i) => (
          <li key={c.key} className="border-border flex flex-col gap-2 rounded-lg border p-4">
            <p className="text-body-s flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground font-mono">{i + 1}.</span>
              <span className="font-medium">{TITLES[c.key]}</span>
              {c.met ? (
                <StatusWord>Met</StatusWord>
              ) : (
                <StatusWord tone="caution">Not yet</StatusWord>
              )}
            </p>
            {c.evidence.length ? (
              <ul className="text-body-s text-muted-foreground flex flex-col gap-0.5 pl-6">
                {c.evidence.map((e) => (
                  <li key={e}>{words(e)}</li>
                ))}
              </ul>
            ) : null}
            {c.key === "setup_complete" && !c.met ? (
              <p className="text-body-s pl-6">
                The laboratory lead completes set-up in the lab&apos;s Set-up pages; the CSO signs
                the wording.
              </p>
            ) : null}
            {c.key === "drill_recorded" && !c.met ? (
              <p className="text-body-s pl-6">The lab records a drill in Downtime entry.</p>
            ) : null}
            {c.key === "briefing_recorded" && state !== "switched" ? <BriefingForm /> : null}
          </li>
        ))}
      </ol>
      <SwitchControls
        state={state}
        cutoverId={live?.id ?? null}
        mine={live?.requestedBy === scope.userId}
      />
    </div>
  );
}
