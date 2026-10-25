import type { EmrDb } from "@/lib/emr/db";
import type { Pack } from "@/lib/pharmacy/clinical/content";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { CLINICAL_UI } from "@/content/pharmacy-clinical";
import { PACK_LABEL } from "@/content/pharmacy-reconciliation";
import { db } from "@/db";
import { pharmacyContentEntries } from "@/db/schema/pharmacy-clinical";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { PACKS } from "@/lib/pharmacy/clinical/content";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import {
  pharmacyInteractionsLiveFor,
  pharmacyInterventionReviewLiveFor,
} from "@/lib/pharmacy/feature";
import { peopleAt } from "@/lib/pharmacy/stores/packs";
import { DRUGS } from "@/lib/prescribing/formulary";
import {
  EditDialog,
  ImportAwareButton,
  ImportButton,
  SignDialog,
  WithdrawDialog,
} from "./_components/content-dialogs";

export const metadata: Metadata = { title: "Clinical content · Pharmacy" };
export const dynamic = "force-dynamic";

const EDITABLE: readonly Pack[] = [
  "reconciliation_rules",
  "review_settings",
  "reaction_timelines",
  "interaction_pair",
  "alert_levels",
  "lookback_windows",
  "check_worth_signing",
];

/**
 * Clinical content (5.2, CC-1 to CC-5): every pack's entries with their status, version and source; drafts are seen
 * only here (Law 3). `pharmacy.review` drafts and imports; `pharmacy.manage` signs and withdraws. Shown when any
 * Phase 3 flag is on, because content is signed before a flag goes live.
 */
export default async function ClinicalContentPage() {
  const actor = await requirePharmacyActor();
  if (
    !pharmacyInteractionsLiveFor(actor.hospitalId) &&
    !pharmacyInterventionReviewLiveFor(actor.hospitalId)
  )
    notFound();
  const [rows, manages, people] = await Promise.all([
    asClinicalReader(actor, (tx) =>
      tx
        .select()
        .from(pharmacyContentEntries)
        .where(and(eq(pharmacyContentEntries.hospitalId, actor.hospitalId)))
        .orderBy(
          pharmacyContentEntries.pack,
          pharmacyContentEntries.key,
          desc(pharmacyContentEntries.version),
        ),
    ),
    managesPharmacy(actor.userId, actor.hospitalId),
    peopleAt(db as unknown as EmrDb, actor.hospitalId),
  ]);
  const reviews = actor.access.permissions.has("pharmacy.review");
  const medicines = DRUGS.map((d) => ({ id: d.id, name: d.generic })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={CLINICAL_UI.title}
        subline={
          <span className="text-body-s text-muted-foreground max-w-[70ch]">{CLINICAL_UI.lead}</span>
        }
        right={
          reviews ? (
            <div className="flex flex-wrap gap-2">
              <ImportButton />
              <ImportAwareButton />
              <EditDialog
                pack="interaction_pair"
                entryKey={null}
                payload={null}
                source={null}
                medicines={medicines}
                label={CLINICAL_UI.newPair}
              />
            </div>
          ) : null
        }
      />
      {PACKS.map((pack) => {
        const list = rows.filter((r) => r.pack === pack);
        const inForce = list.filter((r) => r.status === "in_force").length;
        const waiting = list.filter(
          (r) => r.status === "draft" || r.status === "reviewer_signed",
        ).length;
        return (
          <section key={pack} aria-labelledby={`pack-${pack}`} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`pack-${pack}`} className="text-heading-s">
                {PACK_LABEL[pack]}
              </h2>
              <span className="text-body-s text-muted-foreground">
                {CLINICAL_UI.inForce(inForce)} · {CLINICAL_UI.drafts(waiting)}
              </span>
            </div>
            {reviews && pack !== "interaction_pair" && EDITABLE.includes(pack) ? (
              <div>
                <EditDialog
                  pack={pack}
                  entryKey={pack}
                  payload={(list.find((r) => r.status !== "withdrawn")?.payload as object) ?? null}
                  source={null}
                  medicines={medicines}
                  label={CLINICAL_UI.edit}
                />
              </div>
            ) : null}
            {list.length ? (
              <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
                <table className="text-body-s w-full">
                  <thead className="text-muted-foreground text-left">
                    <tr>
                      <th className="p-2 font-medium">{PACK_LABEL[pack]}</th>
                      <th className="p-2 font-medium">{CLINICAL_UI.fields.source}</th>
                      <th className="p-2 font-medium">Status</th>
                      <th className="p-2 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-border border-t align-top">
                        <td className="p-2">
                          <span className="font-medium">{r.key}</span>
                          <span className="text-muted-foreground block">
                            {CLINICAL_UI.version(r.version)}
                            {pack === "interaction_pair"
                              ? ` · ${String((r.payload as { severity?: string }).severity ?? "")}`
                              : ""}
                          </span>
                        </td>
                        <td className="text-muted-foreground max-w-[40ch] p-2">
                          {CLINICAL_UI.source(r.source)}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-col items-start gap-1">
                            <StatusWord tone="neutral">{CLINICAL_UI.status[r.status]}</StatusWord>
                            {r.blocked ? (
                              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                                {CLINICAL_UI.blocked[r.blocked]}
                              </StatusWord>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap justify-end gap-2">
                            {reviews && pack === "interaction_pair" && r.status === "draft" ? (
                              <EditDialog
                                pack={pack}
                                entryKey={r.key}
                                payload={r.payload as object}
                                source={r.source}
                                medicines={medicines}
                                label={CLINICAL_UI.edit}
                              />
                            ) : null}
                            {manages &&
                            (r.status === "draft" || r.status === "reviewer_signed") &&
                            !r.blocked ? (
                              <SignDialog entryId={r.id} entryKey={r.key} people={people} />
                            ) : null}
                            {manages && r.status === "in_force" ? (
                              <WithdrawDialog entryId={r.id} entryKey={r.key} />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-body-s text-muted-foreground">{CLINICAL_UI.nothing}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
