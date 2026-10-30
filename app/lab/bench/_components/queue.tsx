"use client";

import type { QueueRow } from "../_lib/bench";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { fill, LABWS2 } from "@/content/lab-workspace-v2";
import { formatDuration } from "@/lib/lab/turnaround";
import { cn } from "@/lib/utils";
import { Ident, LatePill, Pill } from "@/components/tide/work/kit";
import { ReceiveRow } from "./receive-row";

const B = LABWS2.bench;

/**
 * The bench queue (prompt 5.5): urgent and late first, as the worklist engine orders it. Each row: name and
 * hospital number, waiting time (amber "Late {n} min" only when the engine says late), test and ward, one pill.
 * The selected row is lagoon-tinted. Keyboard: ↑ ↓ move between rows, Enter opens.
 */
export function Queue({
  rows,
  selected,
  query,
  procedure,
  label,
}: {
  rows: readonly QueueRow[];
  selected: string | null;
  /** Kept on every row link: the stage and section of the view (`?stage=…&section=…`, or ""). */
  query: string;
  procedure: string | null;
  label: string;
}) {
  const router = useRouter();
  const hrefFor = (orderId: string) => `/lab/bench/${orderId}${query}`;
  const list = useRef<HTMLUListElement>(null);
  const move = (from: HTMLElement, by: number) => {
    const links = [...(list.current?.querySelectorAll<HTMLAnchorElement>("a[data-row]") ?? [])];
    const i = links.indexOf(from as HTMLAnchorElement);
    links[Math.max(0, Math.min(links.length - 1, i + by))]?.focus();
  };
  return (
    <ul ref={list} aria-label={label} className="flex flex-col gap-1">
      {rows.map((r) => {
        const on = r.orderId === selected;
        const pill = r.pills[0];
        return (
          <li key={r.orderId}>
            <div
              className={cn(
                "rounded-tide-row flex flex-col gap-1 px-3 py-2.5",
                on
                  ? "bg-tide-lagoon-tint shadow-[inset_0_0_0_1px_var(--tide-lagoon-pressed)]"
                  : "hover:bg-muted",
              )}
            >
              <Link
                data-row
                href={hrefFor(r.orderId)}
                prefetch={false}
                aria-current={on ? "true" : undefined}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(e.currentTarget, 1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(e.currentTarget, -1);
                  } else if (e.key === "Enter") router.push(hrefFor(r.orderId));
                }}
                className="focus-visible:shadow-focus -m-1 flex min-h-11 flex-col gap-1 rounded-[10px] p-1 outline-none"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body-s text-foreground truncate font-semibold">
                      {r.name}
                    </span>
                    <Ident className="text-muted-foreground">{r.mrn}</Ident>
                  </span>
                  {r.lateBy !== null ? (
                    <LatePill>{fill(B.late, { n: r.lateBy })}</LatePill>
                  ) : (
                    <span className="text-caption text-ink-600 shrink-0 tabular-nums">
                      {formatDuration(r.waitingMinutes)}
                    </span>
                  )}
                </span>
                <span className="text-caption text-ink-600 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="text-ink-700">{r.test}</span>
                  {r.from ? <span>· {r.from}</span> : null}
                  {pill ? (
                    <Pill
                      tone={
                        pill === "delta" || pill === "qcHold" || pill === "highRisk"
                          ? "caution"
                          : "neutral"
                      }
                      className="ml-auto"
                    >
                      {B.pills[pill]}
                    </Pill>
                  ) : null}
                </span>
              </Link>
              {r.action === "receive" && r.specimenId ? (
                <ReceiveRow
                  patientUserId={r.patientUserId}
                  specimenId={r.specimenId}
                  highRisk={r.highRisk}
                  procedure={procedure}
                  label={`${r.name}, ${r.test}`}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
