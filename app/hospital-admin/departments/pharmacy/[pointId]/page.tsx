import type { EmrTx } from "@/lib/emr/db";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { GOLIVE } from "@/content/pharmacy-golive";
import { db } from "@/db";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { getPharmacyReadiness } from "@/lib/pharmacy/golive/read";
import { isLive } from "@/lib/pharmacy/write";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import {
  BriefingDialog,
  LegalAnswerDialog,
  PilotNoteDialog,
  PointSettingsForm,
  SwitchControls,
} from "../_components/golive-controls";

export const metadata: Metadata = { title: "Going live · Pharmacy · MedSync" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});
const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});
/** The engine names signed sets by their codes (lane_rule); the page says them in words. */
const words = (e: string) => e.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (k) => k.replaceAll("_", " "));

/**
 * Going live at a dispensing point (Pharmacy Phase 1, 5.13; wireframe §13; RD-1 to
 * RD-5): six conditions, each with its state, its evidence and its action; for a second or later
 * point, the first point's pilot note as a separate requirement (RD-5); the point's phone and label mode; Switch on and Switch off,
 * each needing a second hospital admin. Behind `pharmacyDispensing`. No PHI on the page.
 */
export default async function GoLivePage({ params }: { params: Promise<{ pointId: string }> }) {
  const scope = await requireHospitalAdminScope();
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  const { pointId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(pointId)) notFound();
  const r = await db.transaction((tx) =>
    getPharmacyReadiness(tx as unknown as EmrTx, scope.hospitalId, pointId),
  );
  if (!r) notFound();
  const { point, readiness, request } = r;
  const live = isLive(point);
  const stateLine = point.switchedOffAt
    ? GOLIVE.state.off(day.format(point.switchedOffAt))
    : point.liveAt
      ? GOLIVE.state.live(day.format(point.liveAt))
      : GOLIVE.state.notLive;
  const pilot = readiness.pilotNote ? { ...readiness.pilotNote, title: GOLIVE.pilotTitle } : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/hospital-admin/departments/pharmacy"
          className="text-body-s text-teal-700 underline-offset-4 hover:underline"
        >
          {GOLIVE.back}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-heading-m">{GOLIVE.title(point.name)}</h1>
          <StatusWord>{stateLine}</StatusWord>
        </div>
        <p className="text-body-s text-muted-foreground max-w-[70ch]">{GOLIVE.lead}</p>
      </header>

      <PointSettingsForm
        pointId={point.id}
        initial={{
          phone: point.phone,
          labelMode: point.labelMode,
          countFreshnessDays: point.countFreshnessDays,
        }}
      />

      <ol className="flex flex-col gap-3">
        {readiness.conditions.map((c) => (
          <li key={c.id}>
            <Condition
              c={c}
              number={c.id}
              help={c.met ? undefined : GOLIVE.conditionHelp[c.id as 1]}
            >
              {c.id === 2 ? <LegalAnswerDialog /> : null}
              {c.id === 5 ? <BriefingDialog pointId={point.id} /> : null}
              {c.id === 6 && !c.met ? (
                <Link
                  href="/hospital-admin/departments"
                  className="text-body-s inline-flex min-h-11 items-center text-teal-700 underline-offset-4 hover:underline"
                >
                  {GOLIVE.openPanel}
                </Link>
              ) : null}
            </Condition>
          </li>
        ))}
      </ol>

      {pilot ? (
        <section aria-labelledby="later-point" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="later-point" className="text-heading-s font-medium">
              {GOLIVE.laterPoint.heading}
            </h2>
            <p className="text-body-s text-muted-foreground max-w-[70ch]">
              {GOLIVE.laterPoint.lead}
            </p>
          </div>
          <Condition c={pilot}>
            {!pilot.met && r.firstLivePointId ? (
              <PilotNoteDialog pointId={r.firstLivePointId} />
            ) : null}
          </Condition>
        </section>
      ) : null}

      <SwitchControls
        pointId={point.id}
        live={live}
        ready={readiness.ready}
        request={
          request
            ? {
                id: request.id,
                action: request.action,
                at: when.format(request.requestedAt),
                mine: request.requestedBy === scope.userId,
              }
            : null
        }
      />
    </div>
  );
}

/** One requirement: its title and state in words, its evidence, its action and its controls. */
function Condition({
  c,
  number,
  help,
  children,
}: {
  c: { title: string; met: boolean; evidence: string[]; action: string | null };
  number?: number;
  help?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-body-s flex flex-wrap items-center gap-2">
        {number ? <span className="text-muted-foreground font-mono">{number}.</span> : null}
        <span className="font-medium">{c.title}</span>
        {c.met ? (
          <StatusWord>{GOLIVE.met}</StatusWord>
        ) : (
          <StatusWord tone="caution">{GOLIVE.notYet}</StatusWord>
        )}
      </p>
      {c.evidence.length ? (
        <ul className="text-body-s text-muted-foreground flex flex-col gap-0.5 pl-6">
          {c.evidence.map((e) => (
            <li key={e}>{words(e)}</li>
          ))}
        </ul>
      ) : null}
      {c.action ? <p className="text-body-s pl-6">{c.action}</p> : null}
      {help ? <p className="text-body-s text-muted-foreground pl-6">{help}</p> : null}
      {children ? <div className="flex flex-wrap gap-2 pl-6">{children}</div> : null}
    </div>
  );
}
