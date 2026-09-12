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
    // Present-and-waiting only. The shared panel is titled "Awaiting triage"
    // and prints rows.length beside it; the default status set also carries
    // 'declared' rows, which would put people who are still at home inside a
    // count that claims they are in the building. Declared patients have their
    // own honest surfaces — the Declared tile below, /reception/expected and
    // /reception/flow.
    fetchHospitalIncomingIntakes({
      hospitalId: scope.hospitalId,
      statuses: ["arrived", "awaiting_triage"],
      limit: 8,
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 lg:py-10">
      <header className="reveal-up flex flex-col gap-2">
        <span className="text-muted-foreground text-overline inline-flex items-center gap-1.5 font-mono uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          {scope.hospitalName} · Front desk
        </span>
        <h1 className="font-display text-foreground text-heading-l">
          {firstName ? `Hi, ${firstName}.` : "Hi."}
        </h1>
        <p className="text-muted-foreground text-body-s max-w-[60ch] leading-relaxed">
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
        <StatTile label="Arrived" value={counts.arrivedToday} tone="brand" />
        <StatTile label="Awaiting triage" value={counts.awaitingTriage} tone="caution" />
        <StatTile label="No-shows" value={counts.noShowsToday} tone="muted" />
      </section>

      {/* Quick actions */}
      <section className="stagger-children grid gap-3 sm:grid-cols-2">
        <QuickAction
          href="/reception/expected"
          title="Check in"
          subtitle="Booked patients · declared arrivals"
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
          subtitle="By name on today's board, or patient code"
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
  tone?: "neutral" | "brand" | "caution" | "muted";
}) {
  // The brand ramp inverts in dark mode, so a `dark:` twin fights the flip
  // instead of helping it — one token per tone, both themes.
  const toneClass =
    tone === "brand"
      ? "text-brand-700"
      : tone === "caution"
        ? "text-status-caution-fg"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="border-border bg-card flex flex-col gap-1 rounded-xl border p-3">
      <span className="text-muted-foreground text-overline font-mono uppercase">{label}</span>
      <span className={`font-display text-heading-l leading-none tabular-nums ${toneClass}`}>
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
          ? "group tap ease-expo-out bg-foreground text-background hover:bg-foreground/90 flex items-start gap-3 rounded-xl p-5 transition-colors duration-150"
          : "group tap ease-expo-out border-border bg-card hover:bg-muted/30 flex items-start gap-3 rounded-xl border p-5 transition-colors duration-150"
      }
    >
      <span
        aria-hidden
        className={
          tone === "primary"
            ? "bg-background/15 text-background inline-flex size-9 shrink-0 items-center justify-center rounded-full"
            : "bg-muted text-foreground/80 group-hover:bg-brand-50 group-hover:text-brand-700 ease-expo-out inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150"
        }
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-m font-medium">{title}</span>
        <span
          className={
            tone === "primary"
              ? "text-background/70 text-body-s"
              : "text-muted-foreground text-body-s"
          }
        >
          {subtitle}
        </span>
      </span>
      <span
        aria-hidden
        className={
          tone === "primary"
            ? "text-background/50 text-body-s ease-expo-out self-center transition-transform duration-150 group-hover:translate-x-0.5"
            : "text-muted-foreground/50 group-hover:text-foreground/70 text-body-s ease-expo-out self-center transition-all duration-150 group-hover:translate-x-0.5"
        }
      >
        →
      </span>
    </Link>
  );
}
