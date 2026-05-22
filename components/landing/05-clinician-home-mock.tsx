import {
  ActivityIcon,
  BellIcon,
  CalendarDaysIcon,
  CommandIcon,
  LayersIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * §05b — Clinician Home mock (hero surface).
 *
 * Illustrative ward-overview surface. Every name, ID, and number is fictional
 * sample data. The "ILLUSTRATIVE" badge is required by spec rule #3 (zero
 * real PHI in product mocks). Per the founder Usama Fadhul + sample
 * specialty (Diabetology / IM-Cardiology) is plausible for the Mulago
 * Internal-Medicine seed list from Phase 0.
 *
 * Floats below the hero with a small perspective transform so it reads as
 * "elevated above the page" — kept subtle to remain professional.
 */
export function ClinicianHomeMock() {
  return (
    <section aria-label="Illustrative Clinician Home" className="relative w-full pb-16 sm:pb-24">
      <div className="mx-auto w-full max-w-300 px-3 sm:px-8">
        <div
          className={cn(
            "relative mx-auto w-full",
            "motion-safe:reveal-up",
            // Subtle elevation effect — the surface looks lifted from the page.
            "[transform:perspective(1800px)_rotateX(-1.5deg)]",
            "motion-reduce:transform-none",
          )}
          style={{ animationDelay: "540ms" }}
        >
          {/* Outer chrome — frosted "browser" feel without window controls. */}
          <div
            className={cn(
              "border-border bg-card relative overflow-hidden rounded-xl border shadow-lg",
              "dark:shadow-2xl",
            )}
          >
            {/* Top hairline w/ ILLUSTRATIVE badge */}
            <div className="border-border bg-muted/50 flex items-center justify-between border-b px-4 py-2">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground font-mono tracking-[0.15em] uppercase">
                  app.medsync.health
                </span>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-muted-foreground">clinical-home</span>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
                  "font-mono text-[9.5px] tracking-[0.18em] uppercase",
                  "border border-teal-300 bg-teal-50 text-teal-800",
                  "dark:border-teal-700 dark:bg-teal-50/10 dark:text-teal-200",
                )}
              >
                <span className="size-1.5 rounded-full bg-teal-500" />
                Illustrative &middot; sample data
              </span>
            </div>

            {/* App body */}
            <div className="grid grid-cols-12">
              <Sidebar />
              <MainColumn />
            </div>
          </div>

          {/* Soft ground shadow to anchor the floating surface */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-10 left-1/2 h-12 w-[80%] -translate-x-1/2 [background:radial-gradient(ellipse,rgba(13,148,136,0.18),transparent_72%)] dark:[background:radial-gradient(ellipse,rgba(45,212,191,0.16),transparent_72%)]"
          />
        </div>
      </div>
    </section>
  );
}

/* ─── Sidebar ───────────────────────────────────────────────────────── */

function Sidebar() {
  return (
    <aside
      className={cn(
        "col-span-3 hidden flex-col gap-3 border-r p-3 lg:flex",
        "border-border bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-baseline gap-0.5">
          <span className="font-display text-[15px] font-medium">MedSync</span>
          <span className="size-1 translate-y-[-1px] rounded-full bg-teal-500" />
        </div>
        <span className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[10px]">
          <CommandIcon className="size-2.5" strokeWidth={2} />K
        </span>
      </div>

      <div className="text-muted-foreground bg-background border-border flex items-center gap-2 rounded-md border px-2 py-1.5 text-[12px]">
        <SearchIcon className="size-3.5" strokeWidth={1.75} />
        <span>Patients, labs, drugs…</span>
      </div>

      <nav className="flex flex-col gap-0.5 pt-2 text-[12.5px]">
        {[
          { icon: UsersIcon, label: "Patients", count: 86, active: true },
          { icon: BellIcon, label: "Alerts", count: 3, badge: "critical" as const },
          { icon: CalendarDaysIcon, label: "Schedule", count: 12 },
          { icon: LayersIcon, label: "Specialties" },
          { icon: ActivityIcon, label: "Reports" },
        ].map((item) => (
          <div
            key={item.label}
            className={cn(
              "group flex items-center justify-between rounded-md px-2 py-1.5",
              item.active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <span className="flex items-center gap-2">
              <item.icon className="size-3.5" strokeWidth={1.75} />
              {item.label}
            </span>
            {item.count !== undefined ? (
              <span
                className={cn(
                  "tabular rounded px-1.5 py-px font-mono text-[10px]",
                  item.badge === "critical"
                    ? "bg-status-critical-bg text-status-critical-fg"
                    : "bg-background/60 text-muted-foreground",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </div>
        ))}
      </nav>

      <div className="text-muted-foreground mt-auto px-2 pt-3 font-mono text-[10px] tracking-wider uppercase">
        Mulago National &middot; IM ward
      </div>
    </aside>
  );
}

/* ─── Main column ───────────────────────────────────────────────────── */

function MainColumn() {
  return (
    <div className="col-span-12 flex flex-col gap-4 p-4 sm:p-5 lg:col-span-9">
      {/* Header row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            Tuesday &middot; 22 May 2026 &middot; 07:42
          </p>
          <h3 className="font-display text-foreground text-[20px] leading-tight font-medium sm:text-[24px]">
            Good morning, Dr. Okello.
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="border-border bg-card flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px]">
            <span className="size-1.5 rounded-full bg-teal-500" />
            Synced 12s ago
          </span>
        </div>
      </div>

      {/* Two-column dashboard */}
      <div className="grid gap-4 md:grid-cols-5">
        <TodayPanel />
        <PatientDetail />
      </div>
    </div>
  );
}

function TodayPanel() {
  const items = [
    {
      time: "09:00",
      title: "Ward round · IM-A",
      sub: "12 patients · 3 reviews",
      tone: "neutral" as const,
    },
    {
      time: "11:30",
      title: "OPD · Diabetology",
      sub: "8 booked · 2 walk-ins",
      tone: "neutral" as const,
    },
    {
      time: "15:00",
      title: "Tele follow-up · Mr. Wamala",
      sub: "Post-discharge · day 4",
      tone: "teal" as const,
    },
  ];
  return (
    <div className="border-border bg-background flex flex-col gap-3 rounded-lg border p-3 md:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Today
        </span>
        <span className="text-muted-foreground tabular text-[10.5px]">3 of 6</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((it) => (
          <li
            key={it.time + it.title}
            className={cn(
              "border-border bg-card flex items-start gap-3 rounded-md border p-2.5",
              it.tone === "teal" ? "border-teal-200 dark:border-teal-800" : "",
            )}
          >
            <span className="tabular text-foreground pt-0.5 font-mono text-[11px]">{it.time}</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-foreground text-[12.5px] leading-snug">{it.title}</span>
              <span className="text-muted-foreground text-[11px]">{it.sub}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PatientDetail() {
  return (
    <div className="border-border bg-background flex flex-col gap-3 rounded-lg border p-3 md:col-span-3">
      {/* Patient header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            Patient &middot; MS-00184
          </span>
          <span className="font-display text-foreground text-[16px] font-medium">Amina N.</span>
          <span className="text-muted-foreground text-[11.5px]">
            47 &middot; F &middot; IM-Cardiology &middot; admitted day 3
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
            "font-mono text-[10px] tracking-[0.15em] uppercase",
            "bg-status-admitted-bg text-status-admitted-fg",
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          Admitted
        </span>
      </div>

      {/* Critical alert */}
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-md p-2.5",
          "bg-status-critical-bg/70 dark:bg-status-critical-bg/40",
        )}
      >
        <span className="bg-status-critical-fg/15 text-status-critical-fg mt-0.5 inline-flex size-5 items-center justify-center rounded-full">
          <span className="bg-status-critical-fg block size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-status-critical-fg text-[12.5px] font-medium">
            Glucose <span className="tabular font-mono">14.2 mmol/L</span>
            <span className="text-muted-foreground ml-1.5 font-normal">· 3 min ago</span>
          </span>
          <span className="text-status-critical-fg/80 text-[11px]">
            Above target (4–10). Auto-suggest: review insulin sliding scale.
          </span>
        </div>
      </div>

      {/* Vitals trend (inline SVG) */}
      <div className="border-border bg-muted/40 rounded-md border p-2.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            Glucose &middot; last 7d
          </span>
          <span className="text-muted-foreground tabular font-mono text-[10.5px]">mmol/L</span>
        </div>
        <GlucoseTrend />
      </div>

      {/* Suggested slot + care team */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-col">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            Suggested slot
          </span>
          <span className="text-foreground tabular text-[12.5px] font-medium">
            Today 14:30 &middot; with Dr. Okello
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            Care team
          </span>
          <CareAvatar initials="UF" tone="teal" />
          <CareAvatar initials="DA" tone="violet" />
          <CareAvatar initials="MK" tone="amber" />
          <CareAvatar initials="+2" tone="neutral" />
        </div>
      </div>
    </div>
  );
}

function CareAvatar({
  initials,
  tone,
}: {
  initials: string;
  tone: "teal" | "violet" | "amber" | "neutral";
}) {
  const toneClasses: Record<typeof tone, string> = {
    teal: "bg-teal-100 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200",
    violet: "bg-status-discharged-bg text-status-discharged-fg",
    amber: "bg-status-caution-bg text-status-caution-fg",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "tabular inline-flex size-6 items-center justify-center rounded-full text-[10px] font-medium",
        toneClasses[tone],
      )}
    >
      {initials}
    </span>
  );
}

/* Sample 7-day glucose readings (fictional). mmol/L: 6.1, 7.4, 8.0, 9.3, 11.6, 12.8, 14.2 */
function GlucoseTrend() {
  const values = [6.1, 7.4, 8.0, 9.3, 11.6, 12.8, 14.2];
  const min = 4;
  const max = 16;
  const width = 240;
  const height = 56;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / (max - min)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastPoint = points.split(" ").at(-1) ?? "0,0";
  const [lx, ly] = lastPoint.split(",").map(Number);
  // Target band (4-10 mmol/L)
  const bandTop = height - ((10 - min) / (max - min)) * height;
  const bandBottom = height - ((4 - min) / (max - min)) * height;
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 8}`}
      className="text-foreground/80 h-12 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Glucose trend, last 7 days. Climbing from 6.1 to 14.2 mmol/L."
    >
      {/* Target band */}
      <rect
        x={0}
        y={bandTop}
        width={width}
        height={bandBottom - bandTop}
        className="fill-teal-100/60 dark:fill-teal-50/10"
      />
      {/* Polyline */}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last-point marker (critical) */}
      <circle cx={lx} cy={ly} r={3} className="fill-status-critical-fg" />
      <circle cx={lx} cy={ly} r={6} className="fill-status-critical-fg/20" />
    </svg>
  );
}
