"use client";

import type { RuleHistoryRow, RulesView } from "@/lib/pharmacy/setup/types";
import { SearchIcon } from "lucide-react";

import { Dot } from "@/components/pharmacy/medicines/shared";
import { Panel } from "@/components/tide/work/kit";
import { day, RULES_TAB as R } from "@/content/pharmacy-setup-rules";
import { cn } from "@/lib/utils";

export type Tile = "" | "pending" | "unsigned";

const tileCls =
  "rounded-tide-tile flex min-w-0 flex-col items-start gap-0.5 border px-3 py-2.5 text-left transition-colors duration-150 ease-expo-out";

/** C1: the count, the explainer, the search and the four tiles (pending and unsigned filter the group list). */
export function Header({
  view,
  history,
  q,
  setQ,
  tile,
  setTile,
}: {
  view: RulesView;
  history: RuleHistoryRow[];
  q: string;
  setQ: (q: string) => void;
  tile: Tile;
  setTile: (t: Tile) => void;
}) {
  const total = view.groups.reduce((a, g) => a + g.rules.length, 0);
  const unsigned = view.groups.filter((g) => !g.signed);
  const P = view.proposals;
  const last = history[0];
  const T = R.tiles;
  const tiles: { id: Tile | null; label: string; value: string; sub: string; dot: boolean }[] = [
    {
      id: "",
      label: T.inForce,
      value: String(total),
      sub: T.groups(view.groups.length),
      dot: false,
    },
    {
      id: "pending",
      label: T.waiting,
      value: String(P.length),
      sub: P.length ? T.oneSig(P.filter((p) => p.roles.length === 1).length) : T.nothingWaiting,
      dot: P.length > 0,
    },
    {
      id: "unsigned",
      label: T.unsigned,
      value: String(unsigned.length),
      sub: unsigned.length ? unsigned.map((g) => g.title).join(", ") : T.allSigned,
      dot: unsigned.length > 0,
    },
    {
      id: null,
      label: T.last,
      value: last ? day(last.at) : T.none,
      sub: last
        ? T.lastSub(last.kind === "group_signed" ? R.groupWord : last.name, R.kind[last.kind])
        : "",
      dot: false,
    },
  ];
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-[64ch] min-w-0 flex-col gap-1">
          <h2 className="text-heading-m text-foreground">
            {R.heading}{" "}
            <span className="text-ink-600 font-normal">· {R.count(total, view.groups.length)}</span>
          </h2>
          <p className="text-body-s text-ink-600">{R.explain}</p>
        </div>
        <label className="border-ink-300 bg-card focus-within:shadow-focus flex h-10 w-full items-center gap-1.5 rounded-full border px-3 sm:w-auto">
          <SearchIcon aria-hidden className="text-ink-600 size-3.5 shrink-0" />
          <input
            type="search"
            aria-label={R.searchAria}
            placeholder={R.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="text-body-s text-foreground h-9 min-w-0 flex-1 bg-transparent outline-none sm:w-56"
          />
        </label>
      </div>
      <div
        role="group"
        aria-label={R.summaryAria}
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {tiles.map((t) => {
          const body = (
            <>
              <span className="text-caption text-ink-700 flex items-center gap-1.5">
                {t.dot ? <Dot className="bg-status-caution-fg-aa" /> : null}
                {t.label}
              </span>
              <span className="text-foreground text-[22px] leading-7 font-semibold tabular-nums">
                {t.value}
              </span>
              <span className="text-caption text-ink-600 min-w-0 break-words">{t.sub}</span>
            </>
          );
          if (t.id === null)
            return (
              <div key={t.label} className={cn(tileCls, "border-border")}>
                {body}
              </div>
            );
          const on = tile === t.id;
          return (
            <button
              key={t.label}
              type="button"
              aria-pressed={on}
              onClick={() => setTile(on ? "" : t.id!)}
              className={cn(
                tileCls,
                "focus-visible:shadow-focus outline-none",
                on
                  ? "border-tide-lagoon bg-tide-lagoon-tint"
                  : "border-border bg-card hover:bg-ink-50",
              )}
            >
              {body}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
