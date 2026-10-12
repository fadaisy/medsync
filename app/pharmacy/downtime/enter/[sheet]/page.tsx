import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { DOWNTIME_ENTRY as E } from "@/content/pharmacy-golive";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacySheetLabel } from "@/lib/pharmacy/downtime";
import { loadSheetEntry, SUPPLIER_CADRES } from "@/lib/pharmacy/downtime-entry";
import { pharmacyDowntimeLiveFor } from "@/lib/pharmacy/feature";
import { cadreNames } from "@/lib/pharmacy/read";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { RowForm } from "../../_components/row-form";

export const metadata: Metadata = { title: "Enter a downtime sheet · Pharmacy · MedSync" };
export const dynamic = "force-dynamic";

const time = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});
const TH = "px-3 py-2 text-left font-medium";
const TD = "px-3 py-2 align-top";

/**
 * Enter a sheet (5.12, wireframe §12.2): row by row, the rows already entered listed, then Sheet
 * complete. Behind `pharmacyDowntime`, for holders of `pharmacy.dispense`, at the acting point.
 */
export default async function EnterSheetPage({ params }: { params: Promise<{ sheet: string }> }) {
  const actor = await requirePharmacyActor();
  if (!pharmacyDowntimeLiveFor(actor.hospitalId)) notFound();
  if (!actor.access.permissions.has("pharmacy.dispense") || !actor.pointId) notFound();
  const number = Number((await params).sheet);
  if (!Number.isInteger(number) || number < 1) notFound();
  const sheet = await loadSheetEntry(actor.hospitalId, actor.pointId, number);
  if (!sheet) notFound();
  const [ids, names] = await Promise.all([
    identitiesFor(
      actor,
      sheet.rows.map((r) => r.patientUserId),
      "pharmacy_downtime_entry",
    ),
    cadreNames(db as unknown as EmrDb),
  ]);
  const label = pharmacySheetLabel(number);
  const nextRow = (section: "supply" | "not_supplied") =>
    Math.max(0, ...sheet.rows.filter((r) => r.section === section).map((r) => r.row ?? 0)) + 1;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={E.title(label)}
        right={
          <Link
            href="/pharmacy/downtime"
            prefetch={false}
            className="text-body-s font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            {E.back}
          </Link>
        }
      />
      {sheet.state === "to_enter" ? (
        <RowForm
          sheet={number}
          sheetLabel={label}
          nextRow={{ supply: nextRow("supply"), not_supplied: nextRow("not_supplied") }}
          products={sheet.products}
          batches={sheet.batches}
          cadres={SUPPLIER_CADRES.map((code) => ({ code, name: names.get(code) ?? code }))}
          today={localDate(new Date())}
          timeZone={DEFAULT_TIME_ZONE}
          cadreName={actor.cadreName}
        />
      ) : (
        <CautionNotice tone="neutral" lead={E.notToEnter} />
      )}

      <section className="flex flex-col gap-2" aria-labelledby="entered">
        <h2 id="entered" className="text-heading-s">
          {E.entered}
        </h2>
        {sheet.rows.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{E.noRows}</p>
        ) : (
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="text-body-s w-full">
              <thead className="text-muted-foreground">
                <tr className="border-border border-b">
                  {Object.values(E.columns).map((c) => (
                    <th key={c} scope="col" className={TH}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {sheet.rows.map((r, i) => {
                  const who = ids.get(r.patientUserId);
                  return (
                    <tr key={i}>
                      <td className={TD}>{E.sections[r.section]}</td>
                      <td className={`${TD} tabular-nums`}>{r.row ?? ""}</td>
                      <td className={TD}>{who ? E.foundAs(who.name, who.mrn) : ""}</td>
                      <td className={TD}>
                        {r.medicine}
                        {r.paper ? (
                          <span className="text-caption text-muted-foreground block">
                            {E.transcribed}
                          </span>
                        ) : null}
                      </td>
                      <td className={TD}>{r.detail}</td>
                      <td className={`${TD} tabular-nums`}>
                        {r.suppliedAt ? time.format(new Date(r.suppliedAt)) : ""}
                      </td>
                      <td className={`${TD} tabular-nums`}>{time.format(new Date(r.enteredAt))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
