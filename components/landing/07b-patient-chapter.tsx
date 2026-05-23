import { CheckCircle2Icon, ClockIcon, MessageCircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  MyHealthAdherenceStrip,
  MyHealthLogReadingCard,
  MyHealthReportConcernCard,
  MyHealthSmsReminderChip,
  MyHealthTodayMedsCard,
} from "./_my-health-mock";

/**
 * §07b — "Your health, in your hands" (patient-POV chapter).
 *
 * The patient-experience addendum's GATE PC: a dedicated patient-side
 * chapter inserted between §07 [01] (the platform / clinician loop)
 * and §08 (mid-band CTA). So the narrative now reads:
 *   - §07  [01]  platform / clinician loop ("the closed loop, scene by scene")
 *   - §07b /for patients  ("your health, in your hands")
 *   - §08  CTA break
 *   - §09a [02]  team / specialty adaptation
 *
 * Same Attio "numbered chapter" archetype the existing chapters use:
 *   - small mono kicker
 *   - display H2 headline
 *   - intro paragraph
 *   - body content (four sub-points, alternating text/surface rows)
 *
 * Sub-point surfaces are composed from the floating-card primitives
 * exported by _my-health-mock.tsx so the visual vocabulary stays
 * identical to the hero and §07 scenes — no new card style.
 *
 * Sub-point d's surface is a small custom CareTeamReplyCard built
 * here (not in the mock) because it shows the *other end* — Dr.
 * Okello acknowledging the reading. Same Amina, same data, same
 * clinician: closes the "logging into silence" reassurance loop.
 */

interface SubPoint {
  letter: string;
  number: string;
  pillar: string;
  title: React.ReactNode;
  body: React.ReactNode;
  surface: React.ReactNode;
}

const SUBPOINTS: SubPoint[] = [
  {
    letter: "a",
    number: "01",
    pillar: "Log in seconds",
    title: (
      <>
        Log in seconds,{" "}
        <span className="text-teal-700 italic dark:text-teal-300">not in a notebook</span>.
      </>
    ),
    body: (
      <>
        <p>
          The notebook in a clinical pocket can&rsquo;t call for help &mdash; that&rsquo;s the gap
          MedSync was built to close. On the patient&rsquo;s side, that means a one-tap
          fasting-glucose entry, BP capture, or symptom log, with the most recent reading and a
          short trend always visible.
        </p>
        <p>
          Every reading lands on the same record the ward sees. No re-typing at the next clinic
          visit. No notebook left behind.
        </p>
      </>
    ),
    surface: (
      <PatientSurfaceColumn>
        <MyHealthLogReadingCard />
      </PatientSurfaceColumn>
    ),
  },
  {
    letter: "b",
    number: "02",
    pillar: "Never lose track of a dose",
    title: (
      <>
        Never lose track of <span className="text-teal-700 italic dark:text-teal-300">a dose</span>.
      </>
    ),
    body: (
      <>
        <p>
          Reminders by push <em>and</em> SMS, so the prompt reaches the phone the patient actually
          has &mdash; a basic Nokia handles a 06:00 dose check just as well as a smartphone. Tap to
          confirm; reply <span className="tabular font-mono">1</span> to confirm by text.
        </p>
        <p>
          Missed doses are a gentle nudge, never a punishment. The streak says &ldquo;5 days on
          track,&rdquo; not &ldquo;79% compliant.&rdquo; If the care team holds a medication
          mid-week (like Amina&rsquo;s glibenclamide here), the app shows the decision &mdash; the
          patient doesn&rsquo;t wonder why they skipped a pill.
        </p>
      </>
    ),
    surface: (
      <PatientSurfaceColumn>
        <MyHealthTodayMedsCard />
        <MyHealthAdherenceStrip />
        <MyHealthSmsReminderChip />
      </PatientSurfaceColumn>
    ),
  },
  {
    letter: "c",
    number: "03",
    pillar: "Tell your team without a trip",
    title: (
      <>
        Tell your team{" "}
        <span className="text-teal-700 italic dark:text-teal-300">without a trip to hospital</span>.
      </>
    ),
    body: (
      <>
        <p>
          &ldquo;Something feels off?&rdquo; is a calm channel, not an emergency button. Log the
          symptom or side effect; your clinician decides whether a tele-follow-up will do or a visit
          is needed. Realistic expectation set up front &mdash; reviewed by a human, not a chatbot,
          not instantly.
        </p>
        <p>
          For Amina, a 14.2 mmol/L reading and a note about dizziness becomes a booked tele
          follow-up at 14:30 the same day, without the cost or the journey.
        </p>
      </>
    ),
    surface: (
      <PatientSurfaceColumn>
        <MyHealthReportConcernCard />
      </PatientSurfaceColumn>
    ),
  },
  {
    letter: "d",
    number: "04",
    pillar: "You're never logging into silence",
    title: (
      <>
        You&rsquo;re never logging{" "}
        <span className="text-teal-700 italic dark:text-teal-300">into silence</span>.
      </>
    ),
    body: (
      <>
        <p>
          Every reading lands on the same record Dr.&nbsp;Okello sees on the ward dashboard above.
          The patient knows by name who reviews their data &mdash; this is not a faceless AI agent;
          it&rsquo;s the same care team they meet in clinic.
        </p>
        <p>
          The reassurance line at the bottom of the app (&ldquo;Your care team can see this &middot;
          Dr.&nbsp;M.&nbsp;Okello&rdquo;) is the emotional core: data only matters if a human is
          looking, and someone is.
        </p>
      </>
    ),
    surface: (
      <PatientSurfaceColumn>
        <CareTeamReplyCard />
      </PatientSurfaceColumn>
    ),
  },
];

export function PatientChapter() {
  return (
    <section
      id="for-patients"
      aria-labelledby="patient-chapter-headline"
      className="border-border bg-background relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 pt-16 pb-12 sm:px-8 sm:pt-24 sm:pb-20">
        {/* Chapter header — same archetype as §07, §09a, §10a, §12a */}
        <div className="mb-12 flex flex-col gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="size-1 rounded-full bg-teal-500" />/ for patients
          </span>
          <h2
            id="patient-chapter-headline"
            className="font-display text-foreground max-w-[26ch] text-[34px] leading-[1.08] tracking-[-0.025em] text-balance sm:text-[52px]"
            style={{ fontWeight: 400 }}
          >
            Your health,{" "}
            <span className="text-teal-700 italic dark:text-teal-300">in your hands</span>.
          </h2>
          <p className="text-muted-foreground max-w-[64ch] text-[15px] leading-[1.55] sm:text-[17px]">
            The closed loop only closes if the patient is in it. From Amina&rsquo;s side, that means
            a one-tap reading, dose reminders that reach the phone in her pocket, and a calm channel
            to tell her team when something feels off &mdash; without trekking into hospital.
          </p>
        </div>

        {/* Sub-points — alternating text/surface rows for rhythm */}
        <ol className="flex flex-col gap-12 sm:gap-16">
          {SUBPOINTS.map((sp, i) => (
            <li key={sp.letter}>
              <SubPointRow subpoint={sp} reversed={i % 2 === 1} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SubPointRow({ subpoint, reversed }: { subpoint: SubPoint; reversed: boolean }) {
  return (
    <article className="grid gap-8 md:grid-cols-12 md:gap-12 lg:gap-16">
      {/* Text column */}
      <div
        className={cn("flex flex-col gap-4 md:col-span-7", reversed ? "md:order-2" : "md:order-1")}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "tabular inline-flex size-7 items-center justify-center rounded-md font-mono text-[11px]",
              "bg-teal-100 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200",
            )}
          >
            {subpoint.number}
          </span>
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
            {subpoint.letter} &middot; {subpoint.pillar}
          </span>
        </div>
        <h3
          className="font-display text-foreground text-[26px] leading-[1.15] tracking-[-0.02em] text-balance sm:text-[34px]"
          style={{ fontWeight: 400 }}
        >
          {subpoint.title}
        </h3>
        <div className="text-foreground/85 flex flex-col gap-3 text-[14.5px] leading-[1.6] sm:text-[15.5px]">
          {subpoint.body}
        </div>
      </div>

      {/* Surface column */}
      <div
        className={cn(
          "flex justify-center md:col-span-5 md:items-start",
          reversed ? "md:order-1 md:justify-start" : "md:order-2 md:justify-end",
        )}
      >
        {subpoint.surface}
      </div>
    </article>
  );
}

function PatientSurfaceColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-[320px] flex-col gap-3">
      <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[9.5px] tracking-[0.18em] uppercase">
        <span className="bg-border h-px w-5" />
        Amina&rsquo;s phone
      </span>
      {children}
    </div>
  );
}

/* ─── Sub-point d's bespoke surface ──────────────────────────────────────
   "Your reading just landed on Dr. Fadhul's screen." Small static
   confirmation card — Dr. Fadhul acknowledged, tele-follow-up booked.
   Same Amina, same data, same clinician as everywhere else on the page.
   Lives here (not in the mock) because it's specific to this chapter's
   reassurance beat. */

function CareTeamReplyCard() {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
          Your care team
        </span>
        <span className="text-muted-foreground tabular font-mono text-[9.5px]">11:02</span>
      </div>

      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-full",
            "bg-teal-100 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200",
            "font-mono text-[11px] font-medium",
          )}
        >
          MO
        </span>
        <div className="flex flex-col">
          <span className="text-foreground text-[12.5px] leading-tight font-medium">
            Dr. Usama Fadhul
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
            <CheckCircle2Icon className="size-2.5" strokeWidth={2} />
            Saw your reading &middot; 11:02
          </span>
        </div>
      </div>

      <div className="bg-muted/40 border-border rounded-md border p-2.5">
        <p className="text-foreground text-[11.5px] leading-snug">
          &ldquo;Glucose <span className="tabular font-mono">14.2</span> &mdash; let&rsquo;s get you
          in for a check this afternoon. Hold this morning&rsquo;s glibenclamide.&rdquo;
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1",
            "border border-teal-200 bg-teal-50/60 text-[10.5px] text-teal-900",
            "dark:border-teal-700 dark:bg-teal-50/10 dark:text-teal-100",
          )}
        >
          <ClockIcon className="size-3" strokeWidth={1.75} />
          Tele follow-up booked &middot; today 14:30
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
          <MessageCircleIcon className="size-2.5" strokeWidth={1.75} />
          via app
        </span>
      </div>
    </div>
  );
}
