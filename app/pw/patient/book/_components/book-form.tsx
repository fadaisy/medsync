"use client";

import type { Door } from "./why-coming";
import type { HospitalOption } from "@/lib/patient-web/book-data";
import type { PatientReasonCode } from "@/supabase/functions/_shared/sessions-sql";
import Link from "next/link";
import { useState } from "react";
import { shortDayOf } from "@patient-core/book-days";
import { ArrowRightIcon, PlusIcon } from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { BOOK_COPY as C } from "@/content/patient/book";
import { toSlot } from "@/lib/patient-web/opaque";
import { cn } from "@/lib/utils";
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";
import { HospitalPicker } from "./hospital-picker";
import { StepTitle, WhyComing } from "./why-coming";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

/** The Book page's state (who, which door, which reason) and its links onward; opaque ids only in URLs (W4). */
export function BookForm({
  me,
  household,
  glance,
  hospitals,
  areas,
  unseen,
}: {
  me: string | null;
  household: { id: string; label: string }[];
  glance: { openNow: boolean | null; nextDayKey: string | null } | null;
  /** Present only when the patient has no hospital yet (null = the list failed). */
  hospitals?: HospitalOption[] | null;
  areas: { key: string; label: string }[] | null;
  unseen: number;
}) {
  const [who, setWho] = useState<string | null>(null);
  const [door, setDoor] = useState<Door>("planned");
  const [reason, setReason] = useState<PatientReasonCode>("follow_up");
  const meLabel = me ?? C.me;

  const dayHref = `/patient/book/day?${new URLSearchParams({ r: toSlot(PATIENT_REASON_CODES, reason), ...(who ? { member: who } : {}) })}`;
  const todayHref = "/patient/book/today";
  // Joining today's line is for the account holder only: the intake has no "on behalf of".
  const todayOff = who !== null;
  const helpInPage = door === "wrong";

  const chip = (key: string | null, label: string, place = false) => {
    const on = who === key;
    return (
      <button
        key={key ?? "me"}
        type="button"
        aria-pressed={on}
        onClick={() => setWho(key)}
        className={cn(
          "inline-flex min-h-12 items-center gap-2 rounded-full pr-3.5 pl-1.5",
          FOCUS,
          on
            ? "bg-pw-act text-pw-on-act"
            : "bg-pw-surface text-pw-ink ring-pw-line-strong ring-1 ring-inset",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-9 place-items-center rounded-full text-[13px] font-bold",
            place ? "bg-pw-place-tint text-pw-place-text" : "bg-pw-info-tint text-pw-info-text",
          )}
        >
          {initialsOf(label)}
        </span>
        <span className="text-[15px] font-semibold">{label}</span>
      </button>
    );
  };

  return (
    <>
      <PageHeader
        back={{ href: "/patient", label: C.back }}
        overline={C.overline}
        area="visits"
        title={C.title}
        unseen={unseen}
        hideHelp={helpInPage}
      />
      <div className="flex max-w-3xl flex-col gap-7 max-[760px]:gap-5">
        {hospitals !== undefined ? <HospitalPicker hospitals={hospitals} /> : null}

        <section className="flex flex-col gap-2">
          <StepTitle n={1}>{C.whoTitle}</StepTitle>
          <div role="group" aria-label={C.whoTitle} className="flex flex-wrap gap-2">
            {chip(null, meLabel)}
            {household.map((m) => chip(m.id, m.label, true))}
            <Link
              href="/patient/household"
              aria-label={C.addSomeone}
              className={cn(
                "bg-pw-surface ring-pw-line-strong grid size-12 place-items-center rounded-full ring-1 ring-inset",
                FOCUS,
              )}
            >
              <PlusIcon className="size-5" {...ICON} />
            </Link>
          </div>
        </section>

        <WhyComing
          n={2}
          door={door}
          onDoor={setDoor}
          reason={reason}
          onReason={setReason}
          areas={areas}
          wrongHref={(area) =>
            `/patient/book/wrong${
              area
                ? `?${new URLSearchParams({
                    a: toSlot(
                      (areas ?? []).map((x) => x.key),
                      area,
                    ),
                  })}`
                : ""
            }`
          }
        />

        {door === "planned" ? (
          <section className="flex flex-col gap-2">
            <StepTitle n={3}>{C.howTitle}</StepTitle>
            <div className="grid gap-3 min-[761px]:grid-cols-2">
              <DoorCard
                href={todayOff ? null : todayHref}
                band
                tag={
                  glance?.openNow === true
                    ? C.openNow
                    : glance?.openNow === false
                      ? C.noWalkIns
                      : C.today
                }
                title={C.comeTodayTitle}
                line={todayOff ? C.comeTodayOff : C.honest}
              />
              <DoorCard
                href={dayHref}
                tag={
                  glance?.nextDayKey ? C.nextOpenDay(shortDayOf(glance.nextDayKey)) : C.pickOpenDay
                }
                title={C.askDayTitle}
                line={C.askDayLine}
              />
            </div>
          </section>
        ) : null}

        {helpInPage ? null : (
          <p className="text-pw-ink-3 text-center text-[13px] font-medium">{C.footnote}</p>
        )}
      </div>
    </>
  );
}

/** One "How" door: the navy "Come today" card or the white "Ask for a day" card. `href` null = not for this person. */
function DoorCard({
  href,
  band,
  tag,
  title,
  line,
}: {
  href: string | null;
  band?: boolean;
  tag: string;
  title: string;
  line: string;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
            band
              ? "bg-pw-band-glass text-pw-on-band-accent"
              : "bg-pw-place-tint text-pw-place-text",
          )}
        >
          <span
            aria-hidden
            className={cn("size-[7px] rounded-full", band ? "bg-pw-accent" : "bg-pw-area-visits")}
          />
          {tag}
        </span>
        <ArrowRightIcon className={cn("size-[22px]", !band && "text-pw-ink-3")} {...ICON} />
      </span>
      <span
        className={cn(
          "font-semibold tracking-[-0.02em]",
          band ? "text-[22px] leading-[27px]" : "text-[19px] leading-6",
        )}
      >
        {title}
      </span>
      <span
        className={cn("text-[15px] leading-[21px]", band ? "text-pw-on-band-2" : "text-pw-ink-2")}
      >
        {line}
      </span>
    </>
  );
  const cls = cn(
    "rounded-pw-card flex flex-col gap-2.5 p-4",
    band ? "bg-pw-band text-pw-on-band" : "bg-pw-surface text-pw-ink shadow-pw-card",
  );
  if (!href)
    return (
      <div aria-disabled="true" className={cn(cls, "opacity-60")}>
        {body}
      </div>
    );
  return (
    <Link
      href={href}
      className={cn(
        cls,
        FOCUS,
        "transition-[scale] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none",
      )}
    >
      {body}
    </Link>
  );
}

/** The phone's book/index.tsx initials: two words that start with a letter, else "ME". */
function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "ME"
  );
}
