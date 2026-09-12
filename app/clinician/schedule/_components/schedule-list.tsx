"use client";

import type { PillTone } from "@/components/ui/data-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AlertCircleIcon } from "lucide-react";

import { Pill } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { AppointmentDetailSheet } from "./appointment-detail-sheet";

export interface ScheduleAppointmentRow {
  id: string;
  status: string;
  priority: string;
  type: string;
  reason: string;
  reasonNote: string | null;
  startsAtIso: string;
  endsAtIso: string;
  patientName: string;
  patientCode: string | null;
}

interface ScheduleListProps {
  rows: ReadonlyArray<ScheduleAppointmentRow>;
  selectedAppointmentId: string | null;
  statusTones: Record<string, PillTone>;
  statusLabel: Record<string, string>;
}

/**
 * Day-grouped schedule list. URL drives the open detail sheet via
 * ?aff=<uuid>. Pending requests render at the top of their day with
 * a soft amber background; urgent appointments get a red accent dot.
 */
export function ScheduleList({
  rows,
  selectedAppointmentId,
  statusTones,
  statusLabel,
}: ScheduleListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedAppointmentId) ?? null,
    [rows, selectedAppointmentId],
  );

  const grouped = useMemo(() => groupByDay(rows), [rows]);

  function openRow(id: string): void {
    const p = new URLSearchParams(searchParams.toString());
    p.set("aff", id);
    router.push(`/clinician/schedule?${p.toString()}`, { scroll: false });
  }

  function closeSheet(): void {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("aff");
    const qs = p.toString();
    router.push(qs ? `/clinician/schedule?${qs}` : `/clinician/schedule`, {
      scroll: false,
    });
  }

  if (rows.length === 0) {
    return (
      <div className="border-border bg-card reveal-up flex flex-col items-center gap-2 rounded-lg border py-14 text-center">
        {/* Quiet week-grid glyph — an open fortnight. */}
        <svg viewBox="0 0 112 72" aria-hidden className="text-border mb-1 h-14 w-auto">
          <rect
            x="1.5"
            y="1.5"
            width="109"
            height="69"
            rx="8"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            opacity="0.6"
          />
          <line
            x1="1"
            y1="20"
            x2="111"
            y2="20"
            stroke="currentColor"
            strokeWidth="3"
            opacity="0.4"
          />
          <rect x="12" y="30" width="20" height="12" rx="3" fill="currentColor" opacity="0.2" />
          <rect
            x="40"
            y="48"
            width="20"
            height="12"
            rx="3"
            className="text-brand-500/40"
            fill="currentColor"
          />
        </svg>
        <p className="text-foreground text-body-m font-medium">Nothing booked</p>
        <p className="text-muted-foreground text-body-s max-w-md leading-relaxed">
          Patients can&apos;t book without your declared availability. Add bookable hours from{" "}
          <a className="underline-offset-2 hover:underline" href="/clinician/availability">
            Availability
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="stagger-children flex flex-col gap-4">
        {grouped.map(([day, dayRows]) => (
          <li key={day}>
            <p className="text-muted-foreground text-overline mb-2 font-mono uppercase">{day}</p>
            <ul className="border-border bg-card divide-border/70 flex flex-col divide-y rounded-lg border">
              {dayRows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openRow(r.id)}
                    className={cn(
                      "group tap hover:bg-brand-50/40 dark:hover:bg-brand-950/15 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none",
                      "focus-visible:bg-muted/60 focus-visible:ring-brand-500/40 focus-visible:ring-2 focus-visible:ring-inset",
                      r.status === "pending_approval" &&
                        "bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/15 dark:hover:bg-amber-950/25",
                    )}
                  >
                    <div className="text-caption w-20 shrink-0 font-mono tabular-nums">
                      <div className="text-foreground">{formatTime(r.startsAtIso)}</div>
                      <div className="text-muted-foreground text-caption">
                        → {formatTime(r.endsAtIso)}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        {r.priority === "urgent" ? (
                          <AlertCircleIcon
                            className="size-3.5 shrink-0 text-red-600 dark:text-red-400"
                            aria-hidden
                          />
                        ) : null}
                        <span className="text-foreground text-body-s truncate font-medium">
                          {r.patientName}
                        </span>
                        {r.patientCode ? (
                          <span className="text-muted-foreground text-caption font-mono tabular-nums">
                            {r.patientCode}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-muted-foreground text-caption truncate">
                        {formatReason(r.reason)} · {r.type === "virtual" ? "Virtual" : "In-person"}
                      </div>
                    </div>
                    <Pill tone={statusTones[r.status] ?? "neutral"}>
                      {statusLabel[r.status] ?? r.status}
                    </Pill>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <AppointmentDetailSheet
        item={selected}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      />
    </>
  );
}

function groupByDay(
  rows: ReadonlyArray<ScheduleAppointmentRow>,
): Array<[string, ScheduleAppointmentRow[]]> {
  const map = new Map<string, ScheduleAppointmentRow[]>();
  for (const r of rows) {
    const key = new Date(r.startsAtIso).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return Array.from(map.entries());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReason(r: string): string {
  return r.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
