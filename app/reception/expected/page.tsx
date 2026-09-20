import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, ClockIcon } from "lucide-react";

import { SectionRule } from "@/components/medsync/panel";
import { Pill } from "@/components/ui/pill";
import {
  fetchDeclaredIntakesToday,
  fetchExpectedArrivals,
  fetchExpectedCountsByDay,
  fetchProvisional,
  fetchQueueForDay,
  fetchReconciliationCandidates,
} from "@/lib/reception/queries";
import { requireReceptionScope } from "@/lib/reception/scope";
import { DEFAULT_TIME_ZONE, localDateKey } from "@/supabase/functions/_shared/slots";
import { AutoRefresh } from "../_components/auto-refresh";
import { CheckInDeclaredButton } from "../_components/check-in-declared-button";
import { DayStrip, formatDayKey, weekOf } from "../_components/day-strip";
import { CheckInButton } from "./_components/check-in-button";
import { NoShowButton } from "./_components/no-show-button";
import { QueuePanel } from "./_components/queue-panel";
import { ReconcilePanel } from "./_components/reconcile-panel";

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
  searchParams: Promise<{ date?: string; reconcile?: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReceptionExpectedPage({ searchParams }: PageProps) {
  const { date: dateParam, reconcile } = await searchParams;
  const scope = await requireReceptionScope();
  const parsed = dateParam ? new Date(dateParam) : undefined;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
  // One clock read: the rows' "time has passed" test and the day window agree.
  const now = new Date();
  const todayKey = localDateKey(now, DEFAULT_TIME_ZONE);
  const selectedKey = date ? localDateKey(date, DEFAULT_TIME_ZONE) : todayKey;
  const when = selectedKey === todayKey ? "today" : selectedKey < todayKey ? "past" : "future";
  const week = weekOf(date ?? now);
  // The panel is opened from a row, one provisional at a time — candidates
  // are a decrypt scan, not something to run for every row on every poll.
  const reconcileId = reconcile && UUID.test(reconcile) ? reconcile : null;

  const [rows, declared, provisional, candidates, weekCounts, queue] = await Promise.all([
    fetchExpectedArrivals({
      hospitalId: scope.hospitalId,
      receptionUserId: scope.userId,
      date,
      limit: 200,
    }),
    // Patient-declared queue tickets that haven't been checked in yet.
    // Reception flips them to 'arrived' via the same Edge Function as
    // booked-arrival check-in (intake_id branch). Migration 0035.
    when === "today"
      ? fetchDeclaredIntakesToday({
          hospitalId: scope.hospitalId,
          receptionUserId: scope.userId,
          limit: 100,
        })
      : Promise.resolve([]),
    reconcileId
      ? fetchProvisional({ hospitalId: scope.hospitalId, provisionalPatientId: reconcileId })
      : Promise.resolve(null),
    reconcileId
      ? fetchReconciliationCandidates({
          hospitalId: scope.hospitalId,
          receptionUserId: scope.userId,
          provisionalPatientId: reconcileId,
        })
      : Promise.resolve([]),
    fetchExpectedCountsByDay({ hospitalId: scope.hospitalId, from: week.mondayStart, days: 7 }),
    // A future day has no intakes; the panel says so from the week's count.
    when === "future"
      ? Promise.resolve([])
      : fetchQueueForDay({ hospitalId: scope.hospitalId, date: date ?? now }),
  ]);
  const dayLabel = formatDayKey(selectedKey);
  const expectedOnDay = weekCounts.find((c) => c.dateKey === selectedKey)?.expected ?? 0;

  return (
    <div className="stagger-children mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:py-10">
      <Link
        href="/reception"
        className="text-muted-foreground hover:text-foreground text-body-s ease-expo-out group inline-flex w-fit items-center gap-1 transition-colors duration-150"
      >
        <ArrowLeftIcon
          className="ease-expo-out size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
          aria-hidden
        />
        Today
      </Link>

      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground text-overline inline-flex items-center gap-1.5 font-mono uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          {scope.hospitalName} · Expected arrivals
        </span>
        <h1 className="font-display text-foreground text-heading-l">Booked patients</h1>
        <p className="text-muted-foreground text-body-s max-w-[60ch] leading-relaxed">
          When a patient arrives, hit <span className="font-mono">Check in</span> — they enter the
          queue + appear on the receiving team&rsquo;s board.
        </p>
        {/* Not while the panel is open: each refresh would re-run the
            candidate scan and write another audit row per name. */}
        {provisional ? null : <AutoRefresh />}
      </header>

      {provisional ? <ReconcilePanel provisional={provisional} candidates={candidates} /> : null}

      <DayStrip
        counts={weekCounts}
        selectedKey={selectedKey}
        todayKey={todayKey}
        prevKey={week.prevKey}
        nextKey={week.nextKey}
      />

      {/* The day's board beside its queue; below xl they stack. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <SectionRule
            title={`Expected · ${dayLabel}`}
            action={
              <span className="text-muted-foreground text-caption font-mono tabular-nums">
                {rows.length} booked
              </span>
            }
          />

          {/* ── Patient-declared queue tickets today ─────────── */}
          {declared.length > 0 ? (
            <section aria-labelledby="declared-heading" className="flex flex-col gap-2">
              <h2
                id="declared-heading"
                className="text-muted-foreground text-overline inline-flex items-center gap-1.5 font-mono uppercase"
              >
                <ClockIcon className="size-3.5" aria-hidden />
                Declared today · awaiting check-in ({declared.length})
              </h2>
              <p className="text-muted-foreground text-caption leading-relaxed">
                These patients used the MedSync app to say they&rsquo;re coming in today.
                They&rsquo;re in line but not here yet — check them in when they arrive. Ask for the
                name: the code is on their phone, which may be at home.
              </p>
              <ul className="divide-border/60 border-border bg-card divide-y overflow-hidden rounded-xl border">
                {declared.map((d) => (
                  <li
                    key={d.id}
                    className="hover:bg-brand-50/40 ease-expo-out flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-foreground text-body-s truncate font-medium">
                        {d.displayName ?? d.patientCode ?? "Unknown patient"}
                      </span>
                      <span className="text-muted-foreground text-caption truncate font-mono tabular-nums">
                        {[
                          d.displayName ? d.patientCode : null,
                          `declared ${formatTime(d.declaredAtIso)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="text-muted-foreground text-caption">
                        {d.departmentName ?? "—"}
                        {d.presentingComplaint ? ` · "${truncate(d.presentingComplaint, 80)}"` : ""}
                      </span>
                    </div>
                    <CheckInDeclaredButton
                      intakeId={d.id}
                      patientLabel={d.displayName ?? d.patientCode ?? "unknown patient"}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {rows.length === 0 ? (
            <div className="border-border bg-card flex items-center gap-5 rounded-xl border p-6">
              <svg viewBox="0 0 96 56" aria-hidden className="text-border h-12 w-auto shrink-0">
                <rect x="0" y="2" width="84" height="10" rx="4" fill="currentColor" opacity="0.5" />
                <rect
                  x="0"
                  y="20"
                  width="64"
                  height="10"
                  rx="4"
                  fill="currentColor"
                  opacity="0.3"
                />
                <rect
                  x="0"
                  y="38"
                  width="44"
                  height="10"
                  rx="4"
                  fill="currentColor"
                  opacity="0.15"
                />
                <circle cx="89" cy="43" r="5" className="text-brand-500/30" fill="currentColor" />
              </svg>
              <p className="text-muted-foreground text-body-s">
                No bookings for {when === "today" ? "today" : dayLabel}. Booked patients appear here
                as appointments are confirmed.
              </p>
            </div>
          ) : (
            <div className="border-border bg-card overflow-x-auto rounded-xl border">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  Booked appointments, earliest first. Each row carries its status and a check-in
                  control; a confirmed booking whose time has passed also offers no-show.
                </caption>
                <thead className="border-border bg-muted/30 border-b">
                  <tr className="text-muted-foreground text-overline font-mono uppercase">
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      Time
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      Patient
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      <abbr title="Position in the clinic day" className="no-underline">
                        Pos.
                      </abbr>
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      Clinician · Department
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      <span className="sr-only">Check in</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border/60 divide-y">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-brand-50/40 ease-expo-out transition-colors duration-150"
                    >
                      <td className="text-foreground text-body-s px-4 py-2.5 font-mono tabular-nums">
                        {formatTime(r.startsAtIso)}
                      </td>
                      <td className="text-foreground text-body-s px-4 py-2.5">
                        {r.patientCode ? (
                          <span className="font-mono tabular-nums">{r.patientCode}</span>
                        ) : r.provisional ? (
                          // A booking with no patient record yet. The declared
                          // name is the audited reveal; the words say the state.
                          <span className="flex flex-col gap-1">
                            <span className="font-medium">{r.provisional.declaredName ?? "—"}</span>
                            <Pill tone="pending">
                              {r.provisional.state === "rejected"
                                ? "Not matched · register"
                                : "Identity to confirm"}
                            </Pill>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-foreground text-body-s px-4 py-2.5 font-mono tabular-nums">
                        {r.positionNumber ?? "—"}
                      </td>
                      <td className="text-foreground text-body-s px-4 py-2.5">
                        {r.clinicianName ?? "—"}
                        {r.departmentName ? (
                          <span className="text-muted-foreground"> · {r.departmentName}</span>
                        ) : null}
                        {r.type === "virtual" ? (
                          <span className="text-muted-foreground/80 text-overline ml-2 font-mono uppercase">
                            virtual
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {/* Neutral for every status. `stable` and `admitted` mean
                        vitals and a bed; an appointment status knows neither,
                        and the Check in / Checked in control beside it already
                        says whether this patient is in the building. */}
                        <Pill tone="neutral">
                          {r.seen ? "Seen" : (STATUS_LABEL[r.status] ?? r.status)}
                        </Pill>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          {r.patientCode === null && r.provisional ? (
                            // Check-in is refused until the desk says who this is
                            // (ha-check-in-patient, 409). Offer the honest step.
                            r.provisional.state === "unreconciled" ? (
                              <Link
                                href={`/reception/expected?reconcile=${r.provisional.id}`}
                                className="text-foreground border-foreground/15 hover:border-foreground/30 hover:bg-muted/40 text-body-s ease-expo-out tap inline-flex min-h-11 items-center rounded-full border px-4 whitespace-nowrap transition-colors duration-150"
                              >
                                Confirm identity
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-caption whitespace-nowrap">
                                Register at the desk
                              </span>
                            )
                          ) : (
                            <>
                              {r.status === "confirmed" && new Date(r.startsAtIso) < now ? (
                                <NoShowButton
                                  appointmentId={r.id}
                                  patientLabel={r.patientCode ?? "this patient"}
                                />
                              ) : null}
                              <CheckInButton
                                appointmentId={r.id}
                                alreadyArrived={ARRIVED_STATES.has(r.status)}
                                patientLabel={r.patientCode ?? "this patient"}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <QueuePanel rows={queue} when={when} expected={expectedOnDay} />
      </div>

      <p className="text-muted-foreground/80 text-caption leading-relaxed">
        Reception sees operational + demographic data, never clinical content. Names on the declared
        list are decrypted so you can match the person at the desk — each one is recorded against
        your account, as is every check-in.
      </p>
    </div>
  );
}

/** The hospital's clock, 24-hour — not the host's (UTC on Vercel). */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: DEFAULT_TIME_ZONE,
  });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}
