import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LAB } from "@/content/lab";
import { LAB2 } from "@/content/lab-phase-2";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadResearchDrafts } from "@/lib/lab/drafts-read";
import { labCatalogueV2LiveFor } from "@/lib/lab/feature";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { SetupHeader } from "../_components/setup-header";
import { AddendumDialog, AddendumState, ImportButton } from "./_components/addendum-dialog";
import { DraftsTable } from "./_components/drafts-table";
import { DRAFTS } from "./_lib/copy";

export const metadata: Metadata = { title: "Research drafts · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Research drafts (Lab Phase 2 §5.13, artboard 13): the concept addendum, the ranges and cut-offs the
 * research import drafted, and what it left for the lab's own kit insert. Nothing here is in force.
 */
export default async function ResearchDraftsPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labCatalogueV2LiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const d = await db.transaction((tx) =>
    loadResearchDrafts(tx as never, scope.hospitalId, scope.userId),
  );
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: LAB_TIME_ZONE,
  });
  const card = "border-border bg-card shadow-card flex flex-col gap-2 rounded-lg border p-4";
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={DRAFTS.title}
        subline={LAB2.drafts.header}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <section aria-labelledby="card-addendum" className={card}>
          <h2 id="card-addendum" className="text-heading-s font-medium">
            {DRAFTS.addendum.card(d.addendum.count)}
          </h2>
          <AddendumState config={d.addendum.config} />
          <div className="mt-auto">
            <AddendumDialog addendum={d.addendum} />
          </div>
        </section>
        <section aria-labelledby="card-drafts" className={card}>
          <h2 id="card-drafts" className="text-heading-s font-medium">
            {DRAFTS.drafts.card(d.references.length + d.schemes.length)}
          </h2>
          <p className="text-body-s text-muted-foreground">{DRAFTS.drafts.basis}</p>
          <div className="mt-auto">
            {d.imported ? (
              <p className="text-body-s">
                {DRAFTS.import.on(date.format(d.imported.at))}
                <br />
                <span className="text-muted-foreground">
                  {DRAFTS.import.counts(
                    d.imported.counts.referenceDrafts ?? 0,
                    d.imported.counts.schemeDrafts ?? 0,
                  )}
                </span>
              </p>
            ) : (
              <ImportButton />
            )}
          </div>
        </section>
        <section aria-labelledby="card-not-imported" className={card}>
          <h2 id="card-not-imported" className="text-heading-s font-medium">
            {DRAFTS.notImported.card}
          </h2>
          <p className="text-body-s text-muted-foreground">{DRAFTS.notImported.line}</p>
          <ul className="text-body-s flex flex-col gap-0.5">
            {d.notImported.map((c) => (
              <li key={c.id}>{c.display}</li>
            ))}
          </ul>
        </section>
      </div>
      <DraftsTable references={d.references} schemes={d.schemes} />
    </div>
  );
}
