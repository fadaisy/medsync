import type { PillTone } from "@/components/ui/data-table";
import type { TrackingGlance } from "@/lib/patient/self-tracking";
import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import {
  ActivityIcon,
  BuildingIcon,
  CalendarPlusIcon,
  HospitalIcon,
  PlusIcon,
  TicketIcon,
} from "lucide-react";

import { Pill } from "@/components/ui/data-table";
import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { appointments } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { requirePatientScope } from "@/lib/patient/scope";
import {
  fetchTrackingGlance,
  formatReadingValue,
  READING_KIND_LABEL,
} from "@/lib/patient/self-tracking";

export const metadata: Metadata = { title: "Home · MedSync" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, PillTone> = {
  requested: "pending",
  pending_approval: "pending",
  confirmed: "stable",
  arrived: "admitted",
  in_progress: "admitted",
  completed: "discharged",
  cancelled: "neutral",
  no_show: "caution",
  rescheduled: "neutral",
  declined: "critical",
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pending_approval: "Awaiting approval",
  confirmed: "Confirmed",
  arrived: "You've arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Missed",
  rescheduled: "Rescheduled",
  declined: "Declined",
};

export default async function PatientHome() {
  const scope = await requirePatientScope();
  const [upcoming, glance] = await Promise.all([
    scope.primaryHospitalId ? fetchUpcoming(scope.userId) : Promise.resolve([]),
    fetchTrackingGlance(scope.userId),
  ]);

  const firstName = scope.fullName?.split(" ")[0];

  return (
    <div className="stagger-children relative mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      {/* Quiet teal atmosphere behind the greeting — 90% monochrome rule intact. */}
      <div
        aria-hidden
        className="bg-brand-500/5 dark:bg-brand-400/4 pointer-events-none absolute -top-24 left-1/2 -z-10 h-64 w-md max-w-full -translate-x-1/2 rounded-full blur-3xl"
      />
      {/* ── Greeting ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          MedSync · Your space
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[30px]">
          {firstName ? `Hello, ${firstName}.` : "Hello."}
        </h1>
        <p className="text-muted-foreground text-body-s max-w-[44ch] leading-relaxed">
          {scope.primaryHospitalName
            ? `${scope.primaryHospitalName} is your primary hospital. Track how you're doing, see your visits, and book when you need to.`
            : "This is your private workspace. Track how you're doing day to day; when you're ready, connect to a hospital."}
        </p>
      </section>

      {/* ── Connection-state banner ───────────────────────────── */}
      <ConnectionBanner
        primaryHospitalName={scope.primaryHospitalName}
        primaryHospitalSlug={scope.primaryHospitalSlug}
      />

      {/* ── Today's tracking glance ───────────────────────────── */}
      <TrackingGlanceCard glance={glance} />

      {/* ── Quick actions ─────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Quick actions
        </h2>
        <ul className="grid grid-cols-2 gap-2">
          <QuickAction
            href="/patient/track/log"
            label="Log a reading"
            sub="Glucose, BP, weight…"
            Icon={PlusIcon}
            tone="primary"
          />
          <QuickAction
            href="/patient/track"
            label="See trends"
            sub="Your readings over time"
            Icon={ActivityIcon}
            tone="muted"
          />
          {scope.primaryHospitalId ? (
            <>
              <QuickAction
                href="/patient/book"
                label="Book a visit"
                sub="Pick a future date"
                Icon={CalendarPlusIcon}
                tone="muted"
              />
              <QuickAction
                href="/patient/queue"
                label="Join today's queue"
                sub="You're coming in today"
                Icon={TicketIcon}
                tone="muted"
              />
            </>
          ) : (
            <>
              <QuickAction
                href="/patient/hospitals"
                label="Browse hospitals"
                sub="Find one near you"
                Icon={BuildingIcon}
                tone="muted"
              />
              <QuickAction
                href="/patient/track/medications"
                label="My medications"
                sub="Self-managed list"
                Icon={ActivityIcon}
                tone="muted"
              />
            </>
          )}
        </ul>
      </section>

      {/* ── Upcoming visits (affiliated only) ─────────────────── */}
      {scope.primaryHospitalId ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
              Upcoming
            </h2>
            {upcoming.length > 0 ? (
              <Link
                href="/patient/appointments"
                className="text-muted-foreground hover:text-foreground text-[11.5px] transition-colors"
              >
                See all →
              </Link>
            ) : null}
          </div>
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground border-border bg-card rounded-xl border p-4 text-[12.5px] leading-relaxed">
              Nothing on your schedule. When you book, the next visit lands here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link
                    href="/patient/appointments"
                    className="border-border bg-card hover:bg-muted/30 card-lift hover:border-brand-500/40 flex flex-col gap-2 rounded-xl border p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground text-[14px] font-medium">
                        {a.clinicianName}
                      </span>
                      <Pill tone={STATUS_TONES[a.status] ?? "neutral"}>
                        {STATUS_LABEL[a.status] ?? a.status}
                      </Pill>
                    </div>
                    <p className="text-muted-foreground text-[12.5px]">
                      {a.departmentName} · {a.type === "virtual" ? "Virtual" : "In-person"}
                    </p>
                    <p className="text-foreground font-mono text-[12px] tabular-nums">
                      {formatWhen(a.startsAtIso)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

/* ── Connection-state banner ──────────────────────────────────── */

function ConnectionBanner({
  primaryHospitalName,
}: {
  primaryHospitalName: string | null;
  primaryHospitalSlug: string | null;
}) {
  if (primaryHospitalName) {
    return (
      <div className="border-border bg-card flex items-center justify-between gap-3 rounded-xl border p-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1"
          >
            <HospitalIcon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.14em] uppercase">
              Connected to
            </span>
            <span className="text-foreground truncate text-[13.5px] font-medium">
              {primaryHospitalName}
            </span>
          </div>
        </div>
        <Link
          href="/patient/hospitals"
          className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-[11.5px] transition-colors"
        >
          Change
        </Link>
      </div>
    );
  }

  // Unaffiliated — invite, not warn. The kickoff calls for "calm
  // wellbeing tone, encouraging not shaming." A brand-tinted card with
  // a single primary CTA carries the weight without an alert chrome.
  return (
    <Link
      href="/patient/hospitals"
      className="group card-lift border-brand-500/30 from-brand-50/80 via-brand-50/40 hover:border-brand-500/60 dark:border-brand-400/20 dark:from-brand-950/30 dark:via-brand-950/15 relative overflow-hidden rounded-xl border bg-linear-to-br to-transparent p-4 dark:to-transparent"
    >
      <div
        aria-hidden
        className="bg-brand-500/10 dark:bg-brand-400/10 absolute -top-12 -right-12 size-32 rounded-full blur-2xl transition-opacity group-hover:opacity-80"
      />
      <div className="relative flex items-start gap-3">
        <span
          aria-hidden
          className="text-brand-700 ring-brand-200/80 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/80 ring-1"
        >
          <HospitalIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-foreground text-[16px] font-medium tracking-[-0.005em]">
            Connect to a hospital
          </span>
          <span className="text-muted-foreground max-w-[44ch] text-[12.5px] leading-relaxed">
            Pick a MedSync hospital as your primary. You can book appointments and, when a clinician
            connects, see your records here.
          </span>
          <span className="text-brand-700 dark:text-brand-300 mt-1 inline-flex items-center gap-1 text-[12px] font-medium">
            Browse hospitals
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ── Today's tracking glance ───────────────────────────────────── */

function TrackingGlanceCard({ glance }: { glance: TrackingGlance }) {
  const hasReading = !!glance.latestReading;
  const hasMeds = glance.activeMedicationCount > 0;

  if (!hasReading && !hasMeds) {
    // Calm, honest empty state. The kickoff is explicit that the
    // home must be useful in the unaffiliated/empty state — so we
    // make logging feel like the natural next step, not a chore.
    return (
      <section className="border-border bg-card relative overflow-hidden rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1"
          >
            <ActivityIcon className="size-4" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-foreground text-[13.5px] font-medium">Nothing logged yet</span>
            <span className="text-muted-foreground max-w-[44ch] text-[12px] leading-relaxed">
              When you log a reading or add a medicine, today&rsquo;s snapshot will live here. It
              stays private until you decide otherwise.
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Today
        </span>
        <Link
          href="/patient/track"
          className="text-muted-foreground hover:text-foreground text-[11.5px] transition-colors"
        >
          Full view →
        </Link>
      </div>

      {hasReading ? <LatestReadingRow latest={glance.latestReading!} /> : null}

      {hasMeds ? (
        <div className="border-border/60 flex items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-[11.5px]">Medications</span>
            <span className="text-foreground text-body-s font-medium">
              {glance.takesToday > 0
                ? `${glance.takesToday} dose${glance.takesToday === 1 ? "" : "s"} taken today`
                : "Nothing taken yet today"}
            </span>
          </div>
          <span className="text-muted-foreground text-caption font-mono tabular-nums">
            {glance.activeMedicationCount} active
          </span>
        </div>
      ) : null}
    </section>
  );
}

function LatestReadingRow({ latest }: { latest: NonNullable<TrackingGlance["latestReading"]> }) {
  const label = READING_KIND_LABEL[latest.kind] ?? "Reading";
  const value = formatReadingValue(latest);
  const when = formatRelative(latest.recordedAtIso);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-muted-foreground text-[11.5px]">{label}</span>
        <span className="text-foreground font-mono text-[16px] font-medium tabular-nums">
          {value ?? (latest.note ? truncate(latest.note, 40) : "—")}
        </span>
      </div>
      <span className="text-muted-foreground text-caption shrink-0 font-mono tabular-nums">
        {when}
      </span>
    </div>
  );
}

/* ── Quick action card ─────────────────────────────────────────── */

function QuickAction({
  href,
  label,
  sub,
  Icon,
  tone,
}: {
  href: string;
  label: string;
  sub: string;
  Icon: typeof PlusIcon;
  tone: "primary" | "muted";
}) {
  return (
    <li>
      <Link
        href={href}
        className={
          tone === "primary"
            ? "group bg-foreground text-background hover:bg-foreground/90 tap flex h-full flex-col gap-2 rounded-xl p-3.5 transition-colors"
            : "group border-border bg-card hover:bg-muted/30 hover:border-foreground/15 card-lift tap flex h-full flex-col gap-2 rounded-xl border p-3.5"
        }
      >
        <span
          aria-hidden
          className={
            tone === "primary"
              ? "bg-background/15 text-background inline-flex size-7 items-center justify-center rounded-full"
              : "bg-muted text-foreground/80 inline-flex size-7 items-center justify-center rounded-full"
          }
        >
          <Icon className="size-3.5" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-body-s font-medium">{label}</span>
          <span
            className={
              tone === "primary"
                ? "text-background/70 text-caption leading-tight"
                : "text-muted-foreground text-caption leading-tight"
            }
          >
            {sub}
          </span>
        </span>
      </Link>
    </li>
  );
}

/* ── Data fetchers + format helpers ────────────────────────────── */

interface UpcomingRow {
  id: string;
  startsAtIso: string;
  status: string;
  type: string;
  clinicianName: string;
  departmentName: string;
}

async function fetchUpcoming(patientUserId: string): Promise<UpcomingRow[]> {
  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      type: appointments.type,
      clinicianName: users.fullName,
      departmentName: hospitalDepartments.name,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.clinicianUserId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    .where(
      and(
        eq(appointments.patientUserId, patientUserId),
        gte(appointments.startsAt, new Date()),
        inArray(appointments.status, [
          "requested",
          "pending_approval",
          "confirmed",
          "arrived",
          "in_progress",
        ]),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(3);

  return rows.map((r) => ({
    id: r.id,
    startsAtIso: r.startsAt.toISOString(),
    status: r.status,
    type: r.type,
    clinicianName: r.clinicianName ?? "Your clinician",
    departmentName: r.departmentName,
  }));
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}
