import type { Metadata } from "next";
import { sql } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB5 } from "@/content/lab-phase-5";
import { db } from "@/db";
import { rowsOf } from "@/lib/exchange/store";
import { onMenu } from "@/lib/ipc/lab-alerts";
import { alertList, menuTestCodes } from "@/lib/ipc/read";
import { ipcScope } from "@/lib/ipc/scope";
import { CheckEntry, EntryDialog, SignEntry } from "../_components/ipc-forms";
import { IpcNav } from "../_components/ipc-nav";

export const metadata: Metadata = { title: "Alert list · Infection prevention · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The alert list (Lab Phase 5 §5.11, artboard 11; IC-1, D-LAB5-19, -20). The facility IPC lead drafts and signs each
 * entry, a laboratory lead countersigns it, and the surveillance focal person checks the IDSR routes against the
 * guidelines (docs/lab/phase-5/idsr-transcription.md). Entries for tests not on this menu are kept and never fire.
 */
export default async function IpcListPage() {
  const scope = await ipcScope("/ipc/list");
  const [entries, menu, coded] = await Promise.all([
    alertList(scope.hospitalId),
    menuTestCodes(scope.hospitalId),
    rowsOf<{ code: string; name: string; concept: string; answers: string[] }>(
      await db.execute(sql`SELECT t.code, t.display AS name, c.id AS concept, c.answers
        FROM test_catalogue t JOIN clinical_concepts c ON c.id = t.components[1]
       WHERE t.kind = 'lab' AND t.hospital_id IS NULL AND t.active AND c.value_type = 'coded'
       ORDER BY t.display`),
    ),
  ]);
  const tests = coded.map((t) => ({
    code: t.code,
    name: t.name,
    concept: t.concept,
    answers: (t.answers ?? []).map((a) => ({ code: a, label: a.replace(/_/g, " ") })),
  }));
  const lead = scope.roles.includes("ipc_lead");
  const labLead = scope.roles.includes("lab_lead");
  const focal = scope.roles.includes("focal");
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={scope.hospitalName} title="Infection prevention" />
      <IpcNav current="/ipc/list" />
      <p role="note" className="border-border bg-muted text-body-s max-w-4xl rounded-md border p-3">
        One isolate or result from a listed condition is one alert per patient per admission. The
        facility IPC lead signs each entry with a laboratory lead; the surveillance focal person
        checks the IDSR routes against the IDSR technical guidelines, 3rd edition (2021).
      </p>
      {lead ? <EntryDialog tests={tests} /> : null}
      <section className="flex flex-col gap-2">
        <h2 className="text-heading-s">From tests this lab reports</h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-body-s">{LAB5.noData}</p>
        ) : (
          <div
            className="border-border bg-card overflow-auto rounded-lg border"
            tabIndex={0}
            role="region"
            aria-label="Alert list"
          >
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Alert list entries</caption>
              <thead>
                <tr className="bg-muted">
                  {[
                    "Trigger",
                    "Precaution",
                    "IPC alert",
                    "Surveillance focal person",
                    "Source",
                    "Status",
                    "Actions",
                  ].map((x) => (
                    <th
                      key={x}
                      scope="col"
                      className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium"
                    >
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const p = e.payload;
                  const trigger =
                    p.trigger.kind === "result"
                      ? `${p.trigger.testCode.replace("test.", "").replace(/_/g, " ")}: ${p.trigger.answers.join(", ").replace(/_/g, " ")}`
                      : p.trigger.kind === "outbreak_referral"
                        ? "An outbreak referral (suspected VHF)"
                        : `${p.trigger.organism}${p.trigger.phenotype ? `, ${p.trigger.phenotype}` : ""}`;
                  return (
                    <tr
                      key={e.id}
                      className="border-ink-150 text-body-s border-b align-top last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <b>{p.condition}</b>
                        <span className="block">{trigger}</span>
                        {p.trigger.kind === "organism" ? (
                          <span className="text-muted-foreground block">
                            {LAB5.needsMicrobiology}
                          </span>
                        ) : !onMenu(p, menu) ? (
                          <span className="text-muted-foreground block">Test not on this menu</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {p.precaution.type.replace(/_/g, " ")}
                        <span className="text-muted-foreground block">{p.precaution.stopLine}</span>
                      </td>
                      <td className="px-3 py-2">{p.ipcAlert ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">
                        {p.route.kind === "notify_now"
                          ? `Notify now: ${p.route.idsrItem}`
                          : p.route.kind === "weekly_item"
                            ? `Weekly: ${p.route.idsrItem}`
                            : p.route.kind === "programme_route"
                              ? "Programme route"
                              : "None"}
                        {p.route.reference ? (
                          <span className="text-muted-foreground block">{p.route.reference}</span>
                        ) : null}
                        {e.checked ? (
                          <span className="block">Checked by the focal person</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{p.precaution.source}</td>
                      <td className="px-3 py-2">
                        {e.status === "signed" ? (
                          <StatusWord>{`Signed · v${e.version}`}</StatusWord>
                        ) : e.lead ? (
                          <StatusWord>Waiting for the laboratory lead</StatusWord>
                        ) : (
                          <StatusWord>Draft</StatusWord>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-2">
                          {e.status === "draft" && !e.lead && lead ? (
                            <SignEntry
                              configId={e.id}
                              as="ipc_lead"
                              authoredByMe={e.authored === scope.userId}
                            />
                          ) : null}
                          {e.status === "draft" && e.lead && labLead ? (
                            <SignEntry configId={e.id} as="lab_counter" authoredByMe={false} />
                          ) : null}
                          {focal &&
                          (p.route.kind === "notify_now" || p.route.kind === "weekly_item") &&
                          !e.checked ? (
                            <CheckEntry configId={e.id} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-heading-s">From microbiology</h2>
        <p className="text-body-s text-muted-foreground">{LAB5.needsMicrobiology}</p>
      </section>
    </main>
  );
}
