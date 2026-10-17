import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { DEMO_PATIENTS, demoLoads, isDemoHospital } from "@/lib/lab/demo";
import { LoadDemoDay } from "./load-button";

export const metadata: Metadata = { title: "Demo lab day · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

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
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Demo lab day"
      />
      <section className="border-border bg-card text-body-s flex flex-col gap-3 rounded-lg border p-4">
        <p>
          This is a demo hospital. A demo lab day adds {DEMO_PATIENTS} patients named &ldquo;Demo
          patient 01&rdquo; to &ldquo;Demo patient {String(DEMO_PATIENTS).padStart(2, "0")}&rdquo;,
          with tests waiting to be collected, received, resulted and released, and two released.
        </p>
        <p className="text-muted-foreground">
          Results sit in the middle of this hospital&apos;s own signed ranges. A test without a
          signed range is received and left for a person. Demo patients cannot sign in. Demo records
          stay in this hospital and never reach a real one.
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
                <span className="font-mono">{when.format(new Date(l.startedAt))}</span> ·{" "}
                {l.error
                  ? `Stopped: ${l.error}`
                  : `${l.counts.patients ?? 0} patients, ${l.counts.orders ?? 0} tests, ${l.counts.released ?? 0} released`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
