import type { PharmacyV2 } from "../../_lib/v2";
import type { EmrDb } from "@/lib/emr/db";
import { notFound } from "next/navigation";

import { Pill } from "@/app/lab/_components/v2/kit";
import { ALL_PACK_TEXT as PACK_TEXT } from "@/content/pharmacy-network";
import { PACKS, SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_SETUP } from "@/content/pharmacy-workspace-v2-setup";
import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import {
  isPhase2Kind,
  packChoices,
  packRows,
  peopleAt,
  signerRoles,
} from "@/lib/pharmacy/stores/packs";
import { supplyFlagOn } from "@/lib/pharmacy/stores/supply-action";
import { packState, packSummary } from "@/lib/pharmacy/workspace-v2/setup";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { PackDraftDialog, SignPackDialog } from "../../store/packs/_components/pack-dialogs";

const P = PHWS2_SETUP.packs;
const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});

/**
 * Set-up › Signed packs (board Setup): the old packs page's rows, reads and dialogs (`packRows`, `managesPharmacy`,
 * `peopleAt`, `PackDraftDialog`, `SignPackDialog`) in the board's columns, with the summary and who signs. Signing
 * is the same code path as before.
 */
export async function PacksView({ v2 }: { v2: PharmacyV2 }) {
  const actor = v2.scope;
  if (!supplyFlagOn("packs", actor.hospitalId)) notFound();
  const [rows, manages, people, choices] = await Promise.all([
    asClinicalReader(actor, (tx) => packRows(tx, actor.hospitalId)),
    managesPharmacy(actor.userId, actor.hospitalId),
    peopleAt(db as unknown as EmrDb, actor.hospitalId),
    packChoices(db as unknown as EmrDb, actor.hospitalId),
  ]);
  const me = people.find((p) => p.userId === actor.userId) ?? {
    userId: actor.userId,
    label: SUPPLY_COMMON.you,
  };
  const sum = packSummary(rows);
  const groups = [
    { title: PACKS.phase2, rows: rows.filter((r) => isPhase2Kind(r.kind)) },
    { title: PACKS.phase1, rows: rows.filter((r) => !isPhase2Kind(r.kind)) },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <p className="text-body-s text-ink-700 max-w-[70ch]">{P.explainer}</p>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-heading-s text-foreground">{P.title}</h2>
        <span className="text-body-s text-muted-foreground tabular-nums">
          {fill(P.count, { signed: sum.signed, total: sum.total })}
        </span>
      </div>
      {groups.map((g) => (
        <section
          key={g.title}
          aria-label={g.title}
          className="bg-card shadow-tide-card rounded-tide-card overflow-hidden"
        >
          <h3 className="text-heading-s text-foreground border-border border-b px-4 py-3">
            {g.title}
          </h3>
          <div tabIndex={0} className="overflow-x-auto">
            <table className="text-body-s w-full">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {P.columns.pack}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {P.columns.state}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {P.columns.missing}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    <span className="sr-only">{P.columns.action}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {g.rows.map((r) => {
                  const t = PACK_TEXT[r.kind];
                  const st = packState(r);
                  const [first, second] = signerRoles(r.kind, false);
                  return (
                    <tr key={r.kind} className="align-top">
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <div className="text-foreground font-medium">{t.name}</div>
                        <div className="text-caption text-muted-foreground">
                          {fill(P.signers, { first, second: second ?? "" })}
                        </div>
                      </th>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          {st === "signed" ? (
                            <Pill tone="passed">{P.signed}</Pill>
                          ) : (
                            <Pill tone="caution">{st === "draft" ? P.draft : P.none}</Pill>
                          )}
                          {r.signed ? (
                            <span className="text-caption text-muted-foreground">
                              {r.signed.signedAt
                                ? fill(P.versionOn, {
                                    v: r.signed.version,
                                    date: day.format(r.signed.signedAt),
                                  })
                                : fill(P.version, { v: r.signed.version })}
                            </span>
                          ) : r.draft ? (
                            <span className="text-caption text-muted-foreground">
                              {fill(P.version, { v: r.draft.version })}
                            </span>
                          ) : null}
                          {r.signed && r.draft ? (
                            <span className="text-caption text-muted-foreground">
                              {fill(P.draftToo, { v: r.draft.version })}
                            </span>
                          ) : null}
                          {r.signed?.exception ? (
                            <span className="text-caption text-muted-foreground">
                              {r.signed.exception}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">{r.signed ? P.nothingBlocked : t.whileUnsigned}</td>
                      <td className="px-4 py-3">
                        {manages ? (
                          <span className="flex flex-wrap justify-end gap-2">
                            <PackDraftDialog
                              kind={r.kind}
                              draft={r.draft?.content ?? null}
                              signed={r.signed?.content ?? null}
                              choices={choices}
                            />
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
      <section className="flex flex-col gap-1">
        <h2 className="text-heading-s text-foreground">{P.whoTitle}</h2>
        <p className="text-body-s text-ink-700 max-w-[70ch]">{P.who}</p>
      </section>
      <p className="text-body-s text-muted-foreground">{PACKS.unsupported}</p>
    </div>
  );
}
