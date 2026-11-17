import type { TicketView } from "@patient-core/ticket-view";
import type { StageView } from "@patient-core/visit-stages";
import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarPlusIcon,
  ClockIcon,
  FlaskConicalIcon,
  UsersRoundIcon,
} from "lucide-react";

import { buttonClass, ICON } from "@/components/tide/kit";
import { StageStrip } from "@/components/tide/v2-stages";
import { TicketV2 } from "@/components/tide/v2-ticket";
import { HOME_V2_COPY as H } from "@/content/patient-app/home";
import { MEMBERSHIP_COPY as M } from "@/content/patient-app/membership";
import { cn } from "@/lib/utils";

export interface HomeV2Props {
  visit: { ticket: TicketView; stage: StageView; today: boolean; href: string } | null;
  results: { state: "ready"; ready: number; waiting: number } | { state: "off" };
  household: { id: string; label: string }[];
  card: { tierName: string; memberNo: string; plus: boolean };
}

const CARD = "rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-3 p-5";

/**
 * Visit mode Home on the web (patient app v2, board 16): today's or the next visit as the ticket with the stage
 * strip, the two ways to book, free results, the household and the small membership card. Server-rendered from
 * the patient's own rows; stages in words only (MR4); results are free whatever the plan (MR9).
 */
export function HomeV2(p: HomeV2Props) {
  return (
    <div className="grid grid-cols-1 gap-6 min-[1024px]:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="home-visit">
          <h2 id="home-visit" className="text-[20px] font-semibold">
            {p.visit ? (p.visit.today ? H.today : H.next) : H.none}
          </h2>
          {p.visit ? (
            <>
              <TicketV2 {...p.visit.ticket} />
              {p.visit.today ? (
                <div className={CARD}>
                  <StageStrip view={p.visit.stage} />
                </div>
              ) : null}
              <Link href={p.visit.href} className={cn(buttonClass("outline", "m"), "self-start")}>
                {H.seeVisit}
                <ArrowRightIcon className="size-4" {...ICON} />
              </Link>
            </>
          ) : (
            <p className="text-pw-ink-2 text-[15px]">{H.noneNote}</p>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="home-book">
          <h2 id="home-book" className="text-[20px] font-semibold">
            {H.book.title}
          </h2>
          <div className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2">
            {(
              [
                ["/patient/book/today", H.book.today, H.book.todayNote, ClockIcon],
                ["/patient/book/day", H.book.day, H.book.dayNote, CalendarPlusIcon],
              ] as const
            ).map(([href, title, note, Icon]) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  CARD,
                  "hover:bg-pw-surface-2 focus-visible:outline-pw-focus focus-visible:outline-2",
                )}
              >
                <Icon className="text-pw-accent-text size-6" {...ICON} />
                <span className="text-[17px] font-semibold">{title}</span>
                <span className="text-pw-ink-2 text-[14px]">{note}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-6">
        <Link
          href="/patient/me"
          className={cn(CARD, "bg-pw-ticket-navy text-pw-ticket-on-navy")}
          aria-label={H.card.open}
        >
          <span className="text-pw-on-band-2 text-[12px] font-semibold tracking-[0.08em] uppercase">
            {H.card.title}
          </span>
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[20px] font-semibold">Tether</span>
            <span className="bg-pw-band-glass rounded-full px-2.5 py-1 text-[12px] font-semibold">
              {p.card.tierName}
            </span>
          </span>
          <span className="font-pw-mono text-[14px] tracking-[0.16em]">{p.card.memberNo}</span>
          {!p.card.plus ? (
            <span className="text-pw-on-band-2 text-[13px]">{M.plans.trial}</span>
          ) : null}
        </Link>

        <section className={CARD} aria-labelledby="home-results">
          <div className="flex items-center justify-between gap-3">
            <h2 id="home-results" className="flex items-center gap-2 text-[17px] font-semibold">
              <FlaskConicalIcon className="size-5" {...ICON} />
              {H.results.title}
            </h2>
            <span className="bg-pw-accent-tint text-pw-accent-text rounded-full px-2.5 py-1 text-[12px] font-semibold">
              {H.results.free}
            </span>
          </div>
          {p.results.state === "ready" ? (
            <>
              <p className="text-[15px]">
                {p.results.ready
                  ? H.results.ready.replace("{n}", String(p.results.ready))
                  : H.results.noneReady}
              </p>
              {p.results.waiting ? (
                <p className="text-pw-ink-3 text-[13px]">
                  {H.results.waiting.replace("{n}", String(p.results.waiting))}
                </p>
              ) : null}
              <Link
                href="/patient/care/labs"
                className="text-pw-accent-text min-h-11 self-start text-[14px] font-semibold"
              >
                {H.results.open}
              </Link>
            </>
          ) : (
            <p className="text-pw-ink-2 text-[14px]">{H.results.off}</p>
          )}
        </section>

        <section className={CARD} aria-labelledby="home-household">
          <h2 id="home-household" className="flex items-center gap-2 text-[17px] font-semibold">
            <UsersRoundIcon className="size-5" {...ICON} />
            {H.household.title}
          </h2>
          {p.household.length === 0 ? (
            <p className="text-pw-ink-2 text-[14px]">{H.household.none}</p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {p.household.map((m) => (
              <li key={m.id}>
                <Link
                  href="/patient/book/day"
                  className="text-pw-accent-text inline-flex min-h-11 items-center text-[15px] font-semibold"
                >
                  {H.household.book.replace("{name}", m.label)}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/patient/me/household" className={cn(buttonClass("soft", "s"), "self-start")}>
            {H.household.add}
          </Link>
        </section>
      </aside>
    </div>
  );
}
