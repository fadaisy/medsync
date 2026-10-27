import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { isDemoHospital, pharmacyDemoLoads } from "@/lib/pharmacy/demo";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { LoadPharmacyDemo } from "./load-button";

export const metadata: Metadata = { title: "Pharmacy demo · MedSync" };
export const dynamic = "force-dynamic";
// One load writes a national referral hospital's pharmacy through the real stores (about 100 accounts, thousands of rows).
export const maxDuration = 300;

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});

/**
 * Pharmacy demo (owner request, 26 Oct 2026; ADR 0450). Only in a hospital marked as a demo hospital, for its admin.
 * One load fills every pharmacy page with a national referral hospital's day and its past month.
 */
export default async function PharmacyDemoPage() {
  const scope = await requireHospitalAdminScope();
  const database = db as unknown as EmrDb;
  if (!pharmacyDispensingLiveFor(scope.hospitalId)) notFound();
  if (!(await isDemoHospital(database, scope.hospitalId))) notFound();
  const loads = await pharmacyDemoLoads(database, scope.hospitalId);
  const loaded = loads.some((l) => l.finishedAt && !l.notes?.setup);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/hospital-admin/departments/pharmacy"
          className="text-body-s text-teal-700 underline-offset-4 hover:underline"
        >
          Back to pharmacy settings
        </Link>
        <h1 className="text-heading-m">Pharmacy demo</h1>
      </header>
      <section className="border-border bg-card text-body-s flex flex-col gap-3 rounded-lg border p-4">
        <p>
          This is a demo hospital. Loading the demo fills every pharmacy page as a national referral hospital: eight
          dispensing points, about sixty patients named &ldquo;Demo patient NN&rdquo; with prescriptions at every
          stage, queries and interventions, the controlled register, downtime forms, emergency doses, stores and
          deliveries, ward stock and carts, expiry and a recall, a closed month, clinical pharmacy, refills and
          renewals, and the going-live records.
        </p>
        <p className="text-muted-foreground">
          Every dose reads &ldquo;[demo dose]&rdquo;. Packs and content are signed by demo staff (&ldquo;Demo chief
          pharmacist&rdquo;, &ldquo;Demo clinical safety officer&rdquo;) in this hospital only. Legal answers are never
          filled in. Nobody can sign in as demo staff or a demo patient, and demo records never reach a real hospital.
          The demo loads once per hospital, and nothing is removed.
        </p>
        {loaded ? (
          <p>The demo is loaded. Open the pharmacy workspace to walk through it.</p>
        ) : (
          <LoadPharmacyDemo />
        )}
      </section>
      <section className="border-border bg-card text-body-s flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="text-heading-s">Loads</h2>
        {loads.length === 0 ? (
          <p className="text-muted-foreground">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {loads.map((l) => {
              const stopped = Object.entries(l.notes ?? {});
              return (
                <li key={l.id}>
                  <span>{when.format(new Date(l.startedAt))}</span> ·{" "}
                  {l.finishedAt
                    ? `${l.counts.patients ?? 0} patients, ${l.counts.products ?? 0} products, ${l.counts.signed_sets ?? 0} packs signed`
                    : "Still loading, or stopped before it finished"}
                  {stopped.map(([k, v]) => (
                    <span key={k} className="text-muted-foreground block">
                      Stopped at {k}: {v}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
