import type { Metadata } from "next";
import Link from "next/link";
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CheckSquareIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  ListChecksIcon,
  StethoscopeIcon,
  UsersIcon,
} from "lucide-react";

import { IncomingIntakesPanel } from "@/components/intake/incoming-panel";
import {
  getMySupervisor,
  listMyCosignRequests,
  listPendingCosignRequests,
} from "@/lib/doctor/cosign";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { fetchHospitalIncomingIntakes } from "@/lib/intake/queries";

export const metadata: Metadata = { title: "Overview · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Doctor workspace overview — different shapes per cadre:
 *
 *   Junior (intern / clinical officer):
 *     - Supervisor card (who supervises me)
 *     - My pending co-sign requests (decisions outstanding)
 *
 *   Senior (MO+):
 *     - Pending review queue count (drills into /doctor/cosign-queue)
 *
 *   Consultant (MOSG / Consultant / Senior Consultant):
 *     - Supervisees card + review queue
 *
 * The "directional" surface cards land for everyone (patient panel +
 * placeholders for engines that haven't shipped).
 */
export default async function DoctorOverviewPage() {
  const scope = await requireDoctorScope();
  const firstName = scope.fullName?.split(" ")[0];

  // Cadre-conditional fetches + the dept incoming-intake list.
  const [supervisor, myRequests, pendingForMe, incoming] = await Promise.all([
    scope.isJunior ? getMySupervisor({ superviseeAffiliationId: scope.affiliationId }) : null,
    scope.isJunior
      ? listMyCosignRequests({
          doctorUserId: scope.userId,
          hospitalId: scope.hospitalId,
          limit: 5,
        })
      : [],
    scope.isSenior ? listPendingCosignRequests({ hospitalId: scope.hospitalId }) : [],
    fetchHospitalIncomingIntakes({
      hospitalId: scope.hospitalId,
      departmentId: scope.departmentId,
      limit: 10,
    }),
  ]);

  return (
    <div className="relative">
      {/* Quiet teal atmosphere behind the header */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(90%_100%_at_50%_0%,rgba(13,148,136,0.05),transparent_70%)]"
      />

      <div className="stagger-children relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 lg:py-10">
        <header className="flex flex-col gap-2">
          <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
            <span
              aria-hidden
              className="pulse-dot size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20"
            />
            {scope.hospitalName} · {scope.departmentName}
          </span>
          <h1 className="font-display text-foreground text-[30px] leading-[1.15] font-medium tracking-[-0.015em] text-balance lg:text-[34px]">
            {firstName ? `Welcome, ${firstName}.` : "Welcome."}
          </h1>
          <p className="text-muted-foreground max-w-[60ch] text-[13.5px] leading-relaxed">
            Your clinical workspace, scoped to {scope.departmentName} at {scope.hospitalName}.
          </p>
        </header>

        {/* ── Cadre-specific top row ───────────────────────────── */}
        {scope.isJunior ? (
          <SupervisorCard
            supervisor={supervisor}
            myPendingCount={myRequests.filter((r) => r.state === "pending_review").length}
          />
        ) : null}

        {scope.isSenior ? <SeniorReviewCard pendingCount={pendingForMe.length} /> : null}

        {/* ── Incoming intakes for this department ─────────────── */}
        <IncomingIntakesPanel rows={incoming} departmentName={scope.departmentName} />

        {/* ── Directional surface cards ────────────────────────── */}
        <section className="grid gap-3 sm:grid-cols-2">
          <DirectionCard
            href="/doctor/patients"
            title="Patient panel"
            subtitle="Care-team, encounters, and your department"
            Icon={UsersIcon}
            tone="primary"
          />
          <DirectionCard
            href="/doctor/schedule"
            title="Schedule"
            subtitle="Today + upcoming · availability"
            Icon={CalendarClockIcon}
            tone="muted"
          />
          <PlaceholderCard
            title="Alerts"
            subtitle="Lands when the monitoring engine ships"
            Icon={ActivityIcon}
          />
          <PlaceholderCard
            title="Encounters"
            subtitle="Lands with the clinical module"
            Icon={StethoscopeIcon}
          />
          <PlaceholderCard
            title="Care team"
            subtitle="Lands with the care-team workspace"
            Icon={ClipboardListIcon}
          />
          <PlaceholderCard
            title="Tasks"
            subtitle="Notes, mentions, follow-ups"
            Icon={CheckSquareIcon}
          />
        </section>
      </div>
    </div>
  );
}

/* ── Cadre-specific cards ─────────────────────────────────────── */

function SupervisorCard({
  supervisor,
  myPendingCount,
}: {
  supervisor: Awaited<ReturnType<typeof getMySupervisor>>;
  myPendingCount: number;
}) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5">
      <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
        Your supervisor
      </h2>

      {supervisor ? (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex size-10 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40"
          >
            <GraduationCapIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-foreground text-[14px] font-medium">
              {supervisor.supervisorName ?? "Supervisor"}
            </span>
            <span className="text-muted-foreground text-[12px]">{supervisor.cadreName}</span>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground max-w-[56ch] text-[12.5px] leading-relaxed">
          No primary supervisor paired yet — your flagged actions will route to any consultant in
          your department until your hospital admin assigns one.
        </p>
      )}

      {myPendingCount > 0 ? (
        <p className="text-muted-foreground text-[12px] leading-relaxed">
          <span className="text-foreground font-medium">{myPendingCount}</span>{" "}
          {myPendingCount === 1 ? "request" : "requests"} you&rsquo;ve sent are awaiting review.
        </p>
      ) : null}
    </section>
  );
}

function SeniorReviewCard({ pendingCount }: { pendingCount: number }) {
  return (
    <Link
      href="/doctor/cosign-queue"
      className={
        pendingCount > 0
          ? "group card-lift flex items-center gap-3 rounded-xl border border-teal-500/30 bg-teal-50/40 p-5 hover:border-teal-500/60 dark:border-teal-400/20 dark:bg-teal-950/15"
          : "group card-lift border-border bg-card flex items-center gap-3 rounded-xl border p-5"
      }
    >
      <span
        aria-hidden
        className={
          pendingCount > 0
            ? "ease-spring inline-flex size-10 items-center justify-center rounded-full bg-teal-100 text-teal-700 ring-1 ring-teal-200/70 transition-transform duration-200 group-hover:scale-105 dark:bg-teal-900/40 dark:text-teal-300 dark:ring-teal-800/40"
            : "bg-muted text-foreground/80 ease-spring inline-flex size-10 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105"
        }
      >
        <ListChecksIcon className="size-5" />
      </span>
      <div className="flex flex-1 flex-col">
        <span className="text-foreground text-[14.5px] font-medium">Review queue</span>
        <span className="text-muted-foreground text-[12px]">
          {pendingCount === 0
            ? "Nothing waiting for your review"
            : `${pendingCount} junior action${pendingCount === 1 ? "" : "s"} awaiting your co-sign`}
        </span>
      </div>
      {pendingCount > 0 ? (
        <span className="scale-in inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-teal-600/10 px-1.5 font-mono text-[12px] font-semibold text-teal-700 tabular-nums dark:text-teal-300">
          {pendingCount}
        </span>
      ) : null}
      <ArrowRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function DirectionCard({
  href,
  title,
  subtitle,
  Icon,
  tone,
}: {
  href: string;
  title: string;
  subtitle: string;
  Icon: typeof UsersIcon;
  tone: "primary" | "muted";
}) {
  return (
    <Link
      href={href}
      className={
        tone === "primary"
          ? "group card-lift bg-foreground text-background hover:bg-foreground/90 flex items-start gap-3 rounded-xl p-5 transition-colors"
          : "group card-lift border-border bg-card flex items-start gap-3 rounded-xl border p-5"
      }
    >
      <span
        aria-hidden
        className={
          tone === "primary"
            ? "bg-background/15 text-background ease-spring inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105"
            : "bg-muted text-foreground/80 ease-spring inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105"
        }
      >
        <Icon className="size-4" />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-[14.5px] font-medium">{title}</span>
        <span
          className={
            tone === "primary"
              ? "text-background/70 text-[12px]"
              : "text-muted-foreground text-[12px]"
          }
        >
          {subtitle}
        </span>
      </span>
      <ArrowRightIcon
        aria-hidden
        className={
          tone === "primary"
            ? "text-background/60 size-4 shrink-0 -translate-x-1 self-center opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
            : "text-muted-foreground size-4 shrink-0 -translate-x-1 self-center opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
        }
      />
    </Link>
  );
}

function PlaceholderCard({
  title,
  subtitle,
  Icon,
}: {
  title: string;
  subtitle: string;
  Icon: typeof UsersIcon;
}) {
  return (
    <div className="border-border bg-card/40 text-muted-foreground flex items-start gap-3 rounded-xl border border-dashed p-5">
      <span
        aria-hidden
        className="bg-muted/60 text-muted-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <Icon className="size-4" />
      </span>
      <span className="flex flex-col">
        <span className="text-foreground/80 text-[14.5px] font-medium">{title}</span>
        <span className="text-[12px]">{subtitle}</span>
      </span>
    </div>
  );
}
