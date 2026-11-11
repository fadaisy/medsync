import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { EmptyState } from "@/components/tide/work/kit";
import { db } from "@/db";
import { devices, labControlChecks, labQcRuns } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labStockLiveFor } from "@/lib/lab/feature";
import { analyteName } from "@/lib/lab/qc-store";
import { loadStock } from "@/lib/lab/stock-read";
import { FocusLot } from "../_components/focus-lot";
import { dateWords, timeWords } from "../../_lib/days";
import { AcceptCard, DeliveryForm } from "../../stock/_components/receive-forms";
import { RECEIVE as C } from "../../stock/_lib/copy";
import { Frame } from "./frame";

/**
 * Receive a delivery and accept a lot (Lab Phase 3 §5.6, artboard 6; LA-1..LA-5, labStock). Lots waiting for
 * acceptance list their plan, the comparison by sample number and level only (patient identity is never
 * loaded here, LA-5) and the QC evidence recorded since they arrived.
 */
export async function ReceiveView({ v2, focusLot }: { v2: boolean; focusLot?: string }) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !emrV1LiveFor(scope.hospitalId) || !labStockLiveFor(scope.hospitalId))
    notFound();
  const p = scope.access.permissions;
  if (!p.has("lab.stock.manage") && !p.has("lab.manage")) notFound();
  const now = new Date();
  const stock = await db.transaction((tx) => loadStock(tx as never, scope.hospitalId, now));
  const waiting = stock.items.flatMap((i) =>
    i.lots
      .filter((l) => l.state === "received" || l.state === "in_acceptance")
      .map((l) => ({ item: i, lot: l })),
  );
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [runs, checks] = waiting.length
    ? await Promise.all([
        db
          .select({
            id: labQcRuns.id,
            concept: labQcRuns.conceptId,
            at: labQcRuns.runAt,
            device: devices.model,
          })
          .from(labQcRuns)
          .innerJoin(devices, eq(devices.id, labQcRuns.deviceId))
          .where(
            and(
              eq(labQcRuns.hospitalId, scope.hospitalId),
              inArray(labQcRuns.decision, ["accepted", "warning"]),
              gte(labQcRuns.runAt, since),
            ),
          )
          .orderBy(desc(labQcRuns.runAt))
          .limit(50),
        db
          .select({
            id: labControlChecks.id,
            lotId: labControlChecks.lotId,
            at: labControlChecks.at,
          })
          .from(labControlChecks)
          .where(
            and(
              eq(labControlChecks.hospitalId, scope.hospitalId),
              eq(labControlChecks.outcome, "pass"),
              inArray(
                labControlChecks.lotId,
                waiting.map((w) => w.lot.id),
              ),
            ),
          ),
      ])
    : [[], []];
  const words = (at: Date) => `${dateWords(at)} ${timeWords(at)}`;

  return (
    <Frame v2={v2} hospital={scope.hospitalName} title={C.title} lede={C.lede}>
      <DeliveryForm items={stock.items.map((i) => ({ id: i.id, name: i.name }))} />
      <section aria-labelledby="waiting-heading" className="flex flex-col gap-4">
        <h2 id="waiting-heading" className="text-heading-m">
          {C.waiting}
        </h2>
        {focusLot && waiting.some((w) => w.lot.id === focusLot) ? (
          <FocusLot id={`lot-${focusLot}`} />
        ) : null}
        {waiting.length === 0 ? (
          <EmptyState compact title={C.waitingNone} />
        ) : (
          waiting.map((w) => (
            <AcceptCard
              key={w.lot.id}
              item={{ name: w.item.name, plan: w.item.plan?.payload ?? null }}
              lot={{ id: w.lot.id, lot: w.lot.lot }}
              focused={w.lot.id === focusLot}
              evidence={[
                ...checks
                  .filter((c) => c.lotId === w.lot.id)
                  .map((c) => ({ id: c.id, label: `Control check · ${words(c.at)}` })),
                ...runs
                  .filter((r) => !w.item.conceptIds.length || w.item.conceptIds.includes(r.concept))
                  .map((r) => ({
                    id: r.id,
                    label: `${r.device} · ${analyteName(r.concept)} · ${words(r.at)}`,
                  })),
              ]}
            />
          ))
        )}
      </section>
      <p className="text-caption text-muted-foreground max-w-3xl">{C.accept.note}</p>
    </Frame>
  );
}
