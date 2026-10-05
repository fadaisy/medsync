"use client";

import type { PackView, ViewItem } from "@/lib/ncd/pack/view";
import type { NcdProfile } from "@/lib/ncd/profile";
import {
  AlertTriangleIcon,
  ClipboardListIcon,
  FlaskConicalIcon,
  HelpCircleIcon,
  PillIcon,
  ShieldQuestionIcon,
  TargetIcon,
} from "lucide-react";

import { NcdDifferential } from "./ncd-differential";

/**
 * The decision panel when the diabetes pack is live (NCD_DM_PACK_LIVE; ADRs 0204 to 0207). It replaces the v0.1.0
 * verdicts and keeps the form's completeness and the examination differential, which the pack does not own.
 *
 * Order is the order of action: the one interrupt, then today, medicines to review, the diagnosis by criteria set,
 * the plan (care, targets, bands) and the questions that would complete it. Red is the interrupt only; every state
 * is a word as well as a colour.
 */

const OVERLINE = "font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground/80";
const CARD = "border-border bg-card rounded-lg border shadow-xs";

const STATE_WORD: Record<string, string> = {
  met: "Met",
  not_met: "Not met",
  insufficient: "Not assessed",
  unavailable: "Cannot assess here",
};
const URGENCY_WORD: Record<ViewItem["urgency"], string> = {
  now: "Now",
  today: "Today",
  soon: "Soon",
  routine: "Routine",
};

function Header({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <header className="border-border/60 bg-muted/40 flex items-center gap-2 border-b px-3.5 py-2">
      {icon}
      <span className="text-foreground text-caption font-medium tracking-[0.04em]">{title}</span>
      {count !== undefined ? (
        <span className="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums">
          {count}
        </span>
      ) : null}
    </header>
  );
}

function ItemList({ items }: { items: ViewItem[] }) {
  return (
    <ul className="divide-border/50 divide-y">
      {items.map((it) => (
        <li key={it.id} className="flex items-start gap-2 px-3.5 py-2">
          <span
            className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              it.urgency === "today"
                ? "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {URGENCY_WORD[it.urgency]}
          </span>
          <span className="text-foreground min-w-0 flex-1 text-[12.5px] leading-snug">
            {it.display}
            {it.askFirst ? (
              <span className="text-muted-foreground block text-[11px]">
                Shown because pregnancy is not recorded: ask first.
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function NcdPackView({ view, profile }: { view: PackView; profile: NcdProfile }) {
  const { completeness } = profile;
  const dm = view.diagnosis.filter((d) => d.verdict === "diabetes");
  const other = view.diagnosis.filter((d) => d.verdict !== "diabetes");
  return (
    <div className="flex flex-col gap-3">
      {view.interrupt ? (
        <section
          role="alert"
          className="scale-in overflow-hidden rounded-xl border border-red-500/40 bg-red-50 shadow-sm dark:bg-red-950/30"
        >
          <div className="flex items-start gap-2 px-3.5 py-3">
            <AlertTriangleIcon
              className="size-4 shrink-0 translate-y-0.5 text-red-600 dark:text-red-400"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-body-m font-medium tracking-[-0.01em] text-red-900 dark:text-red-100">
                {view.interrupt.title}
              </h3>
              {view.interrupt.actions.length ? (
                <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] leading-snug text-red-900/90 dark:text-red-100/85">
                  {view.interrupt.actions.map((a) => (
                    <li key={a}>Also: {a}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <NcdDifferential result={profile.differential} />

      {view.today.length ? (
        <section className="bg-card overflow-hidden rounded-xl border border-amber-400/60 dark:border-amber-700/60">
          <Header
            icon={
              <AlertTriangleIcon
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
            }
            title="Do today"
            count={view.today.length}
          />
          <ItemList items={view.today} />
        </section>
      ) : null}

      {view.flags.length ? (
        <section className="bg-card overflow-hidden rounded-xl border border-amber-400/60 dark:border-amber-700/60">
          <Header
            icon={<PillIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />}
            title="Medicines to review"
            count={view.flags.length}
          />
          <ul className="divide-border/50 divide-y">
            {view.flags.map((f) => (
              <li key={f.id} className="px-3.5 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      f.severity === "red"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                        : "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
                    }`}
                  >
                    {f.severity === "red" ? "Stop or act now" : "Review"}
                  </span>
                  <span className="text-foreground min-w-0 flex-1 text-[12.5px] font-medium">
                    {f.display}
                  </span>
                </div>
                <p className="text-foreground/80 mt-0.5 text-[11.5px] leading-snug">{f.action}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={`${CARD} px-3.5 py-3`}>
        <div className="flex items-baseline gap-2">
          <span className={OVERLINE}>Recorded</span>
          <span className="text-foreground ml-auto font-mono text-[11px] tabular-nums">
            {completeness.percent}%
          </span>
        </div>
        <div className="bg-muted mt-1.5 h-1 rounded-full">
          <div
            className="ease-expo-out bg-brand-500 h-1 rounded-full transition-[width] duration-250"
            style={{ width: `${completeness.percent}%` }}
          />
        </div>
        <p className="text-muted-foreground border-border/60 mt-2.5 flex items-center gap-1.5 border-t pt-2 text-[10.5px]">
          <ShieldQuestionIcon className="size-3 shrink-0" aria-hidden />
          Diabetes pack {view.packVersion}: signed by the CSO; the second clinical reviewer has not
          signed yet. Decision support, not clinical advice.
        </p>
      </section>

      <section className={`${CARD} overflow-hidden`}>
        <header className="border-border/60 border-b px-3.5 py-2">
          <span className={OVERLINE}>Diagnosis</span>
        </header>
        <ul className="divide-border/50 divide-y">
          {[...dm, ...other].map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3.5 py-1.5 text-[12.5px]">
              <span className="text-foreground min-w-0 flex-1">
                {d.label}
                {d.isDefault ? <span className="text-muted-foreground"> (default)</span> : null}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                  d.state === "met"
                    ? "bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {STATE_WORD[d.state] ?? d.state}
              </span>
            </li>
          ))}
        </ul>
        {view.classification.length ? (
          <p className="border-border/60 text-foreground border-t px-3.5 py-2 text-[12px]">
            Supports: {view.classification.map((c) => c.display).join(", ")}
          </p>
        ) : null}
      </section>

      {view.caveats.length ? (
        <section className="bg-card overflow-hidden rounded-lg border border-amber-300/60 dark:border-amber-800/60">
          <Header
            icon={
              <FlaskConicalIcon
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
            }
            title="Results to read with care"
          />
          <ul className="divide-border/50 divide-y">
            {view.caveats.map((c) => (
              <li key={c.id} className="px-3.5 py-2 text-[12px] leading-snug">
                {c.label}
                {c.alternative ? (
                  <span className="text-muted-foreground block">{c.alternative}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.targets.length || view.bands.length ? (
        <section className={`${CARD} overflow-hidden`}>
          <Header
            icon={<TargetIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />}
            title="Targets"
          />
          <ul className="divide-border/50 divide-y text-[12.5px]">
            {view.targets.map((t) => (
              <li key={t.id} className="px-3.5 py-1.5">
                {t.display}
              </li>
            ))}
            {view.bands.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-3.5 py-1.5">
                <span className="text-muted-foreground min-w-0 flex-1 font-mono text-[11px]">
                  {b.feature}
                </span>
                <span className="text-foreground">{b.display}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.care.length ? (
        <section className={`${CARD} overflow-hidden`}>
          <Header
            icon={
              <ClipboardListIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            }
            title="Care plan"
            count={view.care.length}
          />
          <ItemList items={view.care} />
        </section>
      ) : null}

      {view.questions.length || view.withheld ? (
        <section className={`${CARD} overflow-hidden`}>
          <Header
            icon={
              <HelpCircleIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            }
            title="Questions that would complete this"
          />
          <ul className="divide-border/50 divide-y text-[12px]">
            {view.withheld ? (
              <li className="px-3.5 py-1.5">
                Is she pregnant, or within 6 weeks of a birth? {view.withheld} item
                {view.withheld === 1 ? " is" : "s are"} waiting for the answer.
              </li>
            ) : null}
            {view.questions.slice(0, 8).map((q) => (
              <li key={q.feature} className="text-foreground px-3.5 py-1.5">
                {q.display}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
