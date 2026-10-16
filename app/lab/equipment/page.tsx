import type { EquipmentRow } from "@/lib/lab/equipment-read";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { fill, LAB3 } from "@/content/lab-phase-3";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadEquipment } from "@/lib/lab/equipment-read";
import { labEquipmentLiveFor, labStockLiveFor } from "@/lib/lab/feature";
import { loadLabSections } from "@/lib/lab/read";
import { RecordList } from "../_components/record-list";
import { dateWords, timeWords } from "../_lib/days";
import { EquipmentDialog, EquipmentPanel } from "./_components/equipment-forms";
import { EQUIPMENT as C } from "./_lib/copy";

export const metadata: Metadata = { title: "Equipment · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;

function Status({ e }: { e: EquipmentRow }) {
  if (e.state === "down" && e.breakdown)
    return <StatusWord tone="caution">{C.downSince(at(e.breakdown.since))}</StatusWord>;
  if (e.state === "in_use")
    return (
      <StatusWord icon glyph={CheckIcon}>
        {C.states.in_use}
      </StatusWord>
    );
  return <StatusWord>{C.states[e.state] ?? e.state}</StatusWord>;
}

/** EQ-4, EQ-5: overdue is amber with its count; nothing here blocks unless a task is required before use. */
function Tasks({ e, kind }: { e: EquipmentRow; kind: "maintenance" | "calibration" }) {
  const mine = e.tasks.filter((t) => t.kind === kind);
  if (!mine.length) return <span className="text-muted-foreground">{C.noTasks}</span>;
  const overdue = mine.filter((t) => t.overdue);
  const last = mine
    .map((t) => t.lastDone)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return (
    <span className="flex flex-col gap-1">
      {overdue.length ? (
        <StatusWord tone="caution">{C.overdue(overdue.length)}</StatusWord>
      ) : (
        <StatusWord icon glyph={CheckIcon}>
          {C.allDone}
        </StatusWord>
      )}
      {last ? (
        <span className="text-caption text-muted-foreground">{C.lastDone(at(last))}</span>
      ) : null}
    </span>
  );
}

/** EQ-6: the latest reading against its range; a window that ended unread is amber, in words. */
function Temperature({ e }: { e: EquipmentRow }) {
  const t = e.temperature;
  if (!t) return <span className="text-muted-foreground">{C.noRange}</span>;
  return (
    <span className="flex flex-col gap-1">
      {t.latest ? (
        t.latest.inRange === false ? (
          <StatusWord tone="caution">
            {`${C.outOfRange} · ${t.latest.value} ${t.latest.unit} at ${timeWords(t.latest.at)}`}
          </StatusWord>
        ) : (
          <StatusWord icon glyph={CheckIcon}>
            {`${C.inRange} · ${t.latest.value} ${t.latest.unit} at ${timeWords(t.latest.at)}`}
          </StatusWord>
        )
      ) : (
        <span className="text-muted-foreground">{C.noReading}</span>
      )}
      <span className="text-caption text-muted-foreground">
        {C.rangeWords(t.range.min, t.range.max)}
      </span>
      {t.missing.map((m) => (
        <StatusWord key={m.toISOString()} tone="caution">
          {fill(LAB3.readingMissing, { point: e.model, time: timeWords(m) })}
        </StatusWord>
      ))}
    </span>
  );
}

/**
 * Equipment (Lab Phase 3 §5.7, artboard 7; EQ-1..EQ-6, labEquipment). The machine list is `devices` (the hub has
 * none, STOP 0); down and back go through the hub's own action. Viewing needs lab.view; the forms post to
 * lib/lab/equipment-actions.ts, which checks the permission on the server.
 */
export default async function EquipmentPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labEquipmentLiveFor(scope.hospitalId)
  )
    notFound();
  const now = new Date();
  const [rows, sections] = await Promise.all([
    db.transaction((tx) => loadEquipment(tx as never, scope.hospitalId, now)),
    loadLabSections(scope.hospitalId),
  ]);
  const p = scope.access.permissions;
  const lead = p.has("lab.manage");
  const can = {
    lead,
    staff: lead || p.has("lab.result.release"),
    stock: labStockLiveFor(scope.hospitalId) && (lead || p.has("lab.stock.manage")),
  };
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={C.title}
        right={lead ? <EquipmentDialog sections={sections} /> : null}
      />
      <p className="text-body-s text-muted-foreground max-w-3xl">{C.lede}</p>
      <RecordList<EquipmentRow>
        caption={C.title}
        rows={rows}
        rowKey={(e) => e.id}
        empty={C.none}
        columns={[
          {
            id: "equipment",
            header: C.columns[0]!,
            cell: (e) => (
              <span className="flex flex-col">
                <span>{e.model}</span>
                <span className="text-caption text-muted-foreground">
                  {[C.kinds[e.kind] ?? e.kind, e.section, e.serial].filter(Boolean).join(" · ")}
                </span>
              </span>
            ),
          },
          { id: "status", header: C.columns[1]!, cell: (e) => <Status e={e} /> },
          {
            id: "maintenance",
            header: C.columns[2]!,
            cell: (e) => <Tasks e={e} kind="maintenance" />,
          },
          {
            id: "calibration",
            header: C.columns[3]!,
            cell: (e) => <Tasks e={e} kind="calibration" />,
          },
          { id: "temperature", header: C.columns[4]!, cell: (e) => <Temperature e={e} /> },
          {
            id: "open",
            header: C.columns[5]!,
            cell: (e) => <EquipmentPanel row={e} can={can} sections={sections} now={now} />,
          },
        ]}
      />
    </div>
  );
}
