import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { DOWNTIME_PAGE as D } from "@/content/pharmacy-golive";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacySheetLabel, staleUnusedSheets } from "@/lib/pharmacy/downtime";
import { loadDowntimePage, managesPharmacy, STATE_WORDS } from "@/lib/pharmacy/downtime-store";
import { pharmacyDowntimeLiveFor } from "@/lib/pharmacy/feature";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import {
  PrintSheetsDialog,
  RecordDowntimeDialog,
  RecordDrillDialog,
  VoidSheetDialog,
} from "./_components/downtime-dialogs";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});
const dayOf = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});
const TH = "px-3 py-2 text-left font-medium";
const TD = "px-3 py-2 align-top";

/**
 * Downtime entry (5.12, artboard 1.9, wireframe §12.2), the set-up half: the sheets at the acting
 * point and their states, the count still to enter, Print blank sheets, Record a downtime and Void a
 * sheet number (the in-charge), Record a drill, and H6's list of sheets nobody has named. Entering
 * the rows of a sheet comes with the hand-over (DT-3). Behind `pharmacyDowntime`; no patient here.
 */
export default async function DowntimePage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyDowntimeLiveFor(actor.hospitalId)) notFound();
  if (!actor.access.permissions.has("pharmacy.dispense")) notFound();
  const point = actor.points.find((p) => p.id === actor.pointId);
  if (!point)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <PageHeader place={PHARMACY.place} placeInTopBar title={D.title} />
        <CautionNotice tone="neutral" lead={D.noPoint} />
      </div>
    );
  const [data, manages] = await Promise.all([
    loadDowntimePage(actor.hospitalId, point.id),
    managesPharmacy(actor.userId, actor.hospitalId),
  ]);
  const toEnter = data.sheets.filter((s) => s.state === "to_enter");
  const unused = data.sheets
    .filter((s) => s.state === "unused")
    .sort((a, b) => a.number - b.number)
    .map((s) => ({ number: s.number, label: pharmacySheetLabel(s.number) }));
  const stale = staleUnusedSheets(data.sheets, localDate(new Date()));
  const periodOf = new Map(data.periods.map((p) => [p.id, p]));
  const note = (s: (typeof data.sheets)[number]) => {
    if (s.state === "voided") return s.voidedReason ?? "";
    if (s.state === "complete" && s.completedAt) return `Completed ${when.format(s.completedAt)}`;
    const p = s.periodId ? periodOf.get(s.periodId) : null;
    if (p) return `Downtime ${when.format(p.startsAt)} to ${when.format(p.endsAt)}`;
    return "";
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={`${D.title} · ${point.name}`}
        subline={D.toEnter(toEnter.length)}
        right={
          <>
            <PrintSheetsDialog />
            {manages ? <RecordDowntimeDialog unused={unused} /> : null}
            <RecordDrillDialog />
            {manages && unused.length ? <VoidSheetDialog unused={unused} /> : null}
          </>
        }
      />

      {toEnter.length ? <CautionNotice tone="neutral" lead={D.entryLater} /> : null}
      {manages && stale.length ? (
        <CautionNotice lead={D.staleHeading}>
          {stale.map((s) => pharmacySheetLabel(s.number)).join(", ")}. {D.stale}
        </CautionNotice>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="dt-sheets">
        <h2 id="dt-sheets" className="text-heading-s">
          {D.sheetsHeading}
        </h2>
        {data.sheets.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{D.noSheets}</p>
        ) : (
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="text-body-s w-full">
              <thead className="text-muted-foreground">
                <tr className="border-border border-b">
                  <th scope="col" className={TH}>
                    {D.columns.sheet}
                  </th>
                  <th scope="col" className={TH}>
                    {D.columns.state}
                  </th>
                  <th scope="col" className={TH}>
                    {D.columns.printed}
                  </th>
                  <th scope="col" className={TH}>
                    {D.columns.note}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {data.sheets.map((s) => (
                  <tr key={s.number}>
                    <td className={`${TD} font-mono`}>{pharmacySheetLabel(s.number)}</td>
                    <td className={TD}>
                      <StatusWord tone={s.state === "to_enter" ? "caution" : "neutral"}>
                        {STATE_WORDS[s.state]}
                      </StatusWord>
                    </td>
                    <td className={`${TD} tabular-nums`}>{when.format(s.reservedAt)}</td>
                    <td className={TD}>{note(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-2" aria-labelledby="dt-periods">
          <h2 id="dt-periods" className="text-heading-s">
            {D.periodsHeading}
          </h2>
          {data.periods.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{D.noPeriods}</p>
          ) : (
            <ul className="border-border divide-border text-body-s divide-y rounded-lg border">
              {data.periods.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                  <span className="tabular-nums">
                    {when.format(p.startsAt)} to {when.format(p.endsAt)}
                  </span>
                  <span className="text-muted-foreground">{D.reasons[p.reason] ?? p.reason}</span>
                  {p.note ? <span className="text-muted-foreground">{p.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="dt-drills">
          <h2 id="dt-drills" className="text-heading-s">
            {D.drillsHeading}
          </h2>
          {data.drills.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{D.noDrills}</p>
          ) : (
            <ul className="border-border divide-border text-body-s divide-y rounded-lg border">
              {data.drills.map((d) => (
                <li key={d.id} className="flex flex-col gap-0.5 px-3 py-2">
                  <span className="tabular-nums">{dayOf.format(new Date(d.heldOn))}</span>
                  <span>{d.whatWasDone}</span>
                  <span className="text-muted-foreground">{d.participants}</span>
                  {d.problems ? <span className="text-muted-foreground">{d.problems}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
