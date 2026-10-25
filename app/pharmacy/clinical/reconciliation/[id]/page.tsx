import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { RECON_UI as U } from "@/content/pharmacy-reconciliation";
import { asClinicalReader } from "@/lib/emr/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { RULES } from "@/lib/pharmacy/clinical/content";
import {
  blockers,
  changedSince,
  CHECKED,
  discrepancies,
  rowsOf,
  sheetOf,
} from "@/lib/pharmacy/clinical/reconciliation";
import { factsFor, medicineName, rulesFor } from "@/lib/pharmacy/clinical/reconciliation-read";
import { pharmacyReconciliationLiveFor } from "@/lib/pharmacy/feature";
import { ReconciliationActions } from "./_components/reconciliation-actions";

export const metadata: Metadata = { title: "Reconciliation · Pharmacy" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Kampala",
});

/**
 * 5.7 one reconciliation: the table (before admission, on the ward, for home), the discrepancies the signed rules
 * find, and Confirm the list (MR-4). The patient's sheet prints from the page (MR-7); the screen parts hide in print.
 */
export default async function ReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePharmacyActor();
  if (!pharmacyReconciliationLiveFor(actor.hospitalId)) notFound();
  const { id } = await params;
  const now = new Date();
  const [f, rules] = await asClinicalReader(actor, (tx) =>
    Promise.all([factsFor(tx, actor.hospitalId, id, now), rulesFor(tx, actor.hospitalId)]),
  );
  if (!f) notFound();
  const who = (await identitiesFor(actor, [f.rec.patientUserId], "pharmacy_reconciliation")).get(
    f.rec.patientUserId,
  );
  const label = (r: { medicineId: string | null; text: string | null }) =>
    medicineName(r.medicineId, r.text);
  const rows = rowsOf(f.facts);
  const found = discrepancies(f.facts, rules.on);
  const why = blockers(f.facts, rules.on, label);
  const explanation = (id: string) =>
    f.events.find((e) => e.kind === "explained" && e.discrepancy === id);
  const notChecked = RULES.filter((r) => rules.on.includes(r) && !CHECKED.includes(r));
  const sheet = sheetOf(rows, label);
  const reopened = changedSince(f.facts);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          place={PHARMACY.place}
          placeInTopBar
          title={`${U.title}: ${who?.name ?? "Name withheld"}`}
          subline={<span className="text-body-s text-muted-foreground">{U.states[f.state]}</span>}
        />
        {rules.signed ? null : <p className="text-body-s">{U.noRules}</p>}
        {notChecked.length ? (
          <p className="text-body-s">{U.notChecked(notChecked.join(", "))}</p>
        ) : null}
        {f.state === "reopened" ? (
          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
            {U.reopened}
          </StatusWord>
        ) : null}
        <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
          <table className="text-body-s w-full">
            <thead className="text-muted-foreground text-left">
              <tr>
                {[U.cols.medicine, U.cols.before, U.cols.ward, U.cols.home, U.cols.decision].map(
                  (h) => (
                    <th key={h} className="p-2 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-border border-t align-top">
                  <td className="p-2">
                    {label(r)}
                    {r.medicineId ? "" : ` (${U.uncoded})`}
                  </td>
                  <td className="p-2">
                    {r.before
                      ? `${U.admission[r.before.admission ?? ""] ?? U.notRecorded}${r.before.informant ? `, ${U.from(r.before.informant)}` : ""}`
                      : U.notRecorded}
                  </td>
                  <td className="p-2">
                    {r.ward
                      ? r.ward.lastDose
                        ? U.lastDose(day.format(r.ward.lastDose))
                        : r.ward.state
                      : U.notOnWard}
                  </td>
                  <td className="p-2">{r.home.length ? U.onHome : U.notOnHome}</td>
                  <td className="p-2">
                    {r.decision ? U.decisions[r.decision.decision] : U.noDecision}
                    {r.decision?.reason ? ` (${r.decision.reason})` : ""}
                    {reopened.includes(r.key) ? ` · ${U.states.reopened}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="text-heading-s">{U.discrepancies}</h2>
          {found.length ? (
            <ul className="flex flex-col gap-2">
              {found.map((d) => {
                const row = rows.find((r) => r.key === d.rowKey);
                const e = explanation(d.id);
                return (
                  <li key={d.id} className="text-body-s flex flex-wrap items-center gap-2">
                    <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                      {d.rule}
                    </StatusWord>
                    <span>
                      {row ? `${label(row)}: ` : ""}
                      {U.rules[d.rule]}
                    </span>
                    {e?.reason ? (
                      <span className="text-muted-foreground">{U.explained(e.reason)}</span>
                    ) : null}
                    {!e && f.state !== "closed" ? (
                      <ReconciliationActions.Explain
                        reconciliationId={f.rec.id}
                        discrepancy={d.id}
                        reasons={rules.explainReasons}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body-s text-muted-foreground">{U.noDiscrepancy}</p>
          )}
          {f.events
            .filter((e) => e.kind === "added")
            .map((e) => (
              <p key={e.id} className="text-body-s">
                {U.addKinds[e.reason as keyof typeof U.addKinds] ?? e.reason}: {e.note}
              </p>
            ))}
        </section>
        {f.state === "closed" ? null : (
          <ReconciliationActions.Bar
            reconciliationId={f.rec.id}
            blockers={why}
            confirmed={f.state === "confirmed"}
          />
        )}
      </div>
      {/* MR-7: the patient's sheet, black on white; prints from the confirmed list only. */}
      {f.state === "confirmed" ? (
        <section className="hidden flex-col gap-3 text-black print:flex">
          <h1 className="text-heading-l">{U.sheetTitle}</h1>
          <p>{who?.name ?? ""}</p>
          <p>{U.sheetIntro}</p>
          <ul className="flex flex-col gap-2">
            {sheet.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong>: {U.sheetDoing[s.doing]}
              </li>
            ))}
          </ul>
          <p>{U.sheetFoot}</p>
          <p>{U.sheetNoList}</p>
        </section>
      ) : null}
    </div>
  );
}
