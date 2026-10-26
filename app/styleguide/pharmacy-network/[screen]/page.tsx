import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RenewalsList } from "@/app/doctor/renewals/_components/renewals-list";
import { PatientRefillsSection } from "@/app/patient/track/medications/_components/patient-refills";
import { RefillBoard } from "@/app/pharmacy/refills/_components/refill-board";
import {
  DEMO_DECLINE_REASONS,
  DEMO_POINTS,
  DEMO_TODAY,
  demoIdentities,
  demoPatientRefills,
  demoRefillRows,
  demoRenewals,
} from "@/lib/pharmacy/network-demo";

/**
 * Development fixture: Pharmacy Phase 4's views on the demo catalogue (lib/pharmacy/network-demo.ts), for
 * screenshots, walkthroughs and axe. No database, no patient data, no signature; every save answers "Demo: nothing is
 * saved". Off unless MEDSYNC_FIXTURES=1. The guide is docs/pharmacy/phase-4/HOW-TO-USE.md.
 */
export const metadata: Metadata = { title: "Pharmacy network fixture", robots: { index: false } };

const SCREENS = [
  "refills",
  "refills-view-only",
  "patient-repeats",
  "renewals",
  "renewals-unsigned",
] as const;

export default async function Page({ params }: { params: Promise<{ screen: string }> }) {
  if (process.env.MEDSYNC_FIXTURES !== "1") notFound();
  const { screen } = await params;
  const s = SCREENS.find((x) => x === screen);
  if (!s) notFound();
  const now = Date.parse(`${DEMO_TODAY}T12:00:00Z`);
  return (
    <div className="bg-background min-h-svh">
      <p className="border-border bg-card text-body-s text-muted-foreground mx-auto mt-4 w-fit rounded-md border px-3 py-1.5">
        Demo data, {DEMO_TODAY}. Record numbers only; nothing is real or saved.
      </p>
      {s === "refills" || s === "refills-view-only" ? (
        <RefillBoard
          place="Demo hospital"
          rows={demoRefillRows()}
          identities={demoIdentities()}
          canDispense={s === "refills"}
          pointId={DEMO_POINTS[0].id}
          demo
        />
      ) : s === "patient-repeats" ? (
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <PatientRefillsSection data={demoPatientRefills()} demo />
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
          <h1 className="font-display text-display-s text-foreground">Renewal requests</h1>
          <RenewalsList
            rows={demoRenewals()}
            reasons={s === "renewals" ? DEMO_DECLINE_REASONS : null}
            now={now}
            demo
          />
        </div>
      )}
    </div>
  );
}
