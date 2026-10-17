import type { Metadata } from "next";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB5 } from "@/content/lab-phase-5";
import { surveillance } from "@/lib/ipc/read";
import { ipcScope } from "@/lib/ipc/scope";
import { IpcNav } from "../_components/ipc-nav";
import { PrintDigest } from "./print-digest";

export const metadata: Metadata = { title: "Surveillance · Infection prevention · MedSync" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const words = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`)).toUpperCase();

/**
 * Surveillance and AMR (Lab Phase 5 §5.12, artboard 12; IC-10, IC-13). Aggregates only: this epi-week's alerts,
 * release to precautions, flagged readmissions and the lab-confirmed counts per IDSR item for the surveillance focal
 * person, who reports (MedSync does not). AMR and HAI wait for microbiology: "No data", never 0.
 */
export default async function SurveillancePage() {
  const scope = await ipcScope("/ipc/surveillance");
  const now = new Date();
  const s = await surveillance(scope, now);
  const sunday = new Date(new Date(`${s.week}T00:00:00Z`).getTime() + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const tiles: [string, string][] = [
    ["Lab alerts this week", `${s.open} open · ${s.closed} closed`],
    [
      "Release to precautions, median",
      s.medianMinutes === null
        ? LAB5.noData
        : `${Math.round(s.medianMinutes)} min (${s.withTime} alerts)`,
    ],
    ["Flagged patients readmitted or moved", String(s.readmitted)],
    ["Isolates sent for confirmation", LAB5.noData],
  ];
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={scope.hospitalName} title="Infection prevention" />
      <IpcNav current="/ipc/surveillance" />
      <dl className="text-body-s grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="border-border bg-card rounded-md border p-3">
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="text-heading-s font-mono tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <section className="border-border bg-card text-body-s flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-heading-s">
          Lab-confirmed counts for the weekly IDSR report · {words(s.week)} to {words(sunday)}
        </h2>
        {s.counts.length === 0 ? (
          <p className="text-muted-foreground">{LAB5.noData}</p>
        ) : (
          <table className="w-full max-w-xl border-collapse text-left">
            <caption className="sr-only">Counts by IDSR item</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-caption text-ink-600 border-border border-b py-1 font-medium"
                >
                  IDSR item
                </th>
                <th
                  scope="col"
                  className="text-caption text-ink-600 border-border border-b py-1 font-medium"
                >
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {s.counts.map((c) => (
                <tr key={c.item} className="border-ink-150 border-b last:border-b-0">
                  <td className="py-1.5">{c.item}</td>
                  <td className="py-1.5 font-mono tabular-nums">{c.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>Submit to DHIS2 by 12:00 on Monday after the epi-week (HMIS 033b).</p>
        <p className="text-muted-foreground">{LAB5.idsrSupport}</p>
      </section>
      <section className="border-border bg-card text-body-s flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="text-heading-s">AMR export and healthcare-associated infections</h2>
        <p>Needs microbiology. {LAB5.needsMicrobiology}</p>
      </section>
      <PrintDigest />
    </main>
  );
}
