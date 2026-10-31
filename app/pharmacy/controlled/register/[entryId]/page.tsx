import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CONTROLLED_UI } from "@/content/pharmacy-controlled";
import { identitiesFor } from "@/lib/emr/read/results";
import { getRegisterEntry } from "@/lib/pharmacy/controlled-read";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { printFileSafe } from "@/lib/pharmacy/print/label";
import { registerSlipFor } from "@/lib/pharmacy/print/register";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { RegisterPrint } from "./register-print";

export const dynamic = "force-dynamic";
// LB-4: the browser offers the title as the PDF's file name; it carries no patient detail.
export const metadata: Metadata = { title: printFileSafe("register_entry") };

/**
 * The register slip of one controlled entry (LB-7, S66): the entry's facts to copy into, or attach
 * beside, the hospital's controlled drugs register, under the heading "Copy for the controlled drugs
 * register. This is not the register." Print CSS only, black on white; the URL carries the entry's id
 * only; Print logs the print (`printRegisterEntry`). Law 9: it is never called the register.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function RegisterSlipPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const scope = await requirePharmacyScope();
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  const { entryId } = await params;
  if (!UUID.test(entryId)) notFound();
  const e = await getRegisterEntry(scope.hospitalId, entryId);
  if (!e) notFound();
  const who = e.patientUserId
    ? (await identitiesFor(scope, [e.patientUserId], "pharmacy_register_slip")).get(e.patientUserId)
    : undefined;
  const slip = registerSlipFor({
    hospital: e.hospital,
    point: e.point,
    recordedAt: e.recordedAt,
    patient: { name: who?.name ?? "", medsyncNumber: who?.mrn ?? "" },
    medicine: e.medicine,
    quantity: e.quantity,
    issueUnit: e.issueUnit,
    batchNumber: e.batchNumber,
    expiry: e.expiry,
    balanceAfter: e.balanceAfter,
    prescriber: e.prescriber,
    suppliedBy: e.suppliedBy,
    witness: e.witness,
    collectedBy: e.collectedBy,
    timeZone: DEFAULT_TIME_ZONE,
  });
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body * { visibility: hidden; }
          .register-slip, .register-slip * { visibility: visible; }
          .register-slip { position: absolute; inset: 0; }
        }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <RegisterPrint entryId={e.entryId} label={CONTROLLED_UI.slipPage.print} />
        <Link
          href="/pharmacy/controlled"
          prefetch={false}
          className="text-body-s font-medium text-teal-700 underline-offset-4 hover:underline"
        >
          {CONTROLLED_UI.slipPage.back}
        </Link>
      </div>
      <article className="register-slip flex flex-col gap-2 border border-black bg-white p-5 text-[13px] leading-snug text-black">
        <h2 className="text-[15px] font-medium">{slip.heading}</h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          {slip.rows.map((r) => (
            <div key={r.label} className="contents">
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      </article>
    </div>
  );
}
