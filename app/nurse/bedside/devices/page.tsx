import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB3_BEDSIDE as B, fill, LAB3 } from "@/content/lab-phase-3";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { loadDeviceChecks } from "@/lib/lab/bedside-quality-store";
import { isOperator } from "@/lib/lab/bedside-store";
import { labPoctQualityLiveFor } from "@/lib/lab/feature";
import { requireNurseScope } from "@/lib/nurse/scope";
import { dateWords, dayWords, timeWords } from "../../../lab/_lib/days";
import { DeviceCheckForm, DeviceIncident } from "./_components/device-check";

export const metadata: Metadata = { title: "Device checks · Nurse · MedSync" };
export const dynamic = "force-dynamic";

const card = "border-border bg-card shadow-card flex flex-col gap-3 rounded-lg border p-4";

/**
 * Bedside device checks and competency (Lab Phase 3 §5.10, artboard 10; labPoctQuality), in the nurse workspace
 * under Bedside tests: each device's control check (ranges from the strip lot, read-only), its status (a failed
 * check stops it; not done today shows on the bedside form), a drop or error message, and the operator's own
 * assessment per test (lapsed amber with the words to ask the laboratory).
 */
export default async function DeviceChecksPage() {
  const scope = await requireNurseScope();
  if (!emrV1LiveFor(scope.hospitalId) || !labPoctQualityLiveFor(scope.hospitalId)) notFound();
  const tx = db as never;
  const operator = await isOperator(tx, scope.hospitalId, scope.userId);
  const devices = operator
    ? await loadDeviceChecks(tx, scope.hospitalId, scope.userId, new Date())
    : [];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${B.place}`} title={B.title} />
      <p className="text-body-s text-muted-foreground max-w-[75ch]">{B.lede}</p>
      {!operator ? (
        <CautionNotice tone="neutral" lead={B.notOperator} />
      ) : devices.length === 0 ? (
        <CautionNotice tone="neutral" lead={B.noDevice} />
      ) : (
        devices.map((d) => {
          const lapsed =
            d.competency === "lapsed" || d.competency === "revoked" || d.competency === "none";
          return (
            <section key={d.id} aria-labelledby={`dev-${d.id}`} className={card}>
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`dev-${d.id}`} className="text-heading-s font-medium">
                  {`${d.label} · ${d.test}`}
                </h2>
                {d.blocked ? (
                  <StatusWord tone="caution">{B.status.blocked}</StatusWord>
                ) : !d.rule ? (
                  <StatusWord tone="caution">{B.status.noRule}</StatusWord>
                ) : d.due.length ? (
                  <StatusWord tone="caution">{B.status.due}</StatusWord>
                ) : (
                  <StatusWord icon glyph={CheckIcon}>
                    {B.status.done}
                  </StatusWord>
                )}
              </header>
              {d.blocked ? (
                <p role="alert" className="text-body-s">
                  {fill(LAB3.deviceBlocked, {
                    Device: d.model,
                    time: d.lastFailAt
                      ? `${dateWords(d.lastFailAt)} ${timeWords(d.lastFailAt)}`
                      : "—",
                  })}
                </p>
              ) : null}
              {d.rule ? (
                d.lots.length ? (
                  <DeviceCheckForm
                    device={{
                      id: d.id,
                      label: d.label,
                      levels: d.rule.levels,
                      due: d.due,
                      controlLot: d.controlLot,
                      lots: d.lots,
                    }}
                  />
                ) : (
                  <p className="text-body-s">{B.noLot}</p>
                )
              ) : (
                <p className="text-body-s">{B.noRuleLine}</p>
              )}
              <p className="text-caption text-muted-foreground max-w-[75ch]">{B.rangesLine}</p>
              <p className="text-caption text-muted-foreground max-w-[75ch]">{B.caution}</p>
              <DeviceIncident deviceId={d.id} label={d.label} />
              <h3 className="text-body-m font-medium">{fill(B.whoMay, { test: d.test })}</h3>
              <dl className="text-body-s grid gap-1 sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted-foreground">{B.you}</dt>
                <dd>
                  {lapsed ? (
                    <StatusWord tone="caution">
                      {d.competency === "lapsed" && d.validTo
                        ? fill(LAB3.competencyLapsed, { test: d.test, date: dayWords(d.validTo) })
                        : fill(LAB3.competencyNone, { test: d.test })}
                    </StatusWord>
                  ) : (
                    <>
                      {d.assessedOn ? `${B.assessed} ${dayWords(d.assessedOn)} · ` : ""}
                      {d.validTo ? `${B.validTo} ${dayWords(d.validTo)}` : ""}
                      {d.competency === "grace" ? ` · ${B.grace}` : ""}
                    </>
                  )}
                </dd>
              </dl>
            </section>
          );
        })
      )}
    </div>
  );
}
