"use client";

import { useEffect, useRef, useState } from "react";
import {
  ActivityIcon,
  ClipboardListIcon,
  HomeIcon,
  PillIcon,
  SyringeIcon,
  WifiOffIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * §07 — [01] Platform showcase (5-scene scroll-pin).
 *
 * Attio analogue: the big numbered scroll section where the right pane is
 * sticky and the left scrolls through 5 scenes. MedSync version traces a
 * single patient's record across the five steps of care so the reader
 * physically watches what "doesn't stop at the gate" means.
 *
 * GATE A scroll-pin contract:
 *   - position: sticky on the right pane; no scroll listeners
 *     (IntersectionObserver only).
 *   - Reduced-motion OR <md: drop the pin, stack scenes inline with their
 *     surface variant rendered beneath the title.
 *   - One observer for active-scene tracking; rootMargin tuned so the
 *     scene whose middle-third is in view wins.
 *
 * Scenes 1-5: Admit → Diagnose → Treat → Discharge → Loop closes. Every
 * datum on the pinned surface is sample (continues the Amina N. arc from §05b).
 */

interface Scene {
  index: number;
  step: string;
  title: string;
  body: string;
  Icon: typeof ActivityIcon;
}

const SCENES: Scene[] = [
  {
    index: 0,
    step: "Step 01 · Admit",
    title: "Admit at the gate.",
    body: "A patient walks into Mulago. Triage captures demographics, vitals, NIN — the record opens once, for everyone who will touch this case.",
    Icon: ClipboardListIcon,
  },
  {
    index: 1,
    step: "Step 02 · Diagnose",
    title: "Diagnose in context.",
    body: "Labs, vitals, prior visits, and specialty templates land in one view. The same record adapts: Diabetology sees HbA1c, Cardiology sees LVEF.",
    Icon: ActivityIcon,
  },
  {
    index: 2,
    step: "Step 03 · Treat",
    title: "Treat with the safeguards on.",
    body: "Sliding-scale insulin, allergy check, dose verification. Every order is signed against the patient, the chart, and the ward stock.",
    Icon: SyringeIcon,
  },
  {
    index: 3,
    step: "Step 04 · Discharge",
    title: "Discharge — but don't disconnect.",
    body: "The patient goes home. The record stays open. SMS reminders schedule themselves, home glucose readings flow back, missed-dose alerts route to the team.",
    Icon: HomeIcon,
  },
  {
    index: 4,
    step: "Step 05 · The loop closes",
    title: "The loop closes.",
    body: "A worrying reading at home wakes the care team. A telephone follow-up books itself. The next clinic visit starts where the last one ended — never from scratch.",
    Icon: WifiOffIcon,
  },
];

export function PlatformShowcase() {
  const [active, setActive] = useState(0);
  const sceneRefs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (!top) return;
        const idx = Number(top.target.getAttribute("data-scene-index"));
        if (!Number.isNaN(idx)) setActive(idx);
      },
      {
        // Active when the scene's middle band is in view.
        rootMargin: "-35% 0px -35% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const el of sceneRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="platform-showcase"
      aria-label="How the record stays open across every step of care"
      className="border-border bg-background relative w-full border-y"
    >
      {/* Section header */}
      <div className="mx-auto w-full max-w-300 px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
        <div className="flex flex-col gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="size-1 rounded-full bg-teal-500" />
            [01] &nbsp; The closed loop, scene by scene
          </span>
          <h2
            className="font-display text-foreground text-[34px] leading-[1.08] tracking-[-0.025em] text-balance sm:text-[52px]"
            style={{ fontWeight: 400 }}
          >
            One record. Five steps.{" "}
            <span className="text-teal-700 italic dark:text-teal-300">No hand-off lost</span>{" "}
            between them.
          </h2>
          <p className="text-muted-foreground max-w-[64ch] text-[15px] leading-[1.55] sm:text-[17px]">
            Most hospital software ends at discharge. MedSync follows the patient home, then back to
            the ward, then to the specialist, then home again &mdash; keeping the record live the
            whole time.
          </p>
        </div>
      </div>

      {/* Scroll-pin grid (desktop) / stacked (mobile + reduced-motion) */}
      <div className="mx-auto w-full max-w-300 px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="grid gap-10 md:grid-cols-12 md:gap-12">
          {/* Left column — 5 scene blocks */}
          <div className="md:col-span-6 lg:col-span-7">
            <ol className="flex flex-col">
              {SCENES.map((scene) => (
                <li
                  key={scene.index}
                  ref={(el) => {
                    sceneRefs.current[scene.index] = el;
                  }}
                  data-scene-index={scene.index}
                  data-active={active === scene.index ? "true" : "false"}
                  className="group flex flex-col gap-3 py-12 sm:py-16"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "tabular inline-flex items-center justify-center rounded-md font-mono",
                        "size-7 text-[11px]",
                        "transition-colors duration-200",
                        active === scene.index
                          ? "bg-teal-700 text-teal-50 dark:bg-teal-300 dark:text-teal-950"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      0{scene.index + 1}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[10px] tracking-[0.16em] uppercase",
                        "transition-colors duration-200",
                        active === scene.index ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {scene.step}
                    </span>
                  </div>
                  <h3
                    className={cn(
                      "font-display text-[26px] leading-[1.18] tracking-[-0.02em] text-balance sm:text-[34px]",
                      "transition-colors duration-200",
                      active === scene.index ? "text-foreground" : "text-muted-foreground/70",
                    )}
                    style={{ fontWeight: 400 }}
                  >
                    {scene.title}
                  </h3>
                  <p
                    className={cn(
                      "max-w-[56ch] text-[14.5px] leading-[1.55] sm:text-[16px]",
                      "transition-colors duration-200",
                      active === scene.index ? "text-muted-foreground" : "text-muted-foreground/50",
                    )}
                  >
                    {scene.body}
                  </p>

                  {/* Mobile-only inline surface. At md+ the right sticky
                      pane takes over; reduced-motion users still see the
                      sticky pane (just without the cross-fade). */}
                  <div className="md:hidden">
                    <SurfaceForScene scene={scene.index} />
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Right column — sticky surface (md+, always rendered). The
              cross-fade transition is gated on motion-safe so reduced-motion
              users get an instant swap; layout itself doesn't change. */}
          <div aria-hidden className="hidden md:col-span-6 md:block lg:col-span-5">
            <div className="sticky top-24 flex h-[calc(100vh-12rem)] max-h-[640px] min-h-[420px] items-center">
              <div className="relative w-full">
                {SCENES.map((scene) => (
                  <div
                    key={scene.index}
                    className={cn(
                      "ease-expo-out transition-all duration-500 motion-reduce:transition-none",
                      active === scene.index
                        ? "translate-y-0 opacity-100"
                        : "pointer-events-none absolute inset-0 translate-y-2 opacity-0",
                    )}
                  >
                    <SurfaceForScene scene={scene.index} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Per-scene product surface ──────────────────────────────────────────
   Each scene's surface is a deliberately small, single-message card.
   The full clinical-home mock lives in §05b — these are focused excerpts
   that tell one step without distracting from the text. */

function SurfaceForScene({ scene }: { scene: number }) {
  switch (scene) {
    case 0:
      return <AdmitSurface />;
    case 1:
      return <DiagnoseSurface />;
    case 2:
      return <TreatSurface />;
    case 3:
      return <DischargeSurface />;
    case 4:
      return <LoopSurface />;
    default:
      return <AdmitSurface />;
  }
}

function SurfaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card relative overflow-hidden rounded-xl border shadow-lg dark:shadow-2xl">
      <div className="border-border bg-muted/50 flex items-center justify-between border-b px-3 py-1.5 text-[10.5px]">
        <span className="text-muted-foreground font-mono tracking-[0.15em] uppercase">
          app.medsync.health
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.15em] text-teal-800 uppercase dark:bg-teal-50/10 dark:text-teal-200">
          <span className="size-1 rounded-full bg-teal-500" />
          Illustrative
        </span>
      </div>
      {children}
    </div>
  );
}

function PatientLine() {
  return (
    <div className="border-border flex flex-wrap items-baseline justify-between gap-1 border-b pb-2.5">
      <div className="flex flex-col">
        <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.18em] uppercase">
          MS-00184 &middot; IM-Cardiology
        </span>
        <span className="font-display text-foreground text-[16px] font-medium">
          Amina N.{" "}
          <span className="text-muted-foreground font-sans text-[12px]">
            &middot; 47 &middot; F
          </span>
        </span>
      </div>
      <span className="bg-status-admitted-bg text-status-admitted-fg inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.15em] uppercase">
        <span className="size-1 rounded-full bg-current" />
        Active
      </span>
    </div>
  );
}

function AdmitSurface() {
  return (
    <SurfaceShell>
      <div className="flex flex-col gap-3 p-4">
        <PatientLine />
        <div className="grid grid-cols-2 gap-2 text-[11.5px]">
          {[
            { k: "NIN", v: "CM••••••88F" },
            { k: "DoB", v: "1979-04-12" },
            { k: "Phone", v: "+256 7•• ••• ••3" },
            { k: "Next of kin", v: "Mr. Wamala" },
            { k: "Insurer", v: "Self-pay" },
            { k: "Triage", v: "Yellow · 14:02" },
          ].map((f) => (
            <div key={f.k} className="border-border bg-muted/30 rounded-md border p-2">
              <p className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
                {f.k}
              </p>
              <p className="text-foreground tabular text-[12px]">{f.v}</p>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-[11px]">
          Captured once at the gate. Every subsequent screen reads from this same record.
        </p>
      </div>
    </SurfaceShell>
  );
}

function DiagnoseSurface() {
  return (
    <SurfaceShell>
      <div className="flex flex-col gap-3 p-4">
        <PatientLine />
        <div className="border-border bg-muted/30 grid grid-cols-3 gap-2 rounded-md border p-2">
          {[
            { k: "HbA1c", v: "9.8%", flag: "high" as const },
            { k: "Fasting glucose", v: "12.4 mmol/L", flag: "high" as const },
            { k: "BP", v: "152 / 94", flag: "high" as const },
            { k: "Creatinine", v: "94 µmol/L", flag: "ok" as const },
            { k: "eGFR", v: "78", flag: "ok" as const },
            { k: "K+", v: "4.4", flag: "ok" as const },
          ].map((m) => (
            <div key={m.k} className="flex flex-col gap-0.5">
              <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
                {m.k}
              </span>
              <span
                className={cn(
                  "tabular text-[12.5px] font-medium",
                  m.flag === "high" ? "text-status-critical-fg" : "text-foreground",
                )}
              >
                {m.v}
              </span>
            </div>
          ))}
        </div>
        <div className="border-border bg-card rounded-md border p-2.5">
          <p className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
            Differential &middot; Diabetology view
          </p>
          <ul className="text-foreground mt-1.5 flex flex-col gap-0.5 text-[11.5px]">
            <li>&middot; Poorly-controlled T2DM with hyperglycaemic episode</li>
            <li>&middot; Stage 1 hypertension</li>
            <li>&middot; Rule out diabetic ketoacidosis (anion gap, ketones)</li>
          </ul>
        </div>
      </div>
    </SurfaceShell>
  );
}

function TreatSurface() {
  return (
    <SurfaceShell>
      <div className="flex flex-col gap-3 p-4">
        <PatientLine />
        <div className="border-border bg-card flex items-start gap-2.5 rounded-md border p-2.5">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-teal-100 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200">
            <PillIcon className="size-3.5" strokeWidth={1.75} />
          </span>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-foreground text-[12.5px] font-medium">
              Insulin Actrapid &middot; sliding scale
            </span>
            <span className="text-muted-foreground text-[11px]">
              Pre-meal cover &middot; adjust per 4-hourly capillary glucose
            </span>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {[
                ["≤ 7", "0 IU"],
                ["7–10", "4 IU"],
                ["10–14", "6 IU"],
                ["14–18", "8 IU"],
                ["18–22", "10 IU"],
                ["> 22", "Call MO"],
              ].map(([range, dose]) => (
                <div
                  key={range}
                  className="border-border bg-muted/30 rounded border p-1 text-center"
                >
                  <span className="text-muted-foreground tabular block font-mono text-[9.5px]">
                    {range}
                  </span>
                  <span className="tabular text-foreground block text-[11px] font-medium">
                    {dose}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-status-stable-bg/70 dark:bg-status-stable-bg/40 flex items-start gap-2 rounded-md p-2.5">
          <span className="bg-status-stable-fg/15 text-status-stable-fg mt-0.5 inline-flex size-4 items-center justify-center rounded-full">
            <span className="bg-status-stable-fg block size-1.5 rounded-full" />
          </span>
          <div className="text-status-stable-fg flex flex-col text-[11px]">
            <span className="font-medium">
              Allergy check passed &middot; no penicillin / sulpha conflict
            </span>
            <span className="opacity-80">Signed: Dr. M. Okello &middot; 07:42</span>
          </div>
        </div>
      </div>
    </SurfaceShell>
  );
}

function DischargeSurface() {
  return (
    <SurfaceShell>
      <div className="flex flex-col gap-3 p-4">
        <PatientLine />
        <div className="border-border bg-card rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
              Discharge plan &middot; day 5
            </span>
            <span className="bg-status-discharged-bg text-status-discharged-fg inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9px] tracking-[0.15em] uppercase">
              Going home
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5 text-[11.5px]">
            {[
              "Metformin 1g BD · Glibenclamide 5mg OD · Lisinopril 10mg OD",
              "Home capillary glucose log · twice daily for 14 days",
              "Follow-up clinic · 14 days · Diabetology",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1 size-1 rounded-full bg-teal-500" />
                <span className="text-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-border bg-muted/30 rounded-md border p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
              SMS scheduled
            </span>
            <span className="text-muted-foreground tabular font-mono text-[9.5px]">
              4 reminders
            </span>
          </div>
          <p className="text-foreground mt-1 text-[11.5px]">
            &ldquo;Webale Amina. Reminder: Metformin 1g this morning. Reply 1 = taken, 2 = skipped,
            3 = call nurse.&rdquo;
          </p>
        </div>
      </div>
    </SurfaceShell>
  );
}

function LoopSurface() {
  return (
    <SurfaceShell>
      <div className="flex flex-col gap-3 p-4">
        <PatientLine />
        <div className="bg-status-critical-bg/70 dark:bg-status-critical-bg/40 flex items-start gap-2.5 rounded-md p-2.5">
          <span className="bg-status-critical-fg/15 text-status-critical-fg mt-0.5 inline-flex size-5 items-center justify-center rounded-full">
            <span className="bg-status-critical-fg block size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-status-critical-fg text-[12px] font-medium">
              Home reading &middot; glucose <span className="tabular font-mono">14.2 mmol/L</span>
              <span className="text-muted-foreground ml-1 font-normal">&middot; day 4, 22:14</span>
            </span>
            <span className="text-status-critical-fg/80 text-[10.5px]">
              SMS auto-replied. Ward team notified. Tele-follow-up booked.
            </span>
          </div>
        </div>
        <div className="border-border bg-card rounded-md border p-2.5">
          <p className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
            Booked automatically
          </p>
          <p className="text-foreground tabular mt-1 text-[12px] font-medium">
            Today 14:30 &middot; Tele follow-up &middot; Dr. M. Okello
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            The next clinic visit starts with this reading already on screen.
          </p>
        </div>
      </div>
    </SurfaceShell>
  );
}
