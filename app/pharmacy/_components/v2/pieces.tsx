"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";
import { ChevronRightIcon, InfoIcon, MoreHorizontalIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";
import { cn } from "@/lib/utils";

const K = PHWS2.kit;

/**
 * The limits line (D-PW-08, NavMap rule 4): one slim line saying what MedSync checks here; the link opens the full
 * signed notice (rendered by the server and passed as `notice`) in a centred dialog.
 */
export function LimitsLineView({
  text,
  linkLabel = PHWS2.limits.read,
  href,
  notice,
}: {
  text: string;
  linkLabel?: string;
  /** A page to open instead of the notice dialog (Clinical: "See signed packs" → Set-up). */
  href?: string;
  notice: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (href)
    return (
      <p className="text-caption text-ink-700 flex flex-wrap items-center gap-x-2 gap-y-1" role="note">
        <InfoIcon aria-hidden className="text-tide-ink-3 size-3.5 shrink-0" />
        <span>{text}</span>
        <Link href={href} className="text-primary font-medium underline-offset-2 hover:underline">
          {linkLabel}
        </Link>
      </p>
    );
  return (
    <p className="text-caption text-ink-700 flex flex-wrap items-center gap-x-2 gap-y-1" role="note">
      <InfoIcon aria-hidden className="text-tide-ink-3 size-3.5 shrink-0" />
      <span>{text}</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary font-medium underline-offset-2 hover:underline"
      >
        {linkLabel}
      </button>
      <EditorDialog open={open} onOpenChange={setOpen} width="medium">
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <DialogTitle className="text-heading-s">{PHWS2.limits.title}</DialogTitle>
          <button
            type="button"
            aria-label={PHWS2.shell.close}
            onClick={() => setOpen(false)}
            className="text-ink-600 hover:bg-muted grid size-8 place-items-center rounded-full"
          >
            <XIcon aria-hidden className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pt-3 pb-6">{notice}</div>
      </EditorDialog>
    </p>
  );
}

export interface MoreItem {
  label: string;
  href: string;
}

/** The More menu (NavMap rule 2): every action but the one shown. Links only; each opens the existing flow. */
export function MoreMenu({ items, what }: { items: readonly MoreItem[]; what: string }) {
  if (!items.length) return null;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={fill(K.moreLabel, { what })}
        className="text-ink-600 hover:bg-muted focus-visible:shadow-focus grid size-8 shrink-0 place-items-center rounded-full outline-none"
      >
        <MoreHorizontalIcon aria-hidden className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        {items.map((i) => (
          <Link
            key={i.href + i.label}
            href={i.href}
            className="text-body-s rounded-tide-row hover:bg-muted block px-3 py-2"
          >
            {i.label}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A work row (board 3, `.wr`): who, what and since, "Next:" with its subline, one action and More. `late` marks the
 * since text amber with its word, never colour alone.
 */
export function WorkRow({
  who,
  whoSub,
  what,
  since,
  late,
  next,
  nextSub,
  action,
  more = [],
}: {
  who: ReactNode;
  whoSub?: ReactNode;
  what: ReactNode;
  since?: ReactNode;
  late?: boolean;
  next: ReactNode;
  nextSub?: ReactNode;
  action?: ReactNode;
  more?: readonly MoreItem[];
}) {
  return (
    <li className="border-border grid grid-cols-1 items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(10rem,1.1fr)_minmax(10rem,1.3fr)_minmax(12rem,1.4fr)_auto]">
      <div className="min-w-0">
        <div className="text-body-s text-foreground truncate font-medium">{who}</div>
        {whoSub ? <div className="text-caption text-muted-foreground font-mono">{whoSub}</div> : null}
      </div>
      <div className="min-w-0">
        <div className="text-body-s text-foreground">{what}</div>
        {since ? (
          <div
            className={cn(
              "text-caption inline-flex items-center gap-1",
              late ? "font-medium text-amber-800" : "text-muted-foreground",
            )}
          >
            {late ? <TriangleAlertIcon aria-hidden className="size-3" /> : null}
            {since}
            {late ? <span className="sr-only">, {K.late}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="text-body-s text-foreground">
          <span className="text-tide-ink-3 mr-1">{K.next}</span>
          {next}
        </div>
        {nextSub ? <div className="text-caption text-muted-foreground">{nextSub}</div> : null}
      </div>
      <div className="flex items-center justify-end gap-1">
        {action}
        <MoreMenu items={more} what={typeof who === "string" ? who : K.more} />
      </div>
    </li>
  );
}

/** A group of work rows with its heading and explainer (board 3). */
export function WorkGroup({
  title,
  explainer,
  count,
  children,
}: {
  title: string;
  explainer?: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="bg-card shadow-tide-card rounded-tide-card overflow-hidden">
      <header className="border-border border-b px-4 py-3">
        <h2 className="text-heading-s text-foreground">
          {title}
          {count !== undefined ? <span className="text-tide-ink-3 ml-2 tabular-nums">{count}</span> : null}
        </h2>
        {explainer ? <p className="text-caption text-muted-foreground">{explainer}</p> : null}
      </header>
      <ul>{children}</ul>
    </section>
  );
}

export interface FlowStep {
  label: string;
  /** null = "No data" (the step's flag is off or nothing could be read). */
  n: number | null;
  href?: string;
  /** Amber notes with a glyph and words ("2 late"). */
  notes?: readonly string[];
  /** Neutral sublines. */
  sub?: readonly string[];
}

/** The flow strip (rx2.css `.flow`): suppliers → stores → points → wards → carts, each a count and its notes. */
export function FlowStrip({ steps, label }: { steps: readonly FlowStep[]; label: string }) {
  return (
    <ol aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-flow-col lg:grid-cols-none">
      {steps.map((s, i) => {
        const body = (
          <>
            <span className="text-caption text-tide-ink-3">{s.label}</span>
            <span className="text-[22px] leading-7 font-semibold tabular-nums">
              {s.n === null ? <span className="text-body-s text-muted-foreground font-normal">{K.noData}</span> : s.n}
            </span>
            {s.sub?.map((t) => (
              <span key={t} className="text-caption text-muted-foreground">
                {t}
              </span>
            ))}
            {s.notes?.map((t) => (
              <span key={t} className="text-caption inline-flex items-center gap-1 font-medium text-amber-800">
                <TriangleAlertIcon aria-hidden className="size-3" />
                {t}
              </span>
            ))}
          </>
        );
        return (
          <li key={s.label} className="relative flex items-stretch">
            {s.href ? (
              <Link
                href={s.href}
                className="bg-tide-sunken rounded-tide-row hover:bg-muted focus-visible:shadow-focus flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5 outline-none"
              >
                {body}
              </Link>
            ) : (
              <div className="bg-tide-sunken rounded-tide-row flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5">{body}</div>
            )}
            {i < steps.length - 1 ? (
              <ChevronRightIcon aria-hidden className="text-tide-ink-3 mx-0.5 hidden size-4 self-center lg:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
