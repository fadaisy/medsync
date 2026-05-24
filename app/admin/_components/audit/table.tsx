"use client";

import type { AuditRow } from "./types";
import type { DataTableColumn, SortDirection } from "@/components/ui/data-table";
import { useMemo, useState } from "react";
import { ShieldAlertIcon, UsersRoundIcon } from "lucide-react";

import { DataTable, DataTableEmpty, DataTableToolbar, Pill } from "@/components/ui/data-table";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Audit ledger table — reverse-chronological by default; break-glass
 * and four-eyes events visually distinct so they jump out at any
 * scroll position. Row click → slide-out panel with full row detail
 * (request id, IP, UA — useful for incident reconstruction).
 */

interface TableProps {
  rows: ReadonlyArray<AuditRow>;
  /** True if the row count hit the page cap — show a note. */
  cappedAt?: number;
}

function isSensitive(action: string): boolean {
  return action.startsWith("break_glass_") || action.startsWith("four_eyes_");
}

export function AuditTable({ rows, cappedAt }: TableProps) {
  const [sortKey, setSortKey] = useState<string | undefined>("timestamp");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const sorted = useMemo(() => {
    if (!sortKey || sortDir === null) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "timestamp") {
        cmp = new Date(a.timestampIso).getTime() - new Date(b.timestampIso).getTime();
      } else if (sortKey === "actor") {
        cmp = (a.actorFullName ?? "").localeCompare(b.actorFullName ?? "");
      } else if (sortKey === "action") {
        cmp = a.action.localeCompare(b.action);
      } else if (sortKey === "target") {
        cmp = a.targetKind.localeCompare(b.targetKind);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const columns: ReadonlyArray<DataTableColumn<AuditRow>> = useMemo(
    () => [
      {
        id: "timestamp",
        header: "When",
        sortable: true,
        mono: true,
        cell: (row) => (
          <span className="text-muted-foreground">
            {row.timestampIso.replace("T", " ").slice(0, 19)}
          </span>
        ),
        className: "w-[180px]",
      },
      {
        id: "actor",
        header: "Actor",
        sortable: true,
        cell: (row) => (
          <span className="flex flex-col">
            <span className="text-foreground text-[13px]">{row.actorFullName ?? "(unknown)"}</span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {row.actorEmail ?? "—"}
            </span>
          </span>
        ),
      },
      {
        id: "action",
        header: "Action",
        sortable: true,
        cell: (row) => {
          const sensitive = isSensitive(row.action);
          return (
            <span className="inline-flex items-center gap-1.5">
              {row.action.startsWith("break_glass_") ? (
                <ShieldAlertIcon
                  className="size-3.5 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
              ) : row.action.startsWith("four_eyes_") ? (
                <UsersRoundIcon
                  className="size-3.5 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
              ) : null}
              <Pill tone={sensitive ? "sensitive" : "neutral"}>{row.action}</Pill>
            </span>
          );
        },
      },
      {
        id: "target",
        header: "Target",
        sortable: true,
        cell: (row) => (
          <span className="flex flex-col">
            <span className="text-muted-foreground font-mono text-[11.5px]">{row.targetKind}</span>
            <span className="text-muted-foreground/70 truncate font-mono text-[10.5px]">
              {row.targetId.slice(0, 18)}
              {row.targetId.length > 18 ? "…" : ""}
            </span>
          </span>
        ),
        className: "w-[200px]",
        hideOnNarrow: true,
      },
      {
        id: "reason",
        header: "Reason",
        cell: (row) => (
          <span className="text-foreground/80 truncate text-[12.5px]" title={row.reason}>
            {row.reason}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="border-border bg-card overflow-hidden rounded-lg border shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_1px_3px_rgba(0,0,0,0.04)]">
        <DataTable
          caption="Audit log"
          data={sorted}
          columns={columns}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={(k, d) => {
            setSortKey(k);
            setSortDir(d);
          }}
          onRowSelect={(row) => setSelected(row)}
          selectedRowId={selected?.id ?? null}
          toolbar={
            <DataTableToolbar count={sorted.length}>
              {cappedAt && sorted.length === cappedAt ? (
                <span className="text-muted-foreground text-[11.5px]">
                  Capped at {cappedAt}. Narrow with the filters above.
                </span>
              ) : null}
            </DataTableToolbar>
          }
          empty={
            <DataTableEmpty
              title="No audit rows match this filter."
              description="Try widening the date range or clearing the actor / action constraints."
            />
          }
        />
      </div>

      <p className="text-muted-foreground mt-3 text-center font-mono text-[10.5px] tracking-[0.05em]">
        ↑↓ navigate · ↵ open · esc close
      </p>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent widthClassName="w-full sm:max-w-[560px]">
          {selected ? <AuditRowDetail row={selected} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AuditRowDetail({ row }: { row: AuditRow }) {
  const sensitive = isSensitive(row.action);
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Pill tone={sensitive ? "sensitive" : "neutral"}>{row.action}</Pill>
          <Pill tone="neutral">{row.targetKind}</Pill>
        </div>
        <SheetTitle>{row.actorFullName ?? "(unknown actor)"}</SheetTitle>
        <SheetDescription className="font-mono text-[12px]">
          {row.actorEmail ?? "—"}
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[120px_1fr]">
          <Ev label="When" value={row.timestampIso.replace("T", " ").slice(0, 19)} mono />
          <Ev label="Reason" value={row.reason} />
          <Ev label="Target kind" value={row.targetKind} mono />
          <Ev label="Target id" value={row.targetId} mono />
          <Ev label="Actor id" value={row.actorId} mono />
          {row.requestId ? <Ev label="Request id" value={row.requestId} mono /> : null}
          {row.ipAddress ? <Ev label="IP" value={row.ipAddress} mono /> : null}
          {row.userAgent ? <Ev label="User agent" value={row.userAgent} mono /> : null}
        </dl>

        {sensitive ? (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
            This is a sensitive event ({row.action}). Cross-reference the request id against
            sa_break_glass_grants or sa_pending_approvals for the full chain of custody.
          </div>
        ) : null}
      </SheetBody>
    </>
  );
}

function Ev({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground font-mono text-[10.5px] font-semibold tracking-[0.06em] uppercase">
        {label}
      </dt>
      <dd
        className={cn("text-foreground text-[13px] break-words", mono && "font-mono tabular-nums")}
      >
        {value}
      </dd>
    </>
  );
}
