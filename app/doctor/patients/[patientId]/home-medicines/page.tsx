import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { RECON_UI as U } from "@/content/pharmacy-reconciliation";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { resolveEmrAccess } from "@/lib/emr/access";
import { asClinicalReader } from "@/lib/emr/db";
import { discrepancies, rowsOf } from "@/lib/pharmacy/clinical/reconciliation";
import {
  admissionFor,
  factsFor,
  medicineName,
  reconciliationForAdmission,
  rulesFor,
} from "@/lib/pharmacy/clinical/reconciliation-read";
import { pharmacyReconciliationLiveFor } from "@/lib/pharmacy/feature";
import { DecideDialog, PrepareButton } from "./_components/home-dialogs";

export const metadata: Metadata = { title: "Medicines for home" };
export const dynamic = "force-dynamic";

/**
 * 5.7 the prescriber's side (D-PH3-16 as found): "Prepare medicines for home" opens the reconciliation for the
 * patient's admission; every row needs a decision from a prescriber, never inferred.
 * ponytail: a page off the patient's chart, not a step in the plan; move it into the plan when the desk owns discharge.
 */
export default async function HomeMedicinesPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const scope = await requireDoctorScope();
  if (!pharmacyReconciliationLiveFor(scope.hospitalId)) notFound();
  const now = new Date();
  const data = await asClinicalReader(scope, async (tx) => {
    const access = await resolveEmrAccess(tx, {
      userId: scope.userId,
      patientUserId: patientId,
      hospitalId: scope.hospitalId,
    });
    if (!access.allowed) return null;
    const adm = await admissionFor(tx, scope.hospitalId, patientId);
    const recId = adm ? await reconciliationForAdmission(tx, adm.id) : null;
    const f = recId ? await factsFor(tx, scope.hospitalId, recId, now) : null;
    return { adm, f, rules: await rulesFor(tx, scope.hospitalId) };
  });
  if (!data) notFound();
  const rows = data.f ? rowsOf(data.f.facts) : [];
  const found = data.f ? discrepancies(data.f.facts, data.rules.on) : [];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href={`/doctor/patients/${patientId}`}
        className="text-body-s text-muted-foreground w-fit"
      >
        ← Patient
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-heading-l">{U.homeTitle}</h1>
        <p className="text-body-s text-muted-foreground max-w-[70ch]">{U.homeLead}</p>
      </header>
      {!data.adm ? (
        <p className="text-body-s">{U.notAdmitted}</p>
      ) : !data.f ? (
        <PrepareButton patientUserId={patientId} />
      ) : (
        <>
          <Link
            href={`/doctor/patients/${patientId}/prescribe`}
            className={buttonVariants({ variant: "secondary", size: "md", className: "w-fit" })}
          >
            {U.prescribe}
          </Link>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const name = medicineName(r.medicineId, r.text);
              const flags = found.filter((d) => d.rowKey === r.key);
              return (
                <li key={r.key} className="border-border flex flex-col gap-1 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-m font-semibold">{name}</span>
                    <DecideDialog
                      patientUserId={patientId}
                      reconciliationId={data.f!.rec.id}
                      rowKey={r.key}
                      name={name}
                    />
                  </div>
                  <span className="text-body-s text-muted-foreground">
                    {U.cols.before}:{" "}
                    {r.before
                      ? (U.admission[r.before.admission ?? ""] ?? U.notRecorded)
                      : U.notRecorded}
                    {" · "}
                    {r.home.length ? U.onHome : U.notOnHome}
                  </span>
                  <span className="text-body-s">
                    {U.cols.decision}:{" "}
                    {r.decision ? U.decisions[r.decision.decision] : U.noDecision}
                    {r.decision?.reason ? ` (${r.decision.reason})` : ""}
                  </span>
                  {flags.map((d) => (
                    <span key={d.id} className="text-body-s">
                      {d.rule}: {U.rules[d.rule]}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
