import type { NavIcon } from "../_lib/places";
import type { Hue } from "@/lib/design/domains";
import type { ReactNode } from "react";
import {
  CheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  ClockIcon,
  StethoscopeIcon,
  UserCheckIcon,
  UserIcon,
} from "lucide-react";

import { Avatar } from "@/components/medsync/avatar";
import { DomainTile } from "@/components/medsync/domain-tile";
import { Tag } from "@/components/medsync/tag";
import { DOMAIN_HUE } from "@/lib/design/domains";
import { CONDITION_CATALOGUE } from "@/lib/ncdreg/standard/conditions";
import { cn } from "@/lib/utils";
import { ICONS, PLACE } from "../_lib/places";

/**
 * Shared pieces of the NCD screens (§11). Clinical classes pair a tone with a word and an icon,
 * never colour alone; red never appears; categories say "from latest result"; a clinician-recorded
 * status carries its tag and never the words "in range".
 */

export function PageTitle({
  title,
  subline,
  right,
  place,
}: {
  title: string;
  subline?: ReactNode;
  right?: ReactNode;
  /** The screen's place: a domain tile in its hue beside the title (Chroma header tile). */
  place?: NavIcon;
}) {
  const Icon = place ? ICONS[place] : null;
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {place && Icon ? (
          <DomainTile domain={PLACE[place]} icon={<Icon />} size="md" className="print:hidden" />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-display-s text-foreground">{title}</h1>
          {subline ? <p className="text-body-s text-muted-foreground">{subline}</p> : null}
        </div>
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2 print:hidden">{right}</div> : null}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-6 sm:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Conditions as tags in one neutral place hue: identity, not a clinical state. */
/**
 * Each condition keeps one cool hue, in catalogue order (sky, iris, grape, plum, repeating), so a
 * patient's conditions read apart at a glance. Tags only; never a status, a count or a button.
 */
const CONDITION_HUES: readonly Hue[] = ["sky", "iris", "grape", "plum"];
export function conditionHue(code: string): Hue {
  const i = CONDITION_CATALOGUE.findIndex((m) => m.code === code);
  return i < 0 ? "slate" : CONDITION_HUES[i % CONDITION_HUES.length]!;
}

/** A patient's monogram (Chroma: patients wear the patients hue). Decorative; the name is beside it. */
export function PatientMonogram({ name }: { name: string }) {
  return <Avatar name={name} hue={DOMAIN_HUE.patients} size="md" />;
}

export function ConditionTags({ conditions }: { conditions: { code: string; label: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {conditions.map((c) => (
        <Tag key={c.code} hue={conditionHue(c.code)}>
          {c.label}
        </Tag>
      ))}
    </span>
  );
}

/**
 * An outcome class at a visit. Leading class: stable tone with a check. Any other measured class:
 * caution tone with a dot. Not recorded, no visit, not assessed: neutral with a dashed circle.
 * A clinician-recorded class says so.
 */
export function ClassChip({
  label,
  leading,
  cls,
  clinicianRecorded,
}: {
  label: string;
  leading: boolean;
  cls?: string;
  clinicianRecorded?: boolean;
}) {
  const neutral =
    cls === "not_recorded" ||
    cls === "no_visit" ||
    cls === "not_assessed" ||
    cls === "not_classifiable";
  const tone = leading
    ? "bg-status-stable-bg text-status-stable-fg"
    : neutral
      ? "bg-ink-100 text-ink-700"
      : "bg-status-caution-bg text-status-caution-fg-aa";
  const Icon = leading ? CheckIcon : neutral ? CircleDashedIcon : CircleDotIcon;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "text-caption inline-flex h-6 items-center gap-1 rounded-full px-2 font-medium whitespace-nowrap",
          tone,
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      {clinicianRecorded ? (
        <span
          className="text-ink-600 border-ink-200 inline-flex h-5 items-center rounded border px-1.5 text-[11px]"
          title="Recorded by the clinician, not measured"
        >
          Clinician-recorded
        </span>
      ) : null}
    </span>
  );
}

const STAGES = {
  not_arrived: { label: "Not arrived", icon: UserIcon },
  waiting: { label: "Waiting", icon: ClockIcon },
  measurements_taken: { label: "Measurements taken", icon: UserCheckIcon },
  with_clinician: { label: "With clinician", icon: StethoscopeIcon },
  closed: { label: "Closed", icon: CheckIcon },
} as const;
export type Stage = keyof typeof STAGES;

/** B8 stage: an icon and a word, in ink (workflow, not a clinical signal). */
export function StageLabel({ stage }: { stage: Stage }) {
  const s = STAGES[stage];
  return (
    <span className="text-ink-800 inline-flex items-center gap-2 font-medium">
      <s.icon className="text-ink-500 size-4" aria-hidden />
      {s.label}
    </span>
  );
}

/** A masked phone number; a demo number is labelled and never dialable (§10.6 interlock 3). */
export function PhoneText({
  masked,
  invalid,
  demo,
}: {
  masked: string;
  invalid?: boolean;
  demo?: boolean;
}) {
  if (invalid) return <span className="text-muted-foreground">Number flagged invalid</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-mono tabular-nums">{masked}</span>
      {demo ? <span className="text-ink-600 text-[11px]">Demo number, do not call</span> : null}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-border flex flex-col items-start gap-3 rounded-xl border border-dashed px-6 py-10">
      <p className="text-body-m text-foreground font-medium">{title}</p>
      {children}
    </div>
  );
}

/** A measured number, always in text (B2). */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono tabular-nums", className)}>{children}</span>;
}

/** Roomy list density (§11.3): ~58px rows, 14px text, hairline dividers, no zebra. */
export const ROOMY_TABLE = "[&_td]:h-14 [&_td]:text-[14px] [&_th]:h-11 [&_th]:text-[13px]";

export const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export const fmtShort = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
export const fmtTime = (iso: string, timeZone = "Africa/Kampala") =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
export const fmtDateTime = (d: Date, timeZone = "Africa/Kampala") =>
  d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
