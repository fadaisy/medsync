"use client";

import type { ProviderDetail } from "@/lib/patient/discover";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronLeftIcon,
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
import { DateTimeFields } from "./date-time-fields";

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

  const initials = initialsOf(provider.fullName);

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
          {/* ── When: the day and the time, as two fields (the reference's
              "Schedule send"); the calendar behind the first, the day's open
              times behind the second. */}
          <section className="flex flex-col gap-3">
            <h2 className="text-foreground text-body-m font-medium">When</h2>
            {days.length === 0 ? (
              <p className="text-muted-foreground bg-card text-body-s dark:shadow-card rounded-xl p-4 shadow-xs">
                {provider.fullName} has no days open on MedSync yet.
              </p>
            ) : (
              <DateTimeFields
                slotsByDate={provider.slotsByDate}
                day={day}
                slot={slot}
                onDay={(d) => {
                  setDay(d);
                  setSlot(null);
                }}
                onSlot={setSlot}
              />
            )}
          </section>

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
