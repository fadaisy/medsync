import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { PACK_TEXT, PACKS, SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { isPhase2Kind, packRows, peopleAt } from "@/lib/pharmacy/stores/packs";
import { supplyFlagOn } from "@/lib/pharmacy/stores/supply-action";
import { PackDraftDialog, SignPackDialog } from "./_components/pack-dialogs";

export const metadata: Metadata = { title: "Signed packs · Pharmacy" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});

/**
 * Signed packs (Appendix D): every hospital-level pack, its version in force and its draft, and what is blocked
 * while it is unsigned. `pharmacy.view` reads; `pharmacy.manage` writes drafts and signs. Shown when any Phase 2
 * flag or `pharmacyDispensing` is on.
 */
export default async function PacksPage() {
  const actor = await requirePharmacyActor();
  if (!supplyFlagOn("packs", actor.hospitalId)) notFound();
  const [rows, manages, people] = await Promise.all([
    asClinicalReader(actor, (tx) => packRows(tx, actor.hospitalId)),
    managesPharmacy(actor.userId, actor.hospitalId),
    peopleAt(db as unknown as EmrDb, actor.hospitalId),
  ]);
  const me = people.find((p) => p.userId === actor.userId) ?? {
    userId: actor.userId,
    label: SUPPLY_COMMON.you,
  };
  const groups = [
    { title: PACKS.phase2, rows: rows.filter((r) => isPhase2Kind(r.kind)) },
    { title: PACKS.phase1, rows: rows.filter((r) => !isPhase2Kind(r.kind)) },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={PACKS.title}
        subline={<p className="text-body-s text-muted-foreground">{PACKS.intro}</p>}
      />
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`packs-${g.title}`} className="flex flex-col gap-2">
          <h2 id={`packs-${g.title}`} className="text-heading-s text-foreground">
            {g.title}
          </h2>
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="text-body-s w-full">
              <thead className="bg-ink-50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    {PACKS.columns.pack}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {PACKS.columns.status}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {PACKS.signers}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {PACKS.blocked}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">{PACKS.columns.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {g.rows.map((r) => {
                  const t = PACK_TEXT[r.kind];
                  return (
                    <tr key={r.kind} className="align-top">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {t.name}
                      </th>
                      <td className="px-3 py-2">
                        {r.signed ? (
                          <StatusWord>{`${PACKS.status.signed}, ${PACKS.version(r.signed.version)}${r.signed.signedAt ? `, ${day.format(r.signed.signedAt)}` : ""}`}</StatusWord>
                        ) : (
                          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                            {r.draft
                              ? `${PACKS.status.draft}, ${PACKS.version(r.draft.version)}`
                              : PACKS.status.none}
                          </StatusWord>
                        )}
                        {r.signed && r.draft ? (
                          <p className="text-caption text-muted-foreground">{`${PACKS.status.draft}, ${PACKS.version(r.draft.version)}`}</p>
                        ) : null}
                        {r.signed?.exception ? (
                          <p className="text-caption text-muted-foreground">{r.signed.exception}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{t.signers.join(" + ")}</td>
                      <td className="px-3 py-2">{r.signed ? "—" : t.whileUnsigned}</td>
                      <td className="px-3 py-2">
                        {manages ? (
                          <span className="flex flex-wrap gap-2">
                            <PackDraftDialog kind={r.kind} draft={r.draft?.content ?? null} />
                            {r.draft ? (
                              <SignPackDialog
                                kind={r.kind}
                                packId={r.draft.id}
                                me={me}
                                people={people}
                              />
                            ) : null}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="text-body-s text-muted-foreground">{PACKS.unsupported}</p>
    </div>
  );
}
