import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { getAuthState } from "@/lib/auth";
import { loadCatalogueConsole } from "@/lib/pharmacy/national-catalogue";
import { loadCatalogueQueue } from "@/lib/pharmacy/shared-catalogue/queue";
import { CatalogueConsole } from "./_components/catalogue-console";
import { CatalogueQueue } from "./_components/catalogue-queue";

export const metadata: Metadata = { title: "National medicines list · Admin · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The national list console (ADR 0282). The owner loads an edition with
 * scripts/pharmacy/load-national-list.ts; here the CSO links its medicine rows to the prescribing list,
 * once and nationally, and records checking each flagged row against the printed list. No in-app CSO
 * role exists, so the superadmin acts as CSO (as on Lab sign-offs).
 */
export default async function PharmacyCataloguePage() {
  const state = await getAuthState();
  if (!state.user || !state.roles.includes("superadmin")) redirect("/admin");
  const data = await loadCatalogueConsole(db as unknown as EmrDb);
  // The shared catalogue's queue (4.8, ADR 0456) shows once its flag is set: 0251–0254 are applied with it.
  const queue = process.env.PHARMACY_CATALOGUE
    ? await loadCatalogueQueue(db as unknown as EmrDb, state.user.id)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading-l text-foreground">National medicines list</h1>
        <p className="text-body-s text-muted-foreground max-w-prose">
          Link each prescribing-list medicine to its row in the national list, so the pharmacy sees
          its class and level of care. A proposal is only a name match: you confirm every link. A
          link never changes what can be prescribed.
        </p>
      </header>
      {data ? (
        <CatalogueConsole
          edition={{
            id: data.edition.id,
            name: data.edition.name,
            source: data.edition.sourceRef,
            importedAt: data.edition.importedAt.toISOString(),
          }}
          counts={data.counts}
          proposals={data.proposals.map((p) => ({
            medicineId: p.medicineId,
            generic: p.generic,
            linkedRowId: p.linkedRowId,
            candidates: p.candidates.map((c) => ({
              id: c.id,
              genericName: c.genericName,
              form: c.form,
              strength: c.strength,
              levelOfCare: c.levelOfCare,
              venClass: c.venClass,
              specialist: c.specialist,
              sourcePage: c.sourcePage,
              flagged: !!c.checkNote,
              linkable: c.linkable,
            })),
          }))}
          flagged={data.flagged.map((r) => ({
            id: r.id,
            genericName: r.genericName,
            form: r.form,
            strength: r.strength ?? r.unit,
            kind: r.kind,
            sourcePage: r.sourcePage,
            checkNote: r.checkNote ?? "",
            check: r.check ? { note: r.check.note, at: r.check.checkedAt.toISOString() } : null,
          }))}
        />
      ) : (
        <div className="border-border bg-card text-body-s flex flex-col gap-2 rounded-lg border p-4">
          <p className="text-foreground">No edition is loaded yet.</p>
          <p className="text-muted-foreground">
            After migration 0136, the owner loads one with{" "}
            <code className="font-mono">scripts/pharmacy/load-national-list.ts</code>.
          </p>
        </div>
      )}
      {queue && (
        <CatalogueQueue
          data={{
            barcodes: queue.barcodes.map((b) => ({
              proposalId: b.proposalId,
              code: b.code,
              hospital: b.hospital,
              medicine: b.medicine,
              brand: b.brand,
              pack: b.pack,
              state: b.state,
              mine: b.mine,
            })),
            conflicts: queue.conflicts,
            sources: queue.sources,
          }}
        />
      )}
    </div>
  );
}
