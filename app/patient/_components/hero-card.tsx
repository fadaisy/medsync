import type { ReactNode } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  HospitalIcon,
  PillIcon,
  StethoscopeIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@/supabase/functions/_shared/slots";

/**
 * The four states the hero can be in, as pure data — no `ReactNode`, no icon
 * components, no callbacks. A lucide icon is a function, and the moment one
 * becomes part of this type a server page that renders the hero inside a
 * client subtree throws "Functions cannot be passed directly to Client
 * Components". The union also makes the branch the caller's decision and the
 * rendering ours, so home cannot invent a fifth shape.
 */
export type HeroVariant =
  | { kind: "connect" }
  | {
      kind: "visit";
      clinicianName: string;
      departmentName: string | null;
      hospitalName: string | null;
      startsAtIso: string;
      statusLabel: string;
    }
  | {
      kind: "doses";
      taken: number;
      total: number;
      next: { name: string; timeLabel: string } | null;
    }
  | { kind: "first-reading" };

export interface HeroCardProps {
  variant: HeroVariant;
  className?: string;
}

/** `fetchAppointments` substitutes this when `users.fullName` is null. */
const CLINICIAN_FALLBACK = "Your clinician";

/**
 * ADR 0084 §10: a day and a day-part, never a clock numeral, on the patient
 * surface. A dawn-anchored Luganda clock reads "14:00" six hours out, and an
 * English AM/PM word does not fix the numeral — so there is no numeral. Local
 * noon is the boundary, the same one /patient/book and the reschedule picker
 * split on, so the hero and the visits list cannot disagree about a visit.
 *
 * Both are pinned to the clinic's zone. Unpinned they read the host's, which
 * is UTC on Vercel — three hours behind Kampala, so a visit before 03:00 EAT
 * showed the wrong DAY on the one card that exists to tell you which day.
 */
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function sessionOf(at: Date): string {
  return localWeekdayAndMinutes(at, DEFAULT_TIME_ZONE).minutesOfDay < 12 * 60
    ? "Morning session"
    : "Afternoon session";
}

/**
 * The workspace's one saturated surface: deep teal, light brand text, at
 * most one per screen. It replaces the three hand-built gradient CTAs (home's
 * connection banner, appointments, care).
 *
 * `medsync-forced-dark` is what makes it legal — it pins the brand and mint
 * scales (and `--gradient-hero`) to their light values so the card looks the
 * same in both themes. It does **not** pin `--status-*`, `--card`,
 * `--foreground` or `--muted-foreground`, so `Pill`, `ClinicalBadge` and any
 * `bg-status-*` / `text-destructive` / `bg-card` class inside this card would
 * invert in dark and disappear. Hence there is no slot to pass one in through:
 * state here is an inset chip on the pinned scales, and nothing else.
 */
export function HeroCard({ variant, className }: HeroCardProps) {
  const { href, srTitle, tile, body, chips, cta } = compose(variant);

  return (
    <section
      className={cn(
        "medsync-forced-dark bg-gradient-hero reveal-up rounded-2xl motion-reduce:animate-none",
        className,
      )}
    >
      <Link
        href={href}
        className="duration-fast ease-expo-out flex flex-col gap-4 rounded-2xl p-5 transition-[filter] md:p-6 md:hover:brightness-110"
      >
        <h2 className="sr-only">{srTitle}</h2>

        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="bg-brand-800 text-brand-100 grid size-12 shrink-0 place-items-center rounded-lg"
          >
            {tile}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">{body}</div>
        </div>

        {chips.length > 0 ? <ul className="flex flex-wrap gap-2">{chips}</ul> : null}

        {/* A span, not a Button: the whole card is already the link, and
            nesting a second interactive element inside it would give the row
            two tab stops for one destination. Mint on brand-900 is the
            signature pairing and both scales are pinned here. */}
        <span className="bg-mint-300 text-brand-900 text-body-s inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 font-medium">
          {cta}
          <ArrowRightIcon aria-hidden className="size-3.5" strokeWidth={1.5} />
        </span>
      </Link>
    </section>
  );
}

interface HeroContent {
  href: string;
  /** Names the card for a screen reader; never duplicates the visible title. */
  srTitle: string;
  tile: ReactNode;
  body: ReactNode;
  chips: ReactNode[];
  cta: string;
}

function compose(variant: HeroVariant): HeroContent {
  switch (variant.kind) {
    case "connect":
      return {
        href: "/patient/hospitals",
        srTitle: "Your hospital",
        tile: <HospitalIcon aria-hidden className="size-6" strokeWidth={1.5} />,
        body: (
          <>
            <p className="text-brand-50 text-body-l font-medium">Connect to a hospital</p>
            <p className="text-brand-200 text-body-s">
              Pick a MedSync hospital as your primary one. You can ask for a day there, and see your
              records when a clinician shares them.
            </p>
          </>
        ),
        chips: [],
        cta: "Find your hospital",
      };

    case "visit": {
      const at = new Date(variant.startsAtIso);
      const dated = !Number.isNaN(at.getTime());
      const where = [variant.departmentName, variant.hospitalName].filter(Boolean).join(" · ");

      return {
        href: "/patient/appointments",
        srTitle: "Your next visit",
        // Initials off the "Your clinician" fallback would be initials of a
        // placeholder — a fabricated identity. That case gets a glyph.
        tile:
          variant.clinicianName === CLINICIAN_FALLBACK ? (
            <StethoscopeIcon aria-hidden className="size-6" strokeWidth={1.5} />
          ) : (
            <span className="text-body-m font-medium">{initials(variant.clinicianName)}</span>
          ),
        body: (
          <>
            <p className="text-brand-50 text-body-l truncate font-medium">
              {variant.clinicianName}
            </p>
            {where ? <p className="text-brand-200 text-body-s truncate">{where}</p> : null}
          </>
        ),
        chips: [
          // The status word, not a Pill — see the note on the component.
          <Chip key="status">{variant.statusLabel}</Chip>,
          ...(dated
            ? [
                <Chip
                  key="date"
                  icon={<CalendarIcon aria-hidden className="size-3.5" strokeWidth={1.5} />}
                >
                  <span className="font-mono tabular-nums">{DATE_FMT.format(at)}</span>
                </Chip>,
                <Chip key="session">{sessionOf(at)}</Chip>,
              ]
            : []),
        ],
        cta: "See your visits",
      };
    }

    case "doses":
      return {
        href: "/patient/track/doses",
        srTitle: "Today's doses",
        tile: <PillIcon aria-hidden className="size-6" strokeWidth={1.5} />,
        body: (
          <>
            <p className="text-brand-50 text-display-s font-mono leading-none font-medium tabular-nums">
              {variant.taken}
              <span className="text-brand-200">/{variant.total}</span>
            </p>
            {/* "recorded", never "adherence": slot matching is a heuristic and
                this is the patient's own view of their own notes. */}
            <p className="text-brand-200 text-body-s">doses recorded today</p>
          </>
        ),
        chips: variant.next
          ? [
              <Chip
                key="next"
                icon={<ClockIcon aria-hidden className="size-3.5" strokeWidth={1.5} />}
              >
                Next · {variant.next.name} at{" "}
                <span className="font-mono tabular-nums">{variant.next.timeLabel}</span>
              </Chip>,
            ]
          : [],
        cta: "Open your dose timeline",
      };

    case "first-reading":
      return {
        href: "/patient/track/log",
        srTitle: "Self-tracking",
        tile: <ActivityIcon aria-hidden className="size-6" strokeWidth={1.5} />,
        body: (
          <>
            <p className="text-brand-50 text-body-l font-medium">Start with one reading</p>
            <p className="text-brand-200 text-body-s">
              A glucose, blood-pressure or weight reading takes a moment to log, and it stays here
              for whenever you or your clinician need it.
            </p>
          </>
        ),
        chips: [],
        cta: "Log a reading",
      };
  }
}

function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="bg-brand-800 text-brand-100 text-caption inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
      {icon}
      {children}
    </li>
  );
}

/** First letters of the first two words — "Sarah Nakato" → "SN". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
