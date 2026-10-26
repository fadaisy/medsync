import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { openRenewals } from "@/lib/emr/read/renewals";
import { pharmacyRepeatsLiveFor } from "@/lib/pharmacy/feature";
import { networkPack } from "@/lib/pharmacy/network-packs";
import { RenewalsList } from "./_components/renewals-list";

export const metadata: Metadata = { title: "Renewal requests · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Pharmacy Phase 4, 5.3: renewal requests for prescribers at this hospital, oldest first. Renew opens the
 * prescribing dialog pre-loaded on the patient's visit; Book a visit and Decline answer here. A request stays listed
 * until answered (Phase 1 Law 4). Behind PHARMACY_REPEATS; off, the page is not found.
 */
export default async function RenewalsPage() {
  const scope = await requireDoctorScope();
  if (!pharmacyRepeatsLiveFor(scope.hospitalId)) notFound();
  const db = (await import("@/db")).db as unknown as Parameters<typeof networkPack>[0];
  const [rows, reasons] = await Promise.all([
    openRenewals({ userId: scope.userId, hospitalId: scope.hospitalId }),
    networkPack(db, scope.hospitalId, "renewal_decline_reasons"),
  ]);
  const now = new Date().getTime();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
          Prescribing
        </span>
        <h1 className="font-display text-display-s text-foreground">Renewal requests</h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          A refill the repeats do not cover comes here. Nothing renews by itself: Renew places a new
          prescription, Book a visit or Decline tells the patient and the pharmacy.
        </p>
      </header>
      <RenewalsList rows={rows} reasons={reasons?.content.items ?? null} now={now} />
    </div>
  );
}
