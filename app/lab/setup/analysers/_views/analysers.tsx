import type { ReactNode } from "react";
import Link from "next/link";
import { and, eq } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { fill, LAB4 } from "@/content/lab-phase-4";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { loadConnections } from "@/lib/lab/exchange-read";
import { Ident } from "@/components/tide/work/kit";
import { dateWords, timeWords } from "../../../_lib/days";

const A = LABWS2_SETUP.analysers;

/** Splits a "{link}" template around a link. */
function withLink(template: string, link: ReactNode) {
  const [before, after] = template.split("{link}");
  return (
    <>
      {before}
      {link}
      {after}
    </>
  );
}

/**
 * Analysers (Lab Phase 4 §5.8, artboard 8; moved into Set-up by Lab Workspace v2, gate-a §3). Step 10 is a gap
 * report (STOP 0, analyser-gap.md): no maker's interface document is in hand, so no driver profile, code map or
 * shadow run exists, and every analyser says so. Results are typed from the printout (Phase 1). Bridges paired
 * on Connections show here with their health. Rendered by /lab/setup/analysers (v2) and /lab/exchange/analysers.
 */
export async function AnalysersView({
  hospitalId,
  header,
  v2,
}: {
  hospitalId: string;
  header: ReactNode;
  v2: boolean;
}) {
  const [analysers, connections] = await Promise.all([
    db
      .select({ id: devices.id, model: devices.model, serial: devices.serial })
      .from(devices)
      .where(
        and(
          eq(devices.hospitalId, hospitalId),
          eq(devices.kind, "analyser"),
          eq(devices.active, true),
        ),
      )
      .orderBy(devices.model),
    loadConnections(hospitalId),
  ]);
  const bridges = connections.filter((c) => c.kind === "bridge" && c.state !== "revoked");
  const connectionsHref = v2 ? "/lab/send-outs?tab=connections" : "/lab/exchange";
  const equipmentHref = v2 ? "/lab/quality?tab=equipment" : "/lab/equipment";
  const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
  const card = v2
    ? "bg-card shadow-tide-card rounded-tide-card text-body-s flex flex-col gap-2 p-4"
    : "border-border bg-card shadow-card text-body-s flex flex-col gap-2 rounded-lg border p-4";
  return (
    <div
      className={
        v2
          ? "flex flex-col gap-4"
          : "mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6"
      }
    >
      {header}
      <section className={card}>
        <h2 className="text-heading-s">{A.bridges}</h2>
        {bridges.length === 0 ? (
          <p className="text-muted-foreground">
            {withLink(
              A.noBridge,
              <Link href={connectionsHref} className="text-primary underline underline-offset-4">
                {A.connections}
              </Link>,
            )}
          </p>
        ) : (
          bridges.map((b) => (
            <p key={b.id}>
              <b>{b.name}</b> ·{" "}
              {b.state === "pairing" ? (
                A.pairing
              ) : b.quiet ? (
                <StatusWord tone="caution">
                  {fill(LAB4.bridgeNotHeard, {
                    name: b.name,
                    time: b.lastHeardAt ? at(new Date(b.lastHeardAt)) : A.enabled,
                  })}
                </StatusWord>
              ) : b.lastHeardAt ? (
                fill(A.lastHeard, { at: at(new Date(b.lastHeardAt)) })
              ) : (
                A.connected
              )}
            </p>
          ))
        )}
      </section>
      <section className={`${card} gap-3`}>
        <h2 className="text-heading-s">{LABWS2_SETUP.analysers.title}</h2>
        {analysers.length === 0 ? (
          <p className="text-muted-foreground">
            {withLink(
              A.noAnalyser,
              <Link href={equipmentHref} className="text-primary underline underline-offset-4">
                {A.register}
              </Link>,
            )}
          </p>
        ) : (
          <div className="overflow-auto" tabIndex={0} role="region" aria-label={A.title}>
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{A.title}</caption>
              <thead>
                <tr className="bg-muted">
                  {A.cols.map((x) => (
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
                        href={equipmentHref}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {d.model}
                      </Link>
                      {d.serial ? (
                        <span className="text-muted-foreground">
                          {" · "}
                          <Ident>{d.serial}</Ident>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{fill(A.waiting, { model: d.model })}</td>
                    <td className="px-3 py-2">{A.byHand}</td>
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
