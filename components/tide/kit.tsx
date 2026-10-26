import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { useId } from "react";
import { AlertTriangleIcon, CheckIcon, ClockIcon, InfoIcon, SirenIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * MedSync Tide at patient density (PROMPT-PATIENT-WEB-TIDE §5.4, DESIGN-medsync.md): the static pieces. Tokens
 * only (`pw-*` utilities from app/globals.css, generated from the phone's tide.ts). Red is the Help pill,
 * `tone="danger"` and a critical StatusPill only (L3); amber and green only in StatusPill and Note, always
 * with a word (L4). Icons are Lucide outline at 1.8 and always beside a word (or labelled).
 */

export const ICON = { strokeWidth: 1.8, "aria-hidden": true } as const;

// ─── Buttons ─────────────────────────────────────────────────────────────────────────────────────────

export type ButtonTone = "primary" | "accent" | "soft" | "outline" | "danger" | "glass" | "onBand";
export type ButtonSize = "l" | "m" | "s";

const TONE: Record<ButtonTone, string> = {
  primary: "bg-pw-act text-pw-on-act",
  accent: "bg-pw-accent text-pw-on-accent shadow-pw-accent",
  soft: "bg-pw-surface-3 text-pw-ink",
  outline: "bg-transparent text-pw-ink ring-[1.5px] ring-inset ring-pw-line-strong",
  danger: "bg-pw-emergency text-pw-on-emergency shadow-pw-emergency",
  glass: "bg-pw-band-glass text-pw-on-band",
  onBand: "bg-pw-on-band text-pw-band",
};
// Heights 52/44/36 (§4.2); the smaller two keep a 48 px hit area through a transparent outset.
const SIZE: Record<ButtonSize, string> = {
  l: "h-[52px] px-6 text-[17px]",
  m: "h-11 px-[18px] text-[15px] before:absolute before:-inset-y-0.5 before:inset-x-0",
  s: "h-9 px-3.5 text-sm before:absolute before:-inset-y-1.5 before:inset-x-0",
};

export function buttonClass(
  tone: ButtonTone = "primary",
  size: ButtonSize = "l",
  off = false,
): string {
  return cn(
    "relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold leading-none",
    "transition-[scale,filter] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus",
    SIZE[size],
    off
      ? "cursor-not-allowed bg-pw-act-off text-pw-on-act-off shadow-none"
      : cn(TONE[tone], "hover:brightness-105"),
  );
}

type ButtonProps = Omit<ComponentProps<"button">, "disabled"> & {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** A disabled button always says why (DESIGN-medsync screen rule 3). The reason shows under it. */
  disabledReason?: string;
  busy?: boolean;
};

export function Button({
  tone,
  size,
  disabledReason,
  busy,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const off = Boolean(disabledReason);
  const button = (
    <button
      {...rest}
      type={type}
      disabled={off || busy}
      aria-busy={busy || undefined}
      aria-describedby={off ? reasonId : rest["aria-describedby"]}
      className={cn(buttonClass(tone, size, off), className)}
    >
      {children}
    </button>
  );
  if (!off) return button;
  return (
    <span className="inline-flex flex-col items-stretch gap-1.5" data-disabled-reason>
      {button}
      <span id={reasonId} className="text-pw-ink-2 text-[13px] leading-[18px] font-medium">
        {disabledReason}
      </span>
    </span>
  );
}

export function ButtonLink({
  tone,
  size,
  className,
  ...rest
}: ComponentProps<typeof Link> & { tone?: ButtonTone; size?: ButtonSize }) {
  return <Link {...rest} className={cn(buttonClass(tone, size), className)} />;
}

export function TextLink({ className, ...rest }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...rest}
      className={cn(
        "text-pw-accent-text inline-flex min-h-12 items-center gap-1 font-semibold underline-offset-4 hover:underline",
        "focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
    />
  );
}

// ─── Pills ───────────────────────────────────────────────────────────────────────────────────────────

export type PillTone = "plain" | "info" | "place" | "glass" | "accent" | "navy";
const PILL: Record<PillTone, string> = {
  plain: "bg-pw-surface-3 text-pw-ink-2",
  info: "bg-pw-info-tint text-pw-info-text",
  place: "bg-pw-place-tint text-pw-place-text",
  glass: "bg-pw-band-glass text-pw-on-band",
  accent: "bg-pw-accent-tint text-pw-accent-text",
  navy: "bg-pw-band text-pw-on-band",
};
const PILL_BASE =
  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] text-xs font-semibold leading-none";

export function Pill({
  tone = "plain",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn(PILL_BASE, PILL[tone], className)}>{children}</span>;
}

/** Clinical state, always an icon and a word (L4). `critical` is a danger reading or an emergency only (L3). */
export type StatusTone = "stable" | "caution" | "critical" | "pending" | "info";
const STATUS: Record<StatusTone, { cls: string; Icon: typeof CheckIcon }> = {
  stable: { cls: "bg-pw-stable-tint text-pw-stable-text", Icon: CheckIcon },
  caution: { cls: "bg-pw-caution-tint text-pw-caution-text", Icon: AlertTriangleIcon },
  critical: { cls: "bg-pw-critical-tint text-pw-critical-text", Icon: SirenIcon },
  pending: { cls: "bg-pw-pending-tint text-pw-pending-text", Icon: ClockIcon },
  info: { cls: "bg-pw-info-tint text-pw-info-text", Icon: InfoIcon },
};

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: string;
  className?: string;
}) {
  const { cls, Icon } = STATUS[tone];
  return (
    <span className={cn(PILL_BASE, cls, className)} data-status={tone}>
      <Icon className="size-3.5" {...ICON} />
      {children}
    </span>
  );
}

export function DemoRibbon() {
  return <Pill>Demo data</Pill>;
}

// ─── Surfaces ────────────────────────────────────────────────────────────────────────────────────────

export function Card({ flat, className, ...rest }: ComponentProps<"section"> & { flat?: boolean }) {
  return (
    <section
      {...rest}
      className={cn(
        "rounded-pw-card min-w-0 p-5",
        flat ? "bg-pw-surface-2" : "bg-pw-surface shadow-pw-card",
        className,
      )}
    />
  );
}

/** The navy band: tickets, the health card, a visit's header. */
export function Band({ className, ...rest }: ComponentProps<"section">) {
  return (
    <section
      {...rest}
      className={cn("rounded-pw-card bg-pw-band text-pw-on-band min-w-0 p-5", className)}
    />
  );
}

export type NoteTone = "info" | "caution" | "plain" | "place";
const NOTE: Record<NoteTone, { cls: string; Icon: typeof InfoIcon }> = {
  info: { cls: "bg-pw-info-tint text-pw-info-text", Icon: InfoIcon },
  caution: { cls: "bg-pw-caution-tint text-pw-caution-text", Icon: AlertTriangleIcon },
  plain: { cls: "bg-pw-surface-2 text-pw-ink-2", Icon: InfoIcon },
  place: { cls: "bg-pw-place-tint text-pw-place-text", Icon: InfoIcon },
};

export function Note({
  tone = "plain",
  children,
  className,
}: {
  tone?: NoteTone;
  children: ReactNode;
  className?: string;
}) {
  const { cls, Icon } = NOTE[tone];
  return (
    <div
      className={cn(
        "rounded-pw-row flex items-start gap-3 p-4 text-[15px] leading-[21px] font-medium",
        cls,
        className,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" {...ICON} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function IconDisc({
  children,
  tone = "soft",
  className,
}: {
  children: ReactNode;
  tone?: "soft" | "accent" | "glass";
  className?: string;
}) {
  const cls = {
    soft: "bg-pw-surface-3 text-pw-ink",
    accent: "bg-pw-accent-tint text-pw-accent-text",
    glass: "bg-pw-band-glass text-pw-on-band",
  }[tone];
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", cls, className)}>
      {children}
    </span>
  );
}

export function Avatar({
  initials,
  label,
  className,
}: {
  initials: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "bg-pw-info-tint text-pw-info-text grid size-12 shrink-0 place-items-center rounded-full text-[15px] font-bold",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export type Area = "readings" | "medicines" | "visits" | "team" | "me";
const AREA_DOT: Record<Area, string> = {
  readings: "bg-pw-area-readings",
  medicines: "bg-pw-area-medicines",
  visits: "bg-pw-area-visits",
  team: "bg-pw-area-team",
  me: "bg-pw-area-me",
};

/** The area overline: a place dot and its word, never a fill behind text (DESIGN-medsync colour laws). */
export function Overline({ area, children }: { area?: Area; children: ReactNode }) {
  return (
    <span className="text-pw-ink-2 inline-flex items-center gap-2 text-xs leading-4 font-semibold tracking-[0.06em] uppercase">
      {area ? <span aria-hidden className={cn("size-2 rounded-full", AREA_DOT[area])} /> : null}
      {children}
    </span>
  );
}

export function SectionHead({
  title,
  action,
  id,
}: {
  title: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 id={id} className="text-xl leading-[26px] font-semibold tracking-[-0.015em]">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-pw-row bg-pw-surface-3 animate-pulse motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** Three honest empties (DESIGN-medsync rule 3): nothing yet, no data, not set; and couldn't load. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-pw-card bg-pw-surface-2 flex flex-col items-start gap-3 p-6">
      <p className="text-[17px] leading-[22px] font-semibold">{title}</p>
      {body ? <p className="text-pw-ink-2 text-[15px] leading-[21px] font-medium">{body}</p> : null}
      {action}
    </div>
  );
}
