"use client";

import type { ProviderDetail } from "@/lib/patient/discover";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  InfoIcon,
  MessageSquareIcon,
  PhoneIcon,
  StarIcon,
  StethoscopeIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";

import { BottomActionBar, BottomActionBarSpacer } from "@/components/responsive/bottom-action-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TimeRuler } from "./time-ruler";

/**
 * The provider screen — the reference design's first panel, component for
 * component: the photo card with its back and save controls, the rating
 * badge, the name and credential lines, the action row, the three-column
 * stats strip, "Select Date" with its month stepper and day cards, "Select
 * Time", and the docked booking control.
 *
 * The palette is ours (DESIGN-medsync.md): the reference's navy is
 * `brand-900`, its tinted grounds are `brand-50`, and its photo gradient is a
 * flat tint — decorative grounds are an anti-pattern here.
 *
 * Every number in the strip is one the tables hold (ADR 0085). The reference
 * reads "8 Years Experience · 3.5k+ Patients · 2.8k+ Reviews"; nothing in
 * MedSync records a career, so that slot states when this clinician joined
 * this hospital and is labelled as exactly that. Patients and reviews are
 * counted, and read "—" before there are any rather than a flattering zero.
 *
 * Time is a chip grid, not the reference's tick-mark ruler. A ruler is a
 * slider over discrete values: it loses the 44px target, arrow-key traversal
 * and the announced selected state that a radio group gives for free, on
 * phones that are often shared and often low-end. Same rhythm, same place in
 * the layout, an affordance that survives a screen reader.
 */

const DAY_LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

export function ProviderScreen({
  provider,
  /** Rendered when the line charges — resolved server-side (ADR 0092). */
  feeLine,
  feeNotes,
}: {
  provider: ProviderDetail;
  feeLine: string | null;
  feeNotes: ReadonlyArray<string>;
}) {
  const router = useRouter();
  const days = useMemo(() => Object.keys(provider.slotsByDate).sort(), [provider.slotsByDate]);
  const [day, setDay] = useState<string | null>(days[0] ?? null);
  const [slot, setSlot] = useState<string | null>(null);

  const slots = day ? (provider.slotsByDate[day] ?? []) : [];
  const initials = initialsOf(provider.fullName);
  // The month stepper walks the days the engine returned, never a calendar:
  // a month with nothing open is a month with nothing to step to.
  const months = useMemo(() => [...new Set(days.map((d) => d.slice(0, 7)))], [days]);
  const monthOf = day?.slice(0, 7) ?? months[0] ?? null;
  const monthIndex = monthOf ? months.indexOf(monthOf) : -1;

  const stepMonth = (delta: number) => {
    const next = months[monthIndex + delta];
    if (!next) return;
    const firstOfMonth = days.find((d) => d.startsWith(next));
    if (firstOfMonth) {
      setDay(firstOfMonth);
      setSlot(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Two columns on a desk — who they are on the left, when you can see
          them on the right — so the whole choice sits on one screen; one
          column on a phone, where the docked bar carries the button. */}
      <div className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-6">
        <div className="flex flex-col gap-4">
          {/* ── The photo card ─────────────────────────────────────── */}
          <section className="bg-brand-50 relative overflow-hidden rounded-3xl">
            <div className="relative aspect-[4/5] w-full sm:aspect-[16/10] md:aspect-[4/3]">
              {provider.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed, expiring Supabase URL
                <img
                  src={provider.photoUrl}
                  alt=""
                  className="size-full object-cover"
                  decoding="async"
                />
              ) : (
                <span className="grid size-full place-items-center">
                  {initials ? (
                    <span className="text-brand-700 font-mono text-5xl font-medium">
                      {initials}
                    </span>
                  ) : (
                    <StethoscopeIcon
                      strokeWidth={1.25}
                      className="text-brand-700 size-16"
                      aria-hidden
                    />
                  )}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              className="bg-card text-foreground focus-visible:ring-ring absolute top-4 left-4 grid size-11 place-items-center rounded-full shadow-xs focus-visible:ring-2 focus-visible:outline-none"
            >
              <ChevronLeftIcon className="size-5" aria-hidden />
            </button>

            {/* The reference's heart is a saved-doctors feature MedSync has no
            table for. Rather than a control that forgets, this slot carries
            the one fact that earns the position: continuity (PRD §2.7). */}
            {provider.seenBefore ? (
              <span className="bg-card text-brand-700 text-caption absolute top-4 right-4 rounded-full px-3 py-2 font-medium shadow-xs">
                Seen you before
              </span>
            ) : null}

            {provider.rating ? (
              <span className="bg-card text-foreground text-body-s absolute bottom-4 left-4 inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-medium shadow-xs">
                <StarIcon className="fill-brand-500 text-brand-500 size-3.5" aria-hidden />
                <span className="font-mono tabular-nums">{provider.rating.average.toFixed(1)}</span>
              </span>
            ) : null}
          </section>

          {/* ── Name and credentials ───────────────────────────────── */}
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-foreground text-heading-l leading-tight font-medium tracking-[-0.015em]">
              {provider.fullName}
            </h1>
            <p className="text-muted-foreground text-body-s">
              {[provider.cadreName, provider.departmentName].filter(Boolean).join(" · ")}
            </p>
          </header>

          {/* ── Action row ─────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <span className="bg-brand-50 text-brand-700 text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-medium">
              <InfoIcon className="size-4" aria-hidden />
              Details
            </span>
            <span className="flex items-center gap-2">
              {/* Only affordances that do something. A phone or chat button with
              no transport behind it is a fake affordance; `allow_virtual` is
              real, and a video visit is bookable as `type: "virtual"`. */}
              <ActionCircle
                icon={<VideoIcon className="size-4" aria-hidden />}
                label={
                  provider.allowVirtual
                    ? "This clinician offers video visits"
                    : "This clinician sees patients in person only"
                }
                caption={provider.allowVirtual ? "Video" : "In person"}
                available={provider.allowVirtual}
              />
              <ActionCircle
                icon={<PhoneIcon className="size-4" aria-hidden />}
                label="Calling a clinician is not available in MedSync"
                caption="No calls"
                available={false}
              />
              <ActionCircle
                icon={<MessageSquareIcon className="size-4" aria-hidden />}
                label="Messaging a clinician is not available in MedSync"
                caption="No chat"
                available={false}
              />
            </span>
          </div>

          {/* ── Stats strip ────────────────────────────────────────── */}
          <dl className="bg-card dark:shadow-card grid grid-cols-3 gap-2 rounded-2xl p-4 shadow-xs">
            <Stat
              icon={<ClockIcon className="size-4" aria-hidden />}
              value={yearsWithUs(provider.withUsSinceIso)}
              label="With us"
            />
            <Stat
              icon={<UsersIcon className="size-4" aria-hidden />}
              value={provider.patientsSeen > 0 ? compact(provider.patientsSeen) : "—"}
              label="Patients"
            />
            <Stat
              icon={<StarIcon className="size-4" aria-hidden />}
              value={provider.rating ? compact(provider.rating.count) : "—"}
              label="Reviews"
            />
          </dl>
        </div>

        <div className="flex flex-col gap-4">
          {/* ── Select Date ────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-foreground text-body-m font-medium">Select date</h2>
              {monthOf ? (
                <div className="flex items-center gap-1">
                  <StepButton dir="prev" disabled={monthIndex <= 0} onClick={() => stepMonth(-1)} />
                  <span className="text-foreground text-body-s min-w-24 text-center font-medium">
                    {MONTH_LONG.format(new Date(`${monthOf}-01T12:00:00Z`))}
                  </span>
                  <StepButton
                    dir="next"
                    disabled={monthIndex < 0 || monthIndex >= months.length - 1}
                    onClick={() => stepMonth(1)}
                  />
                </div>
              ) : null}
            </div>

            {days.length === 0 ? (
              <p className="text-muted-foreground bg-card text-body-s dark:shadow-card rounded-xl p-4 shadow-xs">
                {provider.fullName} has no days open on MedSync yet.
              </p>
            ) : (
              <ul
                aria-label="Available days"
                className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
              >
                {days.map((d) => {
                  const at = new Date(`${d}T12:00:00Z`);
                  const selected = d === day;
                  return (
                    <li key={d} className="snap-start">
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setDay(d);
                          setSlot(null);
                        }}
                        className={cn(
                          "ease-expo-out duration-fast flex min-h-20 w-18 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                          selected
                            ? "bg-accent text-accent-foreground ring-brand-300 focus-visible:ring-brand-500 ring-1"
                            : "bg-card text-foreground dark:shadow-card focus-visible:ring-ring shadow-xs",
                        )}
                      >
                        <span className="text-heading-s font-mono tabular-nums">
                          {at.getUTCDate()}
                        </span>
                        <span
                          className={cn(
                            "text-caption",
                            selected ? "text-accent-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {DAY_LONG.format(at).slice(0, 3)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Select Time ────────────────────────────────────────── */}
          {day && slots.length > 0 ? (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-foreground text-body-m font-medium">Select time</h2>
                <span className="text-muted-foreground text-caption tabular-nums">
                  {slots.length} {slots.length === 1 ? "time" : "times"} open
                </span>
              </div>
              <TimeRuler slots={slots} value={slot} onChange={setSlot} />
            </section>
          ) : null}

          {/* ── The fee, stated before the patient commits (ADR 0092) ─ */}
          {feeLine ? (
            <dl className="bg-muted flex flex-col gap-1 rounded-2xl p-4">
              <dt className="text-overline text-muted-foreground uppercase">Fee</dt>
              <dd className="text-foreground text-body-m font-medium">{feeLine}</dd>
              {feeNotes.map((note) => (
                <dd key={note} className="text-muted-foreground text-body-s">
                  {note}
                </dd>
              ))}
            </dl>
          ) : null}

          <div className="hidden md:block">
            {slot ? (
              <Link
                href={`/patient/book?line=${provider.lineId}&clinician=${provider.userId}&slot=${encodeURIComponent(slot)}`}
                className={cn(buttonVariants({ size: "lg" }), "w-full rounded-full")}
              >
                Book this time
              </Link>
            ) : (
              <Button size="lg" disabled className="w-full rounded-full">
                {days.length === 0 ? "No days open" : "Pick a day and time"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="md:hidden">
        {/* ── Docked CTA — the house sticky bar, which clears the tab bar; a
          `fixed bottom-0` here sat UNDER `MobileTabBar` (z-30) and was
          unreachable on a phone. */}
        <BottomActionBar>
          {slot ? (
            <Link
              href={`/patient/book?line=${provider.lineId}&clinician=${provider.userId}&slot=${encodeURIComponent(slot)}`}
              className={cn(buttonVariants({ size: "lg" }), "w-full rounded-full")}
            >
              Book this time
            </Link>
          ) : (
            <Button size="lg" disabled className="w-full rounded-full">
              {days.length === 0 ? "No days open" : "Pick a day and time"}
            </Button>
          )}
        </BottomActionBar>
      </div>
      <BottomActionBarSpacer />
    </div>
  );
}

/**
 * One circle of the action row. `role="img"` so the label is exposed — an
 * aria-label on a bare span is prohibited on the generic role and read by
 * nothing — and the state is also in WORDS beside it (`caption`), never in
 * the tint alone (DESIGN: no colour-only state).
 */
function ActionCircle({
  icon,
  label,
  caption,
  available,
}: {
  icon: React.ReactNode;
  label: string;
  /** The one-word visible state: "Video" / "Not offered". */
  caption: string;
  available: boolean;
}) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        role="img"
        aria-label={label}
        className={cn(
          "grid size-11 place-items-center rounded-full",
          available
            ? "bg-card text-brand-700 dark:shadow-card shadow-xs"
            : "bg-muted text-muted-foreground/60",
        )}
      >
        {icon}
      </span>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </span>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-brand-700" aria-hidden>
        {icon}
      </span>
      {/* dt before dd in the DOM; the visual order is the same, so no CSS reorder. */}
      <dt className="text-muted-foreground text-caption order-2">{label}</dt>
      <dd className="text-foreground text-body-m order-1 font-mono font-medium tabular-nums">
        {value === "—" ? <span aria-label="none yet">—</span> : value}
      </dd>
    </div>
  );
}

function StepButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous month" : "Next month"}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-11 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
    >
      {dir === "prev" ? (
        <ChevronLeftIcon className="size-4" aria-hidden />
      ) : (
        <ChevronRightIcon className="size-4" aria-hidden />
      )}
    </button>
  );
}

/** "3 yrs" / "New" — what we actually know, which is time on MedSync here. */
function yearsWithUs(iso: string | null): string {
  if (!iso) return "—";
  const years = Math.floor((Date.now() - new Date(iso).getTime()) / (365.25 * 86_400_000));
  return years < 1 ? "New" : `${years} yr${years === 1 ? "" : "s"}`;
}

/** 3549 → "3,549". Never rounded, never a "+": the count is exact, so it is shown exactly. */
function compact(n: number): string {
  return n.toLocaleString("en-UG");
}

function initialsOf(name: string): string | null {
  if (name === "Your clinician") return null;
  const letters = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter((c): c is string => !!c && /\p{L}/u.test(c))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || null;
}
