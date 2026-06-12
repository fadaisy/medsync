import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardListIcon, ListChecksIcon, SearchIcon, UserPlusIcon } from "lucide-react";

import { IncomingIntakesPanel } from "@/components/intake/incoming-panel";
import { fetchHospitalIncomingIntakes } from "@/lib/intake/queries";
import { fetchReceptionTodayCounts } from "@/lib/reception/queries";
import { requireReceptionScope } from "@/lib/reception/scope";

export const metadata: Metadata = { title: "Today · Reception · MedSync" };
export const dynamic = "force-dynamic";

export default async function ReceptionTodayPage() {
  const scope = await requireReceptionScope();
  const firstName = scope.fullName?.split(" ")[0];

  const [counts, incoming] = await Promise.all([
    fetchReceptionTodayCounts({ hospitalId: scope.hospitalId }),
    fetchHospitalIncomingIntakes({ hospitalId: scope.hospitalId, limit: 8 }),
  ]);

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 lg:py-10">
      {/* Quiet atmosphere — a 5% teal wash behind the header, nothing louder. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(13,148,136,0.05),transparent_70%)]"
      />

      <header className="reveal-up flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span
            aria-hidden
            className="pulse-dot size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20"
          />
          {scope.hospitalName} · Front desk
        </span>
        <h1 className="font-display text-foreground text-[28px] leading-[1.15] font-medium tracking-[-0.015em] lg:text-[32px]">
          {firstName ? `Hi, ${firstName}.` : "Hi."}
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[13px] leading-relaxed">
          Today&rsquo;s front-desk picture. Click any quick action to start.
        </p>
      </header>

      {/* Stat rail. "Declared" = patient-initiated queue tickets that
          haven't been checked in yet (migration 0035). Surfaced as its
          own tile so it doesn't get conflated with "Arrived". */}
      <section
        aria-label="Today counts"
        className="stagger-children grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        <StatTile label="Expected" value={counts.expectedToday} />
        <StatTile label="Declared" value={counts.declaredToday} tone="muted" />
        <StatTile label="Arrived" value={counts.arrivedToday} tone="teal" />
        <StatTile label="Awaiting triage" value={counts.awaitingTriage} tone="amber" />
        <StatTile label="No-shows" value={counts.noShowsToday} tone="muted" />
      </section>

      {/* Quick actions */}
      <section className="stagger-children grid gap-3 sm:grid-cols-2">
        <QuickAction
          href="/reception/expected"
          title="Check in"
          subtitle="Today's booked patients"
          Icon={ClipboardListIcon}
          tone="primary"
        />
        <QuickAction
          href="/reception/intake"
          title="Register an entry"
          subtitle="Walk-in · referral · emergency"
          Icon={UserPlusIcon}
          tone="muted"
        />
        <QuickAction
          href="/reception/find"
          title="Find a patient"
          subtitle="By patient code (operational)"
          Icon={SearchIcon}
          tone="muted"
        />
        <QuickAction
          href="/reception/flow"
          title="Today's flow"
          subtitle="Expected · arrived · in queue"
          Icon={ListChecksIcon}
          tone="muted"
        />
      </section>

      <div className="reveal-up" style={{ animationDelay: "160ms" }}>
        <IncomingIntakesPanel rows={incoming} departmentName={`${scope.hospitalName}`} />
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "teal" | "amber" | "muted";
}) {
  const toneClass =
    tone === "teal"
      ? "text-teal-700 dark:text-teal-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="border-border bg-card card-lift flex flex-col gap-1 rounded-xl border p-3">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
        {label}
      </span>
      <span
        className={`font-display text-[28px] leading-none font-medium tabular-nums ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function QuickAction({
  href,
  title,
  subtitle,
  Icon,
  tone,
}: {
  href: string;
  title: string;
  subtitle: string;
  Icon: typeof UserPlusIcon;
  tone: "primary" | "muted";
}) {
  return (
    <Link
      href={href}
      className={
        tone === "primary"
          ? "group card-lift tap bg-foreground text-background hover:bg-foreground/90 flex items-start gap-3 rounded-xl p-5 transition-colors"
          : "group card-lift tap border-border bg-card hover:bg-muted/30 flex items-start gap-3 rounded-xl border p-5 transition-colors"
      }
    >
      <span
        aria-hidden
        className={
          tone === "primary"
            ? "bg-background/15 text-background inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105"
            : "bg-muted text-foreground/80 inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-teal-50 group-hover:text-teal-700 dark:group-hover:bg-teal-950/40 dark:group-hover:text-teal-300"
        }
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
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
      <span
        aria-hidden
        className={
          tone === "primary"
            ? "text-background/50 self-center text-[13px] transition-transform duration-200 group-hover:translate-x-0.5"
            : "text-muted-foreground/50 group-hover:text-foreground/70 self-center text-[13px] transition-all duration-200 group-hover:translate-x-0.5"
        }
      >
        →
      </span>
    </Link>
  );
}
