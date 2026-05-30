import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { fetchTodayFlow } from "@/lib/reception/queries";
import { requireReceptionScope } from "@/lib/reception/scope";

export const metadata: Metadata = { title: "Flow · Reception · MedSync" };
export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  declared: "Declared",
  expected: "Expected",
  arrived: "Arrived",
  in_queue: "In queue",
  awaiting_triage: "Awaiting triage",
};

const STAGE_TONE: Record<string, string> = {
  // 'declared' = patient said they're coming, not here yet. Muted
  // teal so it's visibly different from 'arrived' (solid teal) — the
  // pre-queued/arrived distinction must be unmistakable.
  declared:
    "bg-teal-50/60 text-teal-700 ring-1 ring-teal-200/60 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-800/40",
  expected: "bg-muted text-muted-foreground",
  arrived: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  in_queue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  awaiting_triage: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

export default async function ReceptionFlowPage() {
  const scope = await requireReceptionScope();
  const rows = await fetchTodayFlow({ hospitalId: scope.hospitalId, limit: 100 });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:py-10">
      <Link
        href="/reception"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        Today
      </Link>

      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · Today&rsquo;s flow
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-[1.15] font-medium tracking-[-0.015em]">
          Who&rsquo;s where
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          Operational status only — answers &ldquo;has Mr. X arrived?&rdquo;, &ldquo;where is my
          patient in the queue?&rdquo;. No clinical detail.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="border-border bg-card rounded-xl border p-6">
          <p className="text-muted-foreground text-[13px]">No activity yet today.</p>
        </div>
      ) : (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <table className="w-full border-collapse text-left">
            <thead className="border-border bg-muted/30 border-b">
              <tr className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
                <th scope="col" className="px-4 py-2.5 font-normal">
                  Patient
                </th>
                <th scope="col" className="px-4 py-2.5 font-normal">
                  Stage
                </th>
                <th scope="col" className="px-4 py-2.5 font-normal">
                  Where
                </th>
                <th scope="col" className="px-4 py-2.5 font-normal">
                  When
                </th>
                <th scope="col" className="px-4 py-2.5 font-normal">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody className="divide-border/60 divide-y">
              {rows.map((r, i) => {
                const who = r.patientCode ?? r.patientUnknownLabel ?? "—";
                return (
                  <tr
                    key={`${r.patientUserId ?? "unknown"}-${i}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="text-foreground px-4 py-2.5 font-mono text-[12.5px] tabular-nums">
                      {who}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STAGE_TONE[r.stage] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {STAGE_LABEL[r.stage] ?? r.stage}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-[12px]">
                      {r.departmentName ?? "—"}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 font-mono text-[11.5px] tabular-nums">
                      {formatTime(r.whenIso)}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-[11.5px]">{r.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
