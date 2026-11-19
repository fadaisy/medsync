"use client";

import type { DoctorCard } from "@patient-core/doctors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  availabilityWords,
  dayKeyOf,
  doctorPreviews,
  placeOfNextDay,
  shortDayOf,
} from "@patient-core/doctors";
import { ChevronRightIcon, UserIcon } from "lucide-react";

import { ICON, SectionHead, TextLink } from "@/components/tide/kit";
import { HOME_COPY as C } from "@/content/patient/home";
import { cn } from "@/lib/utils";

const FOCUS =
  "focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * "See a doctor" on Home (the phone's features/home/doctors.tsx, "portrait", 18 Nov 2026): up to four small
 * portrait previews of the doctors with the soonest open day (`doctorPreviews`). No count of people anywhere
 * (ADR 0084 §6), no rating, no placeholder doctor. "See all" opens Book. `doctors` is null when they could
 * not be read; then, and when none is open, the section is one quiet row.
 */
export function DoctorsView({ doctors }: { doctors: DoctorCard[] | null }) {
  const router = useRouter();
  const previews = doctors ? doctorPreviews(doctors) : [];
  if (!doctors) return <QuietRow line={C.doctorsFailed} onRetry={() => router.refresh()} />;
  if (previews.length === 0)
    return (
      <QuietRow
        line={doctors.length === 0 ? C.doctorsNone : C.doctorsNoOpenDay}
        href="/patient/book"
      />
    );
  const today = dayKeyOf(new Date());
  return (
    <section aria-labelledby="see-doctor" className="flex min-w-0 flex-col gap-3">
      <SectionHead
        id="see-doctor"
        title={C.seeDoctor}
        action={<TextLink href="/patient/book">{C.seeAll}</TextLink>}
      />
      <ul className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pt-0.5 pb-3.5">
        {previews.map((d) => (
          <li key={d.key} className="snap-start">
            <DoctorPreview d={d} todayKey={today} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One doctor: the photo (or a quiet silhouette) with the day in the fewest words on a chip ("Today", filled,
 * or "Thu 19 Nov"; the word says it, so colour is never alone), then the name, the role and where. It asks
 * that doctor for a day, where they are open first.
 */
function DoctorPreview({ d, todayKey }: { d: DoctorCard; todayKey: string }) {
  const at = placeOfNextDay(d);
  const available = availabilityWords(d.nextDayKey, todayKey, shortDayOf);
  const where =
    d.places.length === 1 ? at.hospitalName : C.andMore(at.hospitalName, d.places.length - 1);
  const day = available.today ? C.today : d.nextDayKey ? shortDayOf(d.nextDayKey) : "";
  const href = `/patient/book/day?${new URLSearchParams({
    doctor: d.userId,
    department: at.departmentId,
    hospital: at.hospitalId,
  })}`;
  return (
    <Link
      href={href}
      aria-label={`${d.name}, ${d.role}. ${where}. ${available.text}.${C.askForDay}`}
      className={cn(
        "rounded-pw-card bg-pw-surface shadow-pw-card flex w-[156px] flex-col overflow-hidden",
        "transition-[scale] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none",
        FOCUS,
      )}
    >
      <span className="bg-pw-surface-3 relative flex h-[118px] items-end justify-center overflow-hidden">
        {d.photoUrl ? (
          // A signed URL good for an hour, from pt-bookable-clinicians: no optimiser in between.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.photoUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="fill-pw-ink-3 -mb-[18px] size-[104px] opacity-40"
          >
            <circle cx={12} cy={9} r={4.2} />
            <path d="M3.5 24c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" />
          </svg>
        )}
        <span
          aria-hidden
          className={cn(
            "absolute top-2.5 left-2.5 flex min-h-[26px] items-center rounded-full px-2.5 text-xs font-semibold",
            available.today ? "bg-pw-accent text-pw-on-accent" : "bg-pw-surface text-pw-ink",
          )}
        >
          {day}
        </span>
      </span>
      <span className="flex flex-col px-3.5 pt-3 pb-3.5">
        <span className="truncate text-[15px] font-semibold">{d.name}</span>
        <span className="text-pw-ink-2 truncate text-xs font-medium">{d.role}</span>
        <span className="text-pw-ink-2 truncate text-xs font-medium">{where}</span>
      </span>
    </Link>
  );
}

/**
 * While the doctors load, cannot be read, or none is open: one quiet row that still leads to Book (or, on a
 * failure, tries again; or, with no hospital, leads to choosing one).
 */
export function QuietRow({
  line,
  href,
  onRetry,
}: {
  line: string;
  href?: string;
  onRetry?: () => void;
}) {
  const body = (
    <>
      <span className="bg-pw-surface-3 text-pw-ink-2 grid size-11 shrink-0 place-items-center rounded-full">
        <UserIcon className="size-5" {...ICON} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-[15px] font-semibold">{C.seeDoctor}</span>
        <span className="text-pw-ink-2 text-xs font-medium">{line}</span>
      </span>
      <ChevronRightIcon className="text-pw-ink-3 size-5 shrink-0" {...ICON} />
    </>
  );
  const cls = cn(
    "rounded-pw-card bg-pw-surface shadow-pw-card flex min-h-[68px] w-full items-center gap-3 px-3.5 py-3",
    FOCUS,
  );
  if (onRetry)
    return (
      <button
        type="button"
        onClick={onRetry}
        aria-label={`${C.seeDoctor}. ${line} ${C.tryAgain}`}
        className={cls}
      >
        {body}
      </button>
    );
  return (
    <Link href={href ?? "/patient/book"} className={cls}>
      {body}
    </Link>
  );
}
