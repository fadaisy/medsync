import type { MedicationRow } from "@/lib/patient/self-tracking";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityIcon, PillIcon, PlusIcon, StickyNoteIcon } from "lucide-react";

import { requirePatientScope } from "@/lib/patient/scope";
import {
  expectedDosesPerDay,
  formatReadingValue,
  listActiveMedications,
  listRecentReadings,
  listTakesToday,
  READING_KIND_LABEL,
  SCHEDULE_PATTERN_LABEL,
} from "@/lib/patient/self-tracking";
import { MarkTakenButton } from "./_components/mark-taken-button";

export const metadata: Metadata = { title: "Track · MedSync" };
export const dynamic = "force-dynamic";

export default async function PatientTrackHub() {
  const scope = await requirePatientScope();
  const [readings, meds, takesToday] = await Promise.all([
    listRecentReadings(scope.userId, 30),
    listActiveMedications(scope.userId),
    listTakesToday(scope.userId),
  ]);

  const takesByMed = new Map<string, number>();
  for (const t of takesToday) {
    takesByMed.set(t.medicationId, (takesByMed.get(t.medicationId) ?? 0) + 1);
  }

  return (
    <div className="stagger-children relative mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div
        aria-hidden
        className="bg-brand-500/5 dark:bg-brand-400/4 pointer-events-none absolute -top-20 left-1/2 -z-10 h-56 w-md max-w-full -translate-x-1/2 rounded-full blur-3xl"
      />
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          Your tracking
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
          Day to day
        </h1>
        <p className="text-muted-foreground text-body-s max-w-[44ch] leading-relaxed">
          For your own tracking — not yet shared with a clinician.
        </p>
      </header>

      {/* ── Primary CTAs ──────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-2">
        <Link
          href="/patient/track/log"
          className="bg-foreground text-background hover:bg-foreground/90 group tap flex h-full flex-col gap-2 rounded-xl p-4 transition-colors"
        >
          <span
            aria-hidden
            className="bg-background/15 text-background inline-flex size-8 items-center justify-center rounded-full"
          >
            <PlusIcon className="size-4" />
          </span>
          <span className="flex flex-col">
            <span className="text-[13.5px] font-medium">Log a reading</span>
            <span className="text-background/70 text-caption">Glucose, BP, weight…</span>
          </span>
        </Link>
        <Link
          href="/patient/track/medications"
          className="group border-border bg-card hover:bg-muted/30 hover:border-foreground/15 card-lift tap flex h-full flex-col gap-2 rounded-xl border p-4"
        >
          <span
            aria-hidden
            className="bg-muted text-foreground/80 inline-flex size-8 items-center justify-center rounded-full"
          >
            <PillIcon className="size-4" />
          </span>
          <span className="flex flex-col">
            <span className="text-foreground text-[13.5px] font-medium">Medications</span>
            <span className="text-muted-foreground text-caption">
              {meds.length > 0 ? `${meds.length} active` : "Add what you take"}
            </span>
          </span>
        </Link>
      </section>

      {/* ── Active medications + today's doses ────────────────── */}
      {meds.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Today&rsquo;s medications
          </h2>
          <ul className="border-border bg-card divide-border/60 divide-y overflow-hidden rounded-xl border">
            {meds.map((m) => (
              <li key={m.id} className="hover:bg-muted/30 transition-colors">
                <MedRow med={m} takenCount={takesByMed.get(m.id) ?? 0} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Recent readings ───────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Recent readings
          </h2>
          {readings.length > 0 ? (
            <span className="text-muted-foreground text-caption font-mono tabular-nums">
              {readings.length} {readings.length === 1 ? "entry" : "entries"}
            </span>
          ) : null}
        </div>
        {readings.length === 0 ? (
          <EmptyReadings />
        ) : (
          <ul className="stagger-children flex flex-col gap-2">
            {readings.map((r) => (
              <li
                key={r.id}
                className="border-border bg-card rounded-xl border p-3.5 transition-colors hover:border-gray-300"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground text-[11.5px]">
                    {READING_KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                  <span className="text-muted-foreground text-caption font-mono tabular-nums">
                    {formatReadingDate(r.recordedAtIso)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-foreground font-mono text-[16px] font-medium tabular-nums">
                    {formatReadingValue(r) ??
                      (r.note ? truncate(r.note, 64) : <em className="font-normal">—</em>)}
                  </span>
                  {r.severity ? (
                    <span className="text-caption font-mono text-amber-700 tabular-nums dark:text-amber-300">
                      severity {r.severity}/5
                    </span>
                  ) : null}
                </div>
                {r.note && r.kind !== "note" ? (
                  <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">
                    {r.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ── Med row ──────────────────────────────────────────────────── */

function MedRow({ med, takenCount }: { med: MedicationRow; takenCount: number }) {
  const expected = expectedDosesPerDay(med.schedulePattern);
  const adherenceLabel =
    expected > 0
      ? `${takenCount}/${expected} taken`
      : takenCount > 0
        ? `${takenCount} taken`
        : SCHEDULE_PATTERN_LABEL[med.schedulePattern];

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-foreground truncate text-[14px] font-medium">{med.name}</span>
        <span className="text-muted-foreground truncate text-[12px]">
          {[med.dose, SCHEDULE_PATTERN_LABEL[med.schedulePattern]].filter(Boolean).join(" · ")}
        </span>
        <span className="text-muted-foreground/80 mt-0.5 font-mono text-[10.5px] tabular-nums">
          {adherenceLabel}
        </span>
      </div>
      <MarkTakenButton
        medicationId={med.id}
        label="Take"
        completedLabel="Taken"
        showCompleted={
          expected > 0
            ? takenCount >= expected
            : med.schedulePattern === "as_needed"
              ? false
              : takenCount > 0
        }
      />
    </div>
  );
}

/* ── Readings empty state ─────────────────────────────────────── */

function EmptyReadings() {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5">
      {/* Quiet flatline-to-be: a dotted baseline waiting for its first point. */}
      <svg
        viewBox="0 0 320 40"
        aria-hidden
        className="text-muted-foreground/40 h-10 w-full"
        fill="none"
      >
        <path
          d="M4 28 H316"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="1 7"
        />
        <circle cx="48" cy="28" r="3" className="fill-brand-500/60" />
      </svg>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="scale-in bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1"
        >
          <ActivityIcon className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-foreground text-[13.5px] font-medium">Nothing logged yet</span>
          <p className="text-muted-foreground max-w-[44ch] text-[12px] leading-relaxed">
            Log your first reading to start building a picture. Even one entry a day adds up quickly
            when you look back at the week.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 pl-12">
        <Link
          href="/patient/track/log"
          className="text-foreground border-foreground/15 hover:border-foreground/30 hover:bg-muted/40 tap inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors"
        >
          <PlusIcon className="size-3.5" aria-hidden />
          Log a reading
        </Link>
        <Link
          href="/patient/track/log?kind=note"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12px] transition-colors"
        >
          <StickyNoteIcon className="size-3.5" aria-hidden />
          Add a note instead
        </Link>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function formatReadingDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}
