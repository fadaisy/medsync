import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, ClockIcon } from "lucide-react";

import { fetchDeclaredIntakesToday, fetchExpectedArrivals } from "@/lib/reception/queries";
import { requireReceptionScope } from "@/lib/reception/scope";
import { CheckInButton } from "./_components/check-in-button";
import { CheckInDeclaredButton } from "./_components/check-in-declared-button";

export const metadata: Metadata = { title: "Expected · Reception · MedSync" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pending_approval: "Awaiting approval",
  confirmed: "Confirmed",
  arrived: "Arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  rescheduled: "Rescheduled",
};

const ARRIVED_STATES = new Set(["arrived", "in_progress", "completed"]);

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function ReceptionExpectedPage({ searchParams }: PageProps) {
  const { date: dateParam } = await searchParams;
  const scope = await requireReceptionScope();
  const date = dateParam ? new Date(dateParam) : undefined;

  const [rows, declared] = await Promise.all([
    fetchExpectedArrivals({
      hospitalId: scope.hospitalId,
      date,
      limit: 200,
    }),
    // Patient-declared queue tickets that haven't been checked in yet.
    // Reception flips them to 'arrived' via the same Edge Function as
    // booked-arrival check-in (intake_id branch). Migration 0035.
    !date || isToday(date)
      ? fetchDeclaredIntakesToday({ hospitalId: scope.hospitalId, limit: 100 })
      : Promise.resolve([]),
  ]);

  return (
    <div className="stagger-children mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:py-10">
      <Link
        href="/reception"
        className="text-muted-foreground hover:text-foreground group inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon
          className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
          aria-hidden
        />
        Today
      </Link>

      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · Expected arrivals
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-[1.15] font-medium tracking-[-0.015em]">
          Today&rsquo;s booked patients
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          When a patient arrives, hit <span className="font-mono">Check in</span> — they enter the
          queue + appear on the receiving team&rsquo;s board.
        </p>
      </header>

      {/* ── Patient-declared queue tickets today ─────────── */}
      {declared.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] uppercase">
            <ClockIcon className="size-3.5" aria-hidden />
            Declared today · awaiting check-in ({declared.length})
          </h2>
          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            These patients used the MedSync app to say they&rsquo;re coming in today. They&rsquo;re
            in line but not here yet — check them in when they arrive.
          </p>
          <ul className="divide-border/60 border-border bg-card divide-y overflow-hidden rounded-xl border">
            {declared.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-teal-50/40 dark:hover:bg-teal-950/15"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-foreground inline-flex items-center gap-2 text-[13px]">
                    <span className="font-mono tabular-nums">
                      {d.patientCode ?? "Unknown patient"}
                    </span>
                    <span className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
                      · declared {formatTime(d.declaredAtIso)}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-[11.5px]">
                    {d.departmentName ?? "—"}
                    {d.presentingComplaint ? ` · "${truncate(d.presentingComplaint, 80)}"` : ""}
                  </span>
                </div>
                <CheckInDeclaredButton intakeId={d.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className="border-border bg-card flex items-center gap-5 rounded-xl border p-6">
          <svg viewBox="0 0 96 56" aria-hidden className="text-border h-12 w-auto shrink-0">
            <rect x="0" y="2" width="84" height="10" rx="4" fill="currentColor" opacity="0.5" />
            <rect x="0" y="20" width="64" height="10" rx="4" fill="currentColor" opacity="0.3" />
            <rect x="0" y="38" width="44" height="10" rx="4" fill="currentColor" opacity="0.15" />
            <circle cx="89" cy="43" r="5" className="text-teal-500/30" fill="currentColor" />
          </svg>
          <p className="text-muted-foreground text-[13px]">
            No bookings for today. Booked patients appear here as appointments are confirmed.
          </p>
        </div>
      ) : (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <table className="w-full border-collapse text-left">
            <thead className="border-border bg-muted/30 border-b">
              <tr className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
                <th scope="col" className="px-4 py-2.5 font-normal">
                  Time
                </th>
                <th scope="col" className="px-4 py-2.5 font-normal">
                  Patient
                </th>
                <th scope="col" className="px-4 py-2.5 font-normal">
                  Clinician · Department
                </th>
                <th scope="col" className="px-4 py-2.5 font-normal">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-border/60 divide-y">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-teal-50/40 dark:hover:bg-teal-950/15"
                >
                  <td className="text-foreground px-4 py-2.5 font-mono text-[12.5px] tabular-nums">
                    {formatTime(r.startsAtIso)}
                  </td>
                  <td className="text-foreground px-4 py-2.5 font-mono text-[12.5px] tabular-nums">
                    {r.patientCode}
                  </td>
                  <td className="text-foreground px-4 py-2.5 text-[12.5px]">
                    {r.clinicianName ?? "—"}
                    {r.departmentName ? (
                      <span className="text-muted-foreground"> · {r.departmentName}</span>
                    ) : null}
                    {r.type === "virtual" ? (
                      <span className="text-muted-foreground/80 ml-2 font-mono text-[10px] uppercase">
                        virtual
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-muted-foreground bg-muted inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px]">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <CheckInButton
                      appointmentId={r.id}
                      alreadyArrived={ARRIVED_STATES.has(r.status)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="fade-in-slow text-muted-foreground/80 text-[11px] leading-relaxed">
        Patient codes only — reception sees operational + demographic data, never clinical content.
        Every check-in is audited.
      </p>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function isToday(d: Date): boolean {
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}
