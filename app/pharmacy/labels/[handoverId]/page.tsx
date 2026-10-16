import type { SignedLabelSet } from "@/lib/pharmacy/print/label";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SUPPLY, WARNING_LINES } from "@/content/pharmacy-supply";
import { identitiesFor } from "@/lib/emr/read/results";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { labelFor, printFileSafe, PROPOSED_LABEL_FIELDS } from "@/lib/pharmacy/print/label";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { getLabelSource } from "@/lib/pharmacy/supply/read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { LabelActions } from "./label-actions";

export const dynamic = "force-dynamic";
// LB-4: the browser offers the title as the PDF's file name; it carries no patient detail.
export const metadata: Metadata = { title: printFileSafe("label") };

/**
 * The labels of one hand-over (5.6 section 2, LB-1 to LB-4, wireframe §14). One label per supply event
 * (one batch). Directions byte for byte (`labelFor` → `directionsAsWritten`); the pharmacist's line,
 * if any, marked "From the pharmacist"; batch and expiry; the point, the hospital and its district
 * (W2). Print CSS only, black on white. The URL carries the hand-over's id only. The print (or reprint,
 * `?reprint=1`) is logged when the supplier presses Print; a failure to log never stops the print.
 * While the label fields are unsigned, the proposed set prints outside production (Law 8).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function LabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ handoverId: string }>;
  searchParams: Promise<{ reprint?: string }>;
}) {
  const scope = await requirePharmacyScope();
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  const { handoverId } = await params;
  if (!UUID.test(handoverId)) notFound();
  const src = await getLabelSource(scope.hospitalId, handoverId);
  if (!src) notFound();
  const reprint = (await searchParams).reprint === "1";
  const who = (await identitiesFor(scope, [src.patientUserId], "pharmacy_label")).get(
    src.patientUserId,
  );
  const draft: SignedLabelSet | null =
    process.env.VERCEL_ENV === "production"
      ? null
      : {
          fields: PROPOSED_LABEL_FIELDS,
          warningLines: WARNING_LINES,
          additionalInstructions: [],
          plainWords: [],
        };
  const labels = src.supplies
    .filter((s) => !s.reversed)
    .map((s) => ({
      id: s.id,
      fields: labelFor({
        supply: {
          patientName: who?.name ?? "",
          medicine: s.product,
          quantity: s.quantity,
          issueUnit: s.unit,
          batchNumber: s.batchNumber,
          expiry: s.expiry,
          suppliedAt: src.suppliedAt,
          pharmacistLine: s.pharmacistLine,
        },
        line: { directions: s.directions, structured: null },
        point: { name: src.pointName },
        hospital: src.hospital,
        signed: draft,
        timeZone: DEFAULT_TIME_ZONE,
      }),
    }));
  const L = SUPPLY.labels;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          body * { visibility: hidden; }
          .pharmacy-labels, .pharmacy-labels * { visibility: visible; }
          .pharmacy-labels { position: absolute; inset: 0; }
          .pharmacy-label { break-inside: avoid; }
        }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-heading-m font-medium">
          {L.title} · {L.count(labels.length)}
        </h1>
        <Link
          href="/pharmacy/supplied"
          prefetch={false}
          className="text-body-s font-medium text-teal-700 underline-offset-4 hover:underline"
        >
          {L.back}
        </Link>
      </div>
      {src.labelMode === "by_hand" ? (
        <p className="text-body-s">{L.byHand}</p>
      ) : (
        <>
          <div className="print:hidden">
            <LabelActions handoverId={src.handoverId} reprint={reprint} />
          </div>
          <div className="pharmacy-labels flex flex-col gap-4">
            {labels.map((l) => (
              <article
                key={l.id}
                className="pharmacy-label flex flex-col gap-1 border border-black bg-white p-4 text-[13px] leading-snug text-black"
              >
                {l.fields.map((f, i) => (
                  <p
                    key={i}
                    className={
                      f.key === "medicine"
                        ? "font-medium"
                        : f.key === "directions" || f.key === "pharmacist_line"
                          ? "whitespace-pre-wrap"
                          : undefined
                    }
                  >
                    {f.text}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
