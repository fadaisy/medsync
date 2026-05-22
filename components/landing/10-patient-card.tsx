import {
  AlertTriangleIcon,
  ClipboardSignatureIcon,
  HeartPulseIcon,
  HistoryIcon,
  PhoneIcon,
  PillIcon,
  StethoscopeIcon,
  UsersIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * §10b — Patient enrichment card. The richest single composition on the
 * landing page (per spec). Continues the Amina N. (MS-00184) arc from
 * §05b / §07 / §09a, but renders the *full* unified record this time:
 * header, allergies + conditions, vitals trend, active medications with
 * adherence, recent labs against reference ranges, care-plan timeline,
 * care team, audit trail, and an Auto-Summary that synthesises across
 * all of the above.
 *
 * Server component — no interaction. Every datum is sample, marked
 * Illustrative in the chrome.
 */

export function PatientCard() {
  return (
    <section
      aria-label="Illustrative unified patient record"
      className="bg-background relative w-full"
    >
      <div className="mx-auto w-full max-w-300 px-3 pb-20 sm:px-8 sm:pb-28">
        <div className="relative">
          {/* Soft halo behind the card */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-8 inset-y-0 -z-10 [background:radial-gradient(ellipse_at_center,oklch(0.92_0.06_180/0.35),transparent_60%)] dark:[background:radial-gradient(ellipse_at_center,oklch(0.45_0.08_180/0.18),transparent_65%)]"
          />

          <article
            className={cn(
              "border-border bg-card relative overflow-hidden rounded-2xl border shadow-xl dark:shadow-2xl",
            )}
          >
            <CardChrome />
            <CardHeader />
            <AutoSummary />
            <TripleColumn />
            <CarePlanTimeline />
            <CareTeamAndAudit />
            <CardFooter />
          </article>
        </div>
      </div>
    </section>
  );
}

/* ─── Chrome ──────────────────────────────────────────────────────────── */

function CardChrome() {
  return (
    <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-[11px] sm:px-5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-mono tracking-[0.15em] uppercase">
          app.medsync.health
        </span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-muted-foreground">patients</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-foreground">MS-00184</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground hidden font-mono text-[10px] tracking-[0.15em] uppercase sm:inline">
          View &middot; Diabetology
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
            "border border-teal-300 bg-teal-50 font-mono text-[9.5px] tracking-[0.18em] text-teal-800 uppercase",
            "dark:border-teal-700 dark:bg-teal-50/10 dark:text-teal-200",
          )}
        >
          <span className="size-1.5 rounded-full bg-teal-500" />
          Illustrative &middot; sample
        </span>
      </div>
    </div>
  );
}

/* ─── Header ──────────────────────────────────────────────────────────── */

function CardHeader() {
  return (
    <header className="border-border grid gap-4 border-b p-5 sm:grid-cols-12 sm:p-6">
      {/* Identity */}
      <div className="flex flex-col gap-1 sm:col-span-5">
        <p className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Patient &middot; MS-00184
        </p>
        <h3 className="font-display text-foreground text-[28px] leading-[1.05] font-medium sm:text-[32px]">
          Amina N.
        </h3>
        <p className="text-muted-foreground text-[12.5px]">
          47 &middot; F &middot; admitted day 3 &middot; IM-A, bed 14
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["T2DM · 9y", "Stage 1 HTN", "Microalbuminuria"].map((c) => (
            <span
              key={c}
              className="border-border text-foreground inline-flex rounded-full border bg-transparent px-2 py-0.5 text-[10.5px]"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Demographics */}
      <dl className="grid grid-cols-2 gap-y-2 text-[11.5px] sm:col-span-4">
        <Demo k="NIN" v="CM••••••88F" />
        <Demo k="DoB" v="1979-04-12" />
        <Demo k="Phone" v="+256 7•• ••• ••3" />
        <Demo k="Next of kin" v="Mr. Wamala" />
        <Demo k="Insurer" v="Self-pay" />
        <Demo k="Allergies" v="NKDA" emphasis />
      </dl>

      {/* Status + primary contact */}
      <div className="flex flex-col gap-2 sm:col-span-3 sm:items-end">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
            "bg-status-admitted-bg text-status-admitted-fg font-mono text-[10px] tracking-[0.15em] uppercase",
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          Admitted
        </span>
        <p className="text-muted-foreground text-right text-[11px]">
          Primary &middot; Dr. M. Okello
        </p>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-right text-[11px]">
          <PhoneIcon className="size-3" strokeWidth={1.75} />
          Last seen on app &middot; 06:31 today
        </p>
      </div>
    </header>
  );
}

function Demo({ k, v, emphasis }: { k: string; v: string; emphasis?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
        {k}
      </dt>
      <dd
        className={cn(
          "tabular text-right",
          emphasis ? "text-foreground font-medium" : "text-foreground",
        )}
      >
        {v}
      </dd>
    </>
  );
}

/* ─── Auto-summary ───────────────────────────────────────────────────── */

function AutoSummary() {
  return (
    <section
      aria-label="Auto-summary"
      className="border-border bg-muted/30 flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-start sm:p-6"
    >
      <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase sm:w-44 sm:shrink-0 sm:pt-1">
        <ClipboardSignatureIcon className="size-3" strokeWidth={1.75} />
        Auto-summary
      </span>
      <p className="text-foreground flex-1 text-[14px] leading-[1.6]">
        Glycaemic control <span className="text-status-critical-fg font-medium">worsening</span>{" "}
        over 72h (capillary glucose 7.4 &rarr; 14.2 mmol/L). BP trending up on Lisinopril 10 mg. Two
        missed glibenclamide doses logged via SMS. Suggest: hold glibenclamide, continue
        sliding-scale insulin, recheck HbA1c &amp; UEC, escalate to Diabetology consultant if no
        response in 24h.
      </p>
    </section>
  );
}

/* ─── Triple column: vitals · meds · labs ─────────────────────────────── */

function TripleColumn() {
  return (
    <section className="border-border grid border-b lg:grid-cols-3 lg:divide-x">
      <VitalsColumn />
      <MedicationsColumn />
      <LabsColumn />
    </section>
  );
}

function ColumnShell({
  Icon,
  title,
  badge,
  children,
}: {
  Icon: typeof HeartPulseIcon;
  title: string;
  badge?: { label: string; tone?: "ok" | "alert" };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <Icon className="size-3" strokeWidth={1.75} />
          {title}
        </span>
        {badge ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.15em] uppercase",
              badge.tone === "alert"
                ? "bg-status-critical-bg text-status-critical-fg"
                : "bg-status-stable-bg text-status-stable-fg",
            )}
          >
            <span className="size-1 rounded-full bg-current" />
            {badge.label}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function VitalsColumn() {
  // Glucose trend over 7 days — same series as §05b, plus BP trend.
  return (
    <ColumnShell Icon={HeartPulseIcon} title="Vitals" badge={{ label: "Glucose ↑", tone: "alert" }}>
      <div className="border-border bg-muted/40 rounded-md border p-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            Capillary glucose &middot; 7d
          </span>
          <span className="text-muted-foreground tabular font-mono text-[10.5px]">mmol/L</span>
        </div>
        <GlucoseTrend />
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <KV k="Latest" v="14.2" tone="alert" />
          <KV k="Mean 7d" v="9.9" />
          <KV k="Target" v="4–10" />
        </div>
      </div>

      <div className="border-border bg-muted/40 rounded-md border p-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            Blood pressure &middot; 7d
          </span>
          <span className="text-muted-foreground tabular font-mono text-[10.5px]">mmHg</span>
        </div>
        <BpBars />
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <KV k="Latest" v="152/94" tone="alert" />
          <KV k="Mean 7d" v="142/88" />
          <KV k="Target" v="<140/90" />
        </div>
      </div>
    </ColumnShell>
  );
}

function MedicationsColumn() {
  const meds = [
    { name: "Metformin", dose: "1 g", freq: "BD", state: "active", adherence: 92 },
    { name: "Glibenclamide", dose: "5 mg", freq: "OD", state: "held", adherence: 71 },
    { name: "Lisinopril", dose: "10 mg", freq: "OD", state: "active", adherence: 95 },
    { name: "Insulin Actrapid", dose: "sliding scale", freq: "pre-meal", state: "active" },
    { name: "Atorvastatin", dose: "20 mg", freq: "nocte", state: "active", adherence: 88 },
  ] as const;
  return (
    <ColumnShell Icon={PillIcon} title="Active medications" badge={{ label: "1 held" }}>
      <ul className="flex flex-col gap-2">
        {meds.map((m) => (
          <li
            key={m.name}
            className={cn(
              "border-border bg-card rounded-md border p-2.5",
              m.state === "held" ? "border-status-caution-bg" : "",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-foreground text-[12.5px] font-medium">{m.name}</span>
              {m.state === "held" ? (
                <span className="bg-status-caution-bg text-status-caution-fg inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9px] tracking-[0.15em] uppercase">
                  Held
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground tabular text-[11px]">
              {m.dose} &middot; {m.freq}
            </p>
            {"adherence" in m ? (
              <div className="mt-1.5">
                <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      m.adherence >= 90
                        ? "bg-status-stable-fg"
                        : m.adherence >= 75
                          ? "bg-teal-500"
                          : "bg-status-caution-fg",
                    )}
                    style={{ width: `${m.adherence}%` }}
                  />
                </div>
                <p className="text-muted-foreground tabular mt-1 font-mono text-[9.5px]">
                  Adherence &middot; {m.adherence}% (SMS-confirmed)
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </ColumnShell>
  );
}

function LabsColumn() {
  const labs = [
    { name: "HbA1c", value: "9.8 %", ref: "< 7.0 %", flag: "high" as const },
    { name: "Fasting glucose", value: "12.4 mmol/L", ref: "4–6 mmol/L", flag: "high" as const },
    { name: "Creatinine", value: "94 µmol/L", ref: "55–110", flag: "ok" as const },
    { name: "eGFR", value: "78 mL/min", ref: "> 60", flag: "ok" as const },
    { name: "K+", value: "4.4 mmol/L", ref: "3.5–5.1", flag: "ok" as const },
    { name: "Urine ACR", value: "92 mg/g", ref: "< 30 mg/g", flag: "high" as const },
  ];
  return (
    <ColumnShell
      Icon={AlertTriangleIcon}
      title="Recent labs"
      badge={{ label: "3 abnormal", tone: "alert" }}
    >
      <ul className="flex flex-col">
        {labs.map((lab) => (
          <li
            key={lab.name}
            className="border-border flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0"
          >
            <span className="text-muted-foreground text-[11.5px]">{lab.name}</span>
            <div className="flex flex-col items-end">
              <span
                className={cn(
                  "tabular text-[12.5px] font-medium",
                  lab.flag === "ok" ? "text-foreground" : "text-status-critical-fg",
                )}
              >
                {lab.value}
              </span>
              <span className="text-muted-foreground tabular font-mono text-[9.5px]">
                ref {lab.ref}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </ColumnShell>
  );
}

/* ─── Inline charts ──────────────────────────────────────────────────── */

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
  const bandTop = height - ((10 - min) / (max - min)) * height;
  const bandBottom = height - ((4 - min) / (max - min)) * height;
  const lastPoint = points.split(" ").at(-1) ?? "0,0";
  const parts = lastPoint.split(",");
  const lx = Number(parts[0] ?? "0");
  const ly = Number(parts[1] ?? "0");
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 4}`}
      preserveAspectRatio="none"
      className="text-foreground/80 h-12 w-full"
      role="img"
      aria-label="Capillary glucose trend, last 7 days. Climbing from 6.1 to 14.2 mmol/L."
    >
      <rect
        x={0}
        y={bandTop}
        width={width}
        height={bandBottom - bandTop}
        className="fill-teal-100/60 dark:fill-teal-50/10"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r={3} className="fill-status-critical-fg" />
      <circle cx={lx} cy={ly} r={6} className="fill-status-critical-fg/20" />
    </svg>
  );
}

function BpBars() {
  // Each day: systolic/diastolic. 7 days, bars represent systolic; we mark
  // the >140 threshold as a dotted line.
  const sys = [132, 138, 140, 144, 146, 150, 152];
  const max = 170;
  const min = 100;
  return (
    <svg
      viewBox="0 0 240 56"
      preserveAspectRatio="none"
      className="h-12 w-full"
      role="img"
      aria-label="Systolic blood pressure trend, last 7 days. Climbing from 132 to 152 mmHg."
    >
      {sys.map((s, i) => {
        const barWidth = 240 / sys.length - 4;
        const x = i * (240 / sys.length) + 2;
        const heightPx = ((s - min) / (max - min)) * 56;
        const y = 56 - heightPx;
        const aboveTarget = s >= 140;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={heightPx}
            rx={1}
            className={aboveTarget ? "fill-status-critical-fg/70" : "fill-teal-500/60"}
          />
        );
      })}
      {/* 140 mmHg target line */}
      <line
        x1={0}
        x2={240}
        y1={56 - ((140 - min) / (max - min)) * 56}
        y2={56 - ((140 - min) / (max - min)) * 56}
        strokeDasharray="2 3"
        strokeWidth={0.6}
        className="stroke-muted-foreground/50"
      />
    </svg>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: "alert" }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
        {k}
      </span>
      <span
        className={cn(
          "tabular text-[12px] font-medium",
          tone === "alert" ? "text-status-critical-fg" : "text-foreground",
        )}
      >
        {v}
      </span>
    </div>
  );
}

/* ─── Care plan timeline ─────────────────────────────────────────────── */

function CarePlanTimeline() {
  const steps = [
    { label: "Admit", date: "19 May", state: "done" as const },
    { label: "Day-3 review", date: "now", state: "active" as const },
    { label: "Step-down", date: "Day 5", state: "future" as const },
    { label: "Discharge", date: "Day 6", state: "future" as const },
    { label: "Home f/u (SMS)", date: "Day 7-21", state: "future" as const },
    { label: "Clinic", date: "Day 22", state: "future" as const },
  ];
  return (
    <section
      aria-label="Care-plan timeline"
      className="border-border flex flex-col gap-3 border-b p-5 sm:p-6"
    >
      <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
        <HistoryIcon className="size-3" strokeWidth={1.75} />
        Care-plan timeline
      </span>

      {/* Mobile / tablet: vertical-stacked rows (dot inline with label, no
          horizontal connector — it doesn't make sense across wrapped rows). */}
      <ol className="grid grid-cols-2 gap-y-3 sm:grid-cols-3 lg:hidden">
        {steps.map((step) => (
          <li key={step.label} className="flex items-start gap-2">
            <TimelineDot state={step.state} />
            <TimelineLabel step={step} />
          </li>
        ))}
      </ol>

      {/* Desktop (lg+): horizontal stepper. The dots sit on a single
          baseline with a connector line behind them; labels stack below. */}
      <div className="hidden lg:block">
        <ol className="relative grid grid-cols-6 gap-x-2">
          {/* Connector line — runs from the first dot's center to the last
              dot's center. cx(first) = (col_width / 2); we approximate by
              inset = 1/12th of total width. */}
          <span
            aria-hidden
            className="bg-border absolute top-1.5 hidden h-px lg:block"
            style={{ left: "calc(100% / 12)", right: "calc(100% / 12)" }}
          />
          {steps.map((step) => (
            <li key={step.label} className="relative flex flex-col items-center gap-2 text-center">
              <span className="bg-card relative z-10 inline-flex">
                <TimelineDot state={step.state} />
              </span>
              <TimelineLabel step={step} centered />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function TimelineDot({ state }: { state: "done" | "active" | "future" }) {
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex size-3 shrink-0 items-center justify-center rounded-full",
        state === "done" && "bg-teal-500 text-white",
        state === "active" && "bg-background ring-2 ring-teal-500",
        state === "future" && "bg-muted ring-border ring-1",
      )}
    >
      {state === "active" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-teal-500 motion-reduce:animate-none" />
      ) : null}
    </span>
  );
}

function TimelineLabel({
  step,
  centered,
}: {
  step: { label: string; date: string; state: "done" | "active" | "future" };
  centered?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", centered ? "items-center" : "")}>
      <span
        className={cn(
          "text-[12px] leading-tight",
          step.state === "future" ? "text-muted-foreground" : "text-foreground",
          step.state === "active" ? "font-medium" : "",
        )}
      >
        {step.label}
      </span>
      <span className="text-muted-foreground tabular font-mono text-[10px]">{step.date}</span>
    </div>
  );
}

/* ─── Care team + audit ───────────────────────────────────────────────── */

function CareTeamAndAudit() {
  return (
    <section className="border-border grid border-b sm:grid-cols-2 sm:divide-x">
      <CareTeam />
      <AuditTrail />
    </section>
  );
}

function CareTeam() {
  const people = [
    {
      initials: "MO",
      name: "Dr. M. Okello",
      role: "MD · Diabetology · primary",
      tone: "teal" as const,
    },
    { initials: "SA", name: "Dr. S. Akello", role: "Cardiology consult", tone: "violet" as const },
    { initials: "RN", name: "R. Namuli", role: "Nurse · ward IM-A", tone: "amber" as const },
    { initials: "JP", name: "J. Ponsiano", role: "Pharmacist", tone: "neutral" as const },
    { initials: "EM", name: "E. Musoke", role: "Community CHW", tone: "neutral" as const },
  ];
  return (
    <div className="flex flex-col gap-3 p-5 sm:p-6">
      <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
        <UsersIcon className="size-3" strokeWidth={1.75} />
        Care team
      </span>
      <ul className="flex flex-col gap-2">
        {people.map((p) => (
          <li key={p.initials} className="flex items-center gap-3">
            <span
              className={cn(
                "tabular inline-flex size-7 items-center justify-center rounded-full text-[10.5px] font-medium",
                p.tone === "teal" &&
                  "bg-teal-100 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200",
                p.tone === "violet" && "bg-status-discharged-bg text-status-discharged-fg",
                p.tone === "amber" && "bg-status-caution-bg text-status-caution-fg",
                p.tone === "neutral" && "bg-muted text-muted-foreground",
              )}
            >
              {p.initials}
            </span>
            <div className="flex flex-col">
              <span className="text-foreground text-[12.5px] font-medium">{p.name}</span>
              <span className="text-muted-foreground text-[11px]">{p.role}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditTrail() {
  const entries = [
    { ts: "Today 07:42", who: "Dr. M. Okello", what: "Signed insulin sliding-scale order" },
    { ts: "Today 06:15", who: "Lab system", what: "Uploaded HbA1c · 9.8 %" },
    {
      ts: "Yesterday 23:55",
      who: "SMS gateway",
      what: "Home glucose reading 14.2 mmol/L received",
    },
    {
      ts: "Yesterday 22:14",
      who: "Routing rule",
      what: "Critical alert escalated to on-call diabetology",
    },
    { ts: "Yesterday 14:30", who: "Dr. M. Okello", what: "Held morning glibenclamide" },
  ];
  return (
    <div className="flex flex-col gap-3 p-5 sm:p-6">
      <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
        <StethoscopeIcon className="size-3" strokeWidth={1.75} />
        Audit trail &middot; last 5
      </span>
      <ol className="flex flex-col gap-2">
        {entries.map((e) => (
          <li key={e.ts + e.what} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-foreground text-[12px]">{e.what}</span>
              <span className="text-muted-foreground tabular shrink-0 font-mono text-[10px]">
                {e.ts}
              </span>
            </div>
            <span className="text-muted-foreground text-[10.5px]">{e.who}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CardFooter() {
  return (
    <footer className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[11px] sm:px-6">
      <span className="text-muted-foreground">
        Every line on this card is sample data &mdash; no real patient, no real identifiers.
      </span>
      <span className="text-muted-foreground tabular inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
        <span className="size-1 rounded-full bg-teal-500" />
        Live sync &middot; last 4 s
      </span>
    </footer>
  );
}
