import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LAB } from "@/content/lab";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { demoLoads, isDemoHospital } from "@/lib/lab/demo";
import { SetupHeader } from "../_components/setup-header";
import { LoadDemoDay } from "./load-button";

export const metadata: Metadata = { title: "Demo lab day · Laboratory · MedSync" };
export const dynamic = "force-dynamic";
// One load writes a whole demo lab through the real stores (about 30 accounts and several hundred rows).
export const maxDuration = 60;

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

/**
 * Demo lab day (Lab Phase 5, owner request; A19). Only in a hospital marked as a demo hospital, for `lab.manage`.
 * Each load adds patients labelled "Demo patient NN" with orders at every stage of the worklist. Results are the
 * middle of this hospital's own signed ranges; nothing clinical is invented. Demo records stay (lab records are
 * append-only); the demo hospital is the sandbox.
 */
export default async function DemoPage() {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !emrV1LiveFor(scope.hospitalId)) notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  if (!(await isDemoHospital(db as never, scope.hospitalId))) notFound();
  const loads = await demoLoads(db as never, scope.hospitalId);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Demo lab day"
      />
      <section className="border-border bg-card text-body-s flex flex-col gap-3 rounded-lg border p-4">
        <p>
          This is a demo hospital. Loading a demo lab fills every lab page: about twenty patients
          named &ldquo;Demo patient NN&rdquo; at every stage of the worklist, released and reviewed
          results, rejected specimens, two critical alerts (one acknowledged by phone), a delta
          check waiting for a decision, infection prevention alerts, a referral on a sealed
          manifest, QC runs with a warning and a rejected run, stock and lots, equipment (one item
          down), an EQA round, a bedside meter with its daily check, a downtime period, and results
          patients can see.
        </p>
        <p className="text-muted-foreground">
          Units, decimals and LOINC codes come from the catalogue research, and reference ranges
          from its published Ugandan studies, with their citations. Values without a published
          source (response times, QC targets, delta limits, control ranges) are derived from those
          ranges and labelled Demo. Settings are signed by demo staff (&ldquo;Demo lab lead&rdquo;,
          &ldquo;Demo CSO&rdquo; and others) in this hospital only. Nobody can sign in as a demo
          patient or demo staff member, and demo records never reach a real hospital.
        </p>
        <LoadDemoDay />
      </section>
      <section className="border-border bg-card text-body-s flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="text-heading-s">Loads</h2>
        {loads.length === 0 ? (
          <p className="text-muted-foreground">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {loads.map((l) => (
              <li key={l.id}>
                <span>{when.format(new Date(l.startedAt))}</span> ·{" "}
                {`${l.counts.patients ?? 0} patients, ${l.counts.orders ?? 0} tests, ${l.counts.released ?? 0} released, ${l.counts["signed settings"] ?? 0} settings signed`}
                {l.error ? (
                  <span className="text-muted-foreground"> · Stopped: {l.error}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
