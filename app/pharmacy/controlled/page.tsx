import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PHARMACY } from "@/content/pharmacy";
import { CONTROLLED_UI } from "@/content/pharmacy-controlled";
import { db } from "@/db";
import { can } from "@/lib/pharmacy/access";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { CONTROLLED_COPY } from "@/lib/pharmacy/controlled";
import { getControlledRegister, rangeOf, witnessCandidates } from "@/lib/pharmacy/controlled-read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { REGISTER_COPY } from "@/lib/pharmacy/print/register";
import { deliveryFromOffered } from "@/lib/pharmacy/stock/store";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { SELECT } from "../_components/review-dialogs";
import {
  CloseDifferenceDialog,
  ConfirmBackEntryDialog,
  CountNowDialog,
  PrintEntriesButton,
  ReceiveControlledDialog,
} from "./_components/controlled-page-actions";

export const dynamic = "force-dynamic";

/**
 * The Controlled drugs page (5.9, artboard 1.5, wireframe §9.2; CD-6, DT-8). One medicine at a time at
 * the acting point: every receipt, supply, count, transfer, reversal and correction, each with in, out,
 * the balance after it (the ledger's, at every row), the batch, who and the witness. At the top the
 * open differences, closed by the pharmacy in charge with a note, and the controlled supplies entered
 * after downtime, each confirmed against the register with a witness. Count now and Receive are
 * witnessed. Print entries prints the dates shown under the register slip's heading (LB-7): a copy for
 * the register, never the register (Law 9). Behind `pharmacyDispensing`; read by `pharmacy.view`.
 */
const P = CONTROLLED_UI.page;
const at = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});

export default async function ControlledPage({
  searchParams,
}: {
  searchParams: Promise<{ medicine?: string; from?: string; to?: string }>;
}) {
  const actor = await requirePharmacyActor();
  if (!pharmacyDispensingLiveFor(actor.hospitalId)) notFound();
  const point = actor.points.find((p) => p.id === actor.pointId);
  if (!point)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <CautionNotice tone="neutral" lead={P.noPoint} />
      </div>
    );
  const sp = await searchParams;
  const medicine = sp.medicine && /^[a-z0-9_]{2,80}$/.test(sp.medicine) ? sp.medicine : null;
  const [data, witnesses, manages] = await Promise.all([
    getControlledRegister(actor.hospitalId, point.id, medicine, rangeOf(sp.from, sp.to)),
    witnessCandidates(db, actor.hospitalId, actor.userId),
    managesPharmacy(actor.userId, actor.hospitalId),
  ]);
  const acts = can(actor.access, "pharmacy.controlled");
  const chosen = data.medicines.find((m) => m.id === data.medicineId) ?? null;
  const unit = data.products[0]?.issueUnit ?? "";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .controlled-print, .controlled-print * { visibility: visible; }
          .controlled-print { position: absolute; inset: 0; }
        }
      `}</style>
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={`${P.title} · ${point.name}`}
        right={
          chosen && acts ? (
            <>
              <CountNowDialog
                medicineId={chosen.id}
                medicine={chosen.name}
                unit={unit}
                batches={data.batches}
                witnesses={witnesses}
                timeZone={DEFAULT_TIME_ZONE}
              />
              <ReceiveControlledDialog
                from={deliveryFromOffered(actor.hospitalId)}
                medicine={chosen.name}
                products={data.products.map((p) => ({ ...p, medicineName: chosen.name }))}
                witnesses={witnesses}
                timeZone={DEFAULT_TIME_ZONE}
              />
            </>
          ) : null
        }
      />
      <CautionNotice lead={CONTROLLED_COPY.notice} />
      {acts ? null : <p className="text-body-s text-muted-foreground">{P.readOnly}</p>}

      {data.differences.length ? (
        <section aria-labelledby="cd-differences" className="flex flex-col gap-2">
          <h2 id="cd-differences" className="text-heading-s font-medium">
            {P.differences}
          </h2>
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {data.differences.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="text-body-s flex flex-wrap items-center gap-2">
                  <span className="font-mono tabular-nums">{at.format(new Date(d.at))}</span>
                  <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                    {P.difference(d.batchNumber, d.counted, d.recorded)}
                  </StatusWord>
                  <span>{P.people(d.supplier, d.witness)}</span>
                </span>
                {manages ? <CloseDifferenceDialog differenceId={d.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.backEntered.length ? (
        <section aria-labelledby="cd-back" className="flex flex-col gap-2">
          <h2 id="cd-back" className="text-heading-s font-medium">
            {P.backEntered}: {data.backEntered.length}
          </h2>
          <ul className="border-border bg-card divide-border divide-y rounded-lg border">
            {data.backEntered.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="text-body-s flex flex-wrap items-center gap-2">
                  <span className="font-mono tabular-nums">{at.format(new Date(b.at))}</span>
                  <span className="font-medium">{b.medicine}</span>
                  <span>{b.by}</span>
                  {b.witnessAsWritten ? (
                    <span>{P.witnessAsWritten(b.witnessAsWritten)}</span>
                  ) : null}
                </span>
                {acts ? (
                  <ConfirmBackEntryDialog
                    entryId={b.id}
                    witnesses={witnesses}
                    timeZone={DEFAULT_TIME_ZONE}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="cd-medicine">{P.medicine}</Label>
          <select
            id="cd-medicine"
            name="medicine"
            defaultValue={data.medicineId ?? ""}
            className={SELECT}
          >
            <option value="" disabled>
              {P.choose}
            </option>
            {data.medicines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cd-from">{P.from}</Label>
          <Input
            id="cd-from"
            name="from"
            type="date"
            defaultValue={data.from}
            className="min-h-11"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cd-to">{P.to}</Label>
          <Input id="cd-to" name="to" type="date" defaultValue={data.to} className="min-h-11" />
        </div>
        <Button type="submit" variant="secondary" className="min-h-11">
          {P.show}
        </Button>
        {chosen && acts ? <PrintEntriesButton /> : null}
      </form>

      {!chosen ? (
        <p className="text-body-s text-muted-foreground">{P.noMedicine}</p>
      ) : (
        <section aria-labelledby="cd-rows" className="controlled-print flex flex-col gap-2">
          <h2 className="hidden font-medium print:block">{REGISTER_COPY.heading}</h2>
          <h2 id="cd-rows" className="text-heading-s font-medium">
            {chosen.name} · {P.balance(data.balance, unit)}
          </h2>
          {data.rows.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{P.empty}</p>
          ) : (
            <div className="border-border bg-card overflow-x-auto rounded-lg border">
              <table className="text-body-s w-full">
                <caption className="sr-only">{chosen.name}</caption>
                <thead className="bg-muted text-muted-foreground text-left">
                  <tr>
                    {Object.values(P.columns).map((c) => (
                      <th key={c} scope="col" className="text-caption px-3 py-2 font-medium">
                        {c}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2">
                      <span className="sr-only">{P.slip}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {data.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-3 py-2 font-mono tabular-nums">
                        {at.format(new Date(r.at))}
                      </td>
                      <td className="px-3 py-2">{P.what[r.what]}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{r.quantityIn ?? "—"}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{r.quantityOut ?? "—"}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{r.balance}</td>
                      <td className="px-3 py-2 font-mono">{r.batchNumber || "—"}</td>
                      <td className="px-3 py-2">{r.by}</td>
                      <td className="px-3 py-2">{r.witness ?? "—"}</td>
                      <td className="px-3 py-2 print:hidden">
                        {r.supply && r.entryId ? (
                          <Link
                            href={`/pharmacy/controlled/register/${r.entryId}`}
                            prefetch={false}
                            className="font-medium text-teal-700 underline-offset-4 hover:underline"
                          >
                            {P.slip}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
