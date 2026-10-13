import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB2 } from "@/content/lab-phase-2";
import { labPaymentLiveFor } from "@/lib/lab/feature";
import { fetchHospitalStaffNames, fetchLabAwaitingPayment } from "@/lib/reception/queries";
import { requireReceptionScope } from "@/lib/reception/scope";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { RecordPayment } from "./_components/record-payment";

export const metadata: Metadata = { title: "Lab payments · Reception · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The cashier (Lab Phase 2 §5.3, artboard 3): lab orders awaiting payment, and how each was settled.
 * No prices (PY-6), no results, no clinical question, no diagnosis. Emergencies never appear and
 * restricted tests are counted, never named: both enforced in SQL (lab_awaiting_payment, PY-5).
 */
export default async function LabPaymentsPage() {
  const scope = await requireReceptionScope();
  if (!labPaymentLiveFor(scope.hospitalId)) notFound();
  const [rows, staff] = await Promise.all([
    fetchLabAwaitingPayment({ hospitalId: scope.hospitalId, receptionUserId: scope.userId }),
    fetchHospitalStaffNames(scope.hospitalId),
  ]);
  const at = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_TIME_ZONE,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · Front desk`}
        placeInTopBar
        title="Lab payments"
        subline={`${rows.length} awaiting payment`}
      />
      {rows.length === 0 ? (
        <p className="text-body-s text-muted-foreground border-border bg-card rounded-lg border px-4 py-8 text-center">
          No lab orders are awaiting payment.
        </p>
      ) : (
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {rows.map((r) => {
            const tests =
              r.restrictedCount > 0
                ? LAB2.payment.cashierRestricted(r.tests.join(", "), r.restrictedCount)
                : r.tests.join(", ");
            const name = r.patientName ?? "Name withheld";
            return (
              <li
                key={r.encounterId}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-body-s">
                    <span className="text-foreground font-medium">{name}</span>{" "}
                    <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                      {r.patientCode ?? ""}
                    </span>
                  </p>
                  <p className="text-body-s text-foreground">{tests}</p>
                  <p className="text-caption text-muted-foreground">
                    Ordered{" "}
                    <span className="font-mono tabular-nums">
                      {at.format(new Date(r.orderedAtIso))}
                    </span>
                  </p>
                </div>
                <RecordPayment
                  orderIds={r.orderIds}
                  patient={`${name}${r.patientCode ? `, ${r.patientCode}` : ""}`}
                  tests={tests}
                  staff={staff}
                />
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-body-s text-muted-foreground">{LAB2.payment.cashierFooter}</p>
    </div>
  );
}
