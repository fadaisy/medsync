import { notFound } from "next/navigation";

import { CautionNotice } from "@/components/medsync/caution-notice";
import { REVIEW } from "@/content/pharmacy-review";
import { identitiesFor } from "@/lib/emr/read/results";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { getSlip } from "@/lib/pharmacy/review/read";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * The slip to fill elsewhere (5.5, artboard 1.8; wireframe §5.2; LB-5, LB-6, W1, W2, D-PH1-13,
 * D-PH1-37). A5, print CSS only, black on white, nothing that needs colour to read. Rendered from
 * `slipFor`: only lines bought outside, never a controlled line, never without the point's phone. The
 * URL carries the slip's id only (LB-4). The print was logged when the slip was issued.
 */
const S = REVIEW.slip;

export default async function SlipPage({ params }: { params: Promise<{ id: string }> }) {
  const scope = await requirePharmacyScope();
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const found = await getSlip(scope.hospitalId, id, async (patientUserId) => {
    const who = (await identitiesFor(scope, [patientUserId], "pharmacy_slip")).get(patientUserId);
    return {
      name: who?.name ?? "",
      medsyncNumber: who?.mrn ?? "",
      sexAndAge: who?.ageSex ?? "",
    };
  });
  if (!found) notFound();
  const r = found.result;
  if (!r.ok)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <CautionNotice
          lead={
            r.reason === "no_point_phone"
              ? S.noPhone("This dispensing point")
              : r.reason === "controlled_line"
                ? S.controlled
                : S.noLines
          }
        />
      </div>
    );
  const slip = r.slip;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <style>{`
        @page { size: A5; margin: 10mm; }
        @media print {
          body * { visibility: hidden; }
          .pharmacy-slip, .pharmacy-slip * { visibility: visible; }
          .pharmacy-slip { position: absolute; inset: 0; border: 0; }
        }
      `}</style>
      <div className="flex justify-end print:hidden">
        <PrintButton label={S.print} />
      </div>
      <article className="pharmacy-slip flex flex-col gap-3 border border-black bg-white p-6 text-[13px] leading-snug text-black">
        <header className="flex flex-col gap-1 border-b border-black pb-2">
          <p>
            {slip.hospital} · {slip.point}
          </p>
          <h2 className="text-[16px] font-medium">{slip.title}</h2>
          <p>
            {slip.prescriptionNumber ? `${S.prescription} ${slip.prescriptionNumber} · ` : ""}
            {slip.date}
          </p>
          <p>
            {S.patient}: {slip.patient.name} · {slip.patient.medsyncNumber} ·{" "}
            {slip.patient.sexAndAge}
          </p>
        </header>
        <section className="flex flex-col gap-2 border-b border-black pb-2">
          {slip.lines.map((l, i) => (
            <div key={i} className="flex flex-col">
              <p className="font-medium">{l.medicine}</p>
              <p className="whitespace-pre-wrap">{l.directions}</p>
              <p>{l.quantity}</p>
            </div>
          ))}
          <p>{slip.genericNames}</p>
        </section>
        <p className="border-b border-black pb-2">
          {S.prescriber}:{" "}
          {[slip.prescriber.name, slip.prescriber.cadre, slip.prescriber.councilNumber]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <section className="flex flex-col gap-2 border-b border-black pb-2">
          <p className="font-medium">{S.box}</p>
          <p>{S.nameStamp} ________________________________</p>
          <p>
            {S.supplied} __________ {S.date} __________
          </p>
        </section>
        {slip.changed ? <p>{slip.changed}</p> : null}
        <p>{slip.body}</p>
        <p>{slip.verification}</p>
        <p>{slip.footer}</p>
      </article>
    </div>
  );
}
