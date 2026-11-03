"use client";

import type { LogFilter, SectionProps } from "./index";
import Link from "next/link";
import { useState } from "react";

import { setBudgetAction } from "@/app/pharmacy/setup/setup-actions";
import { Chip, inputCls, labelCls } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { Panel } from "@/components/tide/work/kit";
import { MSG } from "@/content/pharmacy-setup-messages";
import { smsBudgetTone } from "@/lib/pharmacy/derive/setup/messages";
import { cn } from "@/lib/utils";

const M = MSG.month;
const BAR = { ok: "bg-tide-lagoon", warn: "bg-status-caution-fg", bad: "bg-status-caution-fg" };

/** §D1: the connected chip, the rule chips, the tiles (three filter the outbox) and the budget bar. */
export function ThisMonth({
  view,
  run,
  pending,
  filter,
  setFilter,
}: SectionProps & { filter: LogFilter; setFilter: (f: LogFilter) => void }) {
  const s = view.stats;
  const connected = !!view.provider?.connected;
  const [budget, setBudget] = useState(String(view.budgetUgx ?? ""));
  const b = view.budgetUgx ?? 0;
  const raw = b ? Math.round((view.spentUgx / b) * 100) : 0;
  const pct = Math.min(100, raw);
  const tone = smsBudgetTone(raw, view.rules.capPct);

  const tiles: { id: LogFilter | null; label: string; value: string; sub: string }[] = [
    { id: "all", label: M.sent, value: String(s.sent), sub: M.sentSub },
    {
      id: "delivered",
      label: M.delivered,
      value: `${Math.round((s.delivered / Math.max(1, s.sent)) * 100)}%`,
      sub: M.deliveredSub(s.delivered),
    },
    { id: "failed", label: M.failed, value: String(s.failed), sub: M.failedSub },
    { id: "queued", label: M.queued, value: String(s.queued), sub: M.queuedSub },
    { id: null, label: M.optedOut, value: String(s.optedOut), sub: M.optedOutSub(s.consented) },
  ];

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {M.title}
          <Chip tone={connected ? "green" : "amber"}>
            {connected ? M.connected : M.notConnected}
          </Chip>
        </span>
      }
      note={
        <>
          {M.note}{" "}
          <Link
            href={M.rulesHref}
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            {M.rulesLink}
          </Link>
          .
        </>
      }
      action={
        <span className="flex flex-wrap gap-1.5">
          {[M.quiet, M.perPatient(view.rules.perPatient), M.cap(view.rules.capPct)].map((c) => (
            <Chip key={c} tone="grey">
              {c}
            </Chip>
          ))}
        </span>
      }
    >
      <div
        role="group"
        aria-label={M.tilesLabel}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {tiles.map((t) => {
          const on = t.id !== null && t.id !== "all" && filter === t.id;
          const body = (
            <>
              <span className="text-caption text-muted-foreground font-medium">{t.label}</span>
              <span className="text-[22px] leading-[28px] font-semibold tabular-nums">
                {t.value}
              </span>
              <span className="text-caption text-muted-foreground">{t.sub}</span>
            </>
          );
          const cls = cn(
            "rounded-tide-tile flex min-w-0 flex-col items-start gap-0.5 px-3 py-2.5 text-left",
            on
              ? "bg-tide-lagoon-tint shadow-[inset_0_0_0_1px_var(--color-tide-lagoon)]"
              : "bg-card shadow-[inset_0_0_0_1px_var(--color-ink-200)]",
          );
          return t.id === null ? (
            <div key={t.label} className={cls}>
              {body}
            </div>
          ) : (
            <button
              key={t.label}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(on || t.id === "all" ? "all" : (t.id as LogFilter))}
              className={cn(
                cls,
                "focus-visible:shadow-focus hover:bg-ink-50 transition-colors duration-150 outline-none",
              )}
            >
              {body}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
          <span aria-hidden className="bg-tide-sunken block h-2 overflow-hidden rounded-full">
            <span
              className={cn("block h-full rounded-full", BAR[tone])}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span
            className={cn(
              "text-body-s font-semibold",
              tone === "warn" && "text-status-caution-fg-aa",
              tone === "bad" && "text-status-caution-fg-aa",
            )}
          >
            {b ? M.budgetLine(view.spentUgx, b, raw, tone === "bad") : M.noBudget(view.spentUgx)}
          </span>
        </div>
        {view.can.manage ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => setBudgetAction({ ugx: Number(budget) || 0 }),
                () => M.budgetSaved,
              );
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>{M.budget}</span>
              <input
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))}
                className={cn(inputCls, "w-32 tabular-nums")}
              />
            </label>
            <LabButton type="submit" busy={pending}>
              {M.saveBudget}
            </LabButton>
          </form>
        ) : null}
      </div>
    </Panel>
  );
}
