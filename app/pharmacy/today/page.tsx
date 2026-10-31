import Link from "next/link";

import { EmptyState, LatePill, Panel } from "@/components/tide/work/kit";
import { TODAY } from "@/content/pharmacy-rework-daily";
import { fill } from "@/content/pharmacy-workspace-v2";
import { todayItems } from "@/lib/pharmacy/derive/today";
import { cn } from "@/lib/utils";
import { todayFeed } from "./_lib/feed";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const T = TODAY;
const SHOWN = 6;

/**
 * Today (rework PRD §6.1): one work list ranked for the person's role, one button per item, the first as Next up;
 * six shown, then "Show all", then the items for other roles on shift.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { role, items } = await todayFeed();
  const { mine, others } = todayItems(role, items);
  const all = sp.all === "1";
  const showOthers = sp.others === "1";
  const shown = all ? mine : mine.slice(0, SHOWN);
  return (
    <div className="flex flex-col gap-4">
      <Panel title={T.yourWork} note={`${T.roles[role]} · ${fill(T.inOrder, { n: mine.length })}`}>
        {mine.length ? (
          <ol className="flex flex-col gap-2">
            {shown.map((i, n) => (
              <li
                key={i.key}
                className={cn(
                  "flex flex-col gap-2 rounded-[14px] p-3 sm:flex-row sm:items-center sm:justify-between",
                  n === 0 ? "bg-card shadow-tide-card" : "bg-tide-sunken",
                )}
              >
                <div className="min-w-0">
                  {n === 0 ? (
                    <div className="text-caption text-ink-700 font-semibold">{T.nextUp}</div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {i.title}
                    {i.late ? <LatePill>{T.late}</LatePill> : null}
                  </div>
                  {i.meta ? <div className="text-body-s text-ink-600">{i.meta}</div> : null}
                </div>
                <Link
                  href={i.href}
                  className={cn(
                    "focus-visible:shadow-focus inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-[14px] font-semibold outline-none",
                    n === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground shadow-tide-card",
                  )}
                >
                  {i.action}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title={T.nothing} />
        )}
        <div className="mt-3 flex flex-wrap gap-4">
          {mine.length > SHOWN ? (
            <Link
              className="text-body-s text-primary font-medium"
              href={all ? "/pharmacy/today" : "/pharmacy/today?all=1"}
            >
              {all ? T.showFewer : fill(T.showAll, { n: mine.length })}
            </Link>
          ) : null}
          {others.length ? (
            <Link
              className="text-body-s text-primary font-medium"
              href={showOthers ? "/pharmacy/today" : "/pharmacy/today?others=1"}
            >
              {fill(T.others, { n: others.length })}
            </Link>
          ) : null}
        </div>
      </Panel>
      {showOthers && others.length ? (
        <Panel title={T.othersTitle}>
          <ul className="flex flex-col gap-2">
            {others.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{i.title}</span>{" "}
                  <span className="text-body-s text-ink-600">{i.meta}</span>
                </span>
                <Link className="text-body-s text-primary font-medium" href={i.href}>
                  {i.action}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
