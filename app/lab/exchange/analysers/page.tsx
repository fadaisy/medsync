import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { fill, LAB4 } from "@/content/lab-phase-4";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadConnections } from "@/lib/lab/exchange-read";
import { labExchangeLiveFor } from "@/lib/lab/feature";
import { dateWords } from "../../_lib/days";

export const metadata: Metadata = { title: "Analysers · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Analysers (Lab Phase 4 §5.8, artboard 8). Step 10 is a gap report (STOP 0, analyser-gap.md): no maker's
 * interface document is in hand, so no driver profile, code map or shadow run exists, and every analyser says so.
 * Results are typed from the printout (Phase 1). Bridges paired on Connections show here with their health.
 */
export default async function AnalysersPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labExchangeLiveFor(scope.hospitalId)
  )
    notFound();
  const [analysers, connections] = await Promise.all([
    db
      .select({ id: devices.id, model: devices.model, serial: devices.serial })
      .from(devices)
      .where(
        and(
          eq(devices.hospitalId, scope.hospitalId),
          eq(devices.kind, "analyser"),
          eq(devices.active, true),
        ),
      )
      .orderBy(devices.model),
    loadConnections(scope.hospitalId),
  ]);
  const bridges = connections.filter((c) => c.kind === "bridge" && c.state !== "revoked");
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="Analysers" />
      <section className="border-border bg-card shadow-card text-body-s flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="text-heading-s">Bridges</h2>
        {bridges.length === 0 ? (
          <p className="text-muted-foreground">
            No bridge is paired. Pair one on{" "}
            <Link href="/lab/exchange" className="text-primary underline-offset-4 hover:underline">
              Connections
            </Link>{" "}
            once an analyser has its maker&apos;s interface document.
          </p>
        ) : (
          bridges.map((b) => (
            <p key={b.id}>
              <b>{b.name}</b> ·{" "}
              {b.state === "pairing" ? (
                "Pairing"
              ) : b.quiet ? (
                <StatusWord tone="caution">
                  {fill(LAB4.bridgeNotHeard, {
                    name: b.name,
                    time: b.lastHeardAt ? dateWords(new Date(b.lastHeardAt)) : "it was enabled",
                  })}
                </StatusWord>
              ) : (
                `Connected${b.lastHeardAt ? ` · last heard ${dateWords(new Date(b.lastHeardAt))}` : ""}`
              )}
            </p>
          ))
        )}
      </section>
      <section className="border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-heading-s">Analysers</h2>
        {analysers.length === 0 ? (
          <p className="text-muted-foreground">
            No analyser is on the{" "}
            <Link href="/lab/equipment" className="text-primary underline-offset-4 hover:underline">
              equipment register
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Analysers</caption>
              <thead>
                <tr className="bg-muted">
                  {["Analyser", "Protocol", "Now"].map((x) => (
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
                {analysers.map((d) => (
                  <tr key={d.id} className="border-ink-150 border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <Link
                        href="/lab/equipment"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {d.model}
                      </Link>
                      {d.serial ? (
                        <span className="text-muted-foreground font-mono"> · {d.serial}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">Waiting for {d.model}&apos;s interface document</td>
                    <td className="px-3 py-2">Typed by hand</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-caption text-muted-foreground">{LAB4.mappingSource}</p>
      </section>
    </div>
  );
}
