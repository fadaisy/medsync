"use client";

import type { AvailabilityRow } from "../page";
import type { PillTone } from "@/components/ui/data-table";
import type { AvailabilityKind } from "@/db/schema/scheduling";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { CalendarPlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { AvailabilityFormSheet } from "./availability-form-sheet";

const KIND_TONES: Record<AvailabilityKind, PillTone> = {
  bookable: "stable",
  teaching: "admitted",
  ward_round: "pending",
  admin: "neutral",
  leave: "caution",
  unavailable: "critical",
};

const KIND_LABEL: Record<AvailabilityKind, string> = {
  bookable: "Bookable",
  teaching: "Teaching",
  ward_round: "Ward round",
  admin: "Admin",
  leave: "Leave",
  unavailable: "Unavailable",
};

const WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AvailabilityList({
  blocks,
  selectedBlockId,
  isCreatingNew,
}: {
  blocks: ReadonlyArray<AvailabilityRow>;
  selectedBlockId: string | null;
  isCreatingNew: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );
  const sheetOpen = !!selected || isCreatingNew;

  function openCreate(): void {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("block");
    p.set("new", "1");
    router.push(`/clinician/availability?${p.toString()}`, { scroll: false });
  }

  function openEdit(id: string): void {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("new");
    p.set("block", id);
    router.push(`/clinician/availability?${p.toString()}`, { scroll: false });
  }

  function closeSheet(): void {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("block");
    p.delete("new");
    const qs = p.toString();
    router.push(qs ? `/clinician/availability?${qs}` : `/clinician/availability`, {
      scroll: false,
    });
  }

  return (
    <>
      <section className="border-border bg-card overflow-hidden rounded-lg border">
        <header className="border-border flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          <h2 className="text-foreground text-[13.5px] font-medium">Upcoming blocks</h2>
          <span className="text-muted-foreground text-caption ml-auto font-mono tabular-nums">
            {blocks.length} {blocks.length === 1 ? "block" : "blocks"}
          </span>
          <Button type="button" variant="primary" size="sm" className="tap" onClick={openCreate}>
            <CalendarPlusIcon className="size-3.5" />
            Add block
          </Button>
        </header>

        {blocks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            {/* Quiet week-grid glyph — empty calendar, one slot hinted teal. */}
            <svg viewBox="0 0 112 72" aria-hidden className="text-border mb-1 h-16 w-auto">
              <rect
                x="1.5"
                y="1.5"
                width="109"
                height="69"
                rx="8"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                opacity="0.6"
              />
              <line
                x1="1"
                y1="20"
                x2="111"
                y2="20"
                stroke="currentColor"
                strokeWidth="3"
                opacity="0.4"
              />
              <rect
                x="12"
                y="30"
                width="20"
                height="12"
                rx="3"
                fill="currentColor"
                opacity="0.25"
              />
              <rect
                x="40"
                y="30"
                width="20"
                height="12"
                rx="3"
                fill="currentColor"
                opacity="0.15"
              />
              <rect
                x="68"
                y="48"
                width="20"
                height="12"
                rx="3"
                className="text-brand-500/40"
                fill="currentColor"
              />
            </svg>
            <p className="text-foreground text-[14px] font-medium">Nothing on your schedule yet</p>
            <p className="text-muted-foreground max-w-md text-[12.5px] leading-relaxed">
              Add bookable hours so patients can book you. Mark teaching, ward rounds and admin as
              non-bookable so they don&apos;t get double-booked.
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={openCreate}
              className="tap mt-2"
            >
              <CalendarPlusIcon className="size-3.5" />
              Add your first block
            </Button>
          </div>
        ) : (
          <ul className="divide-border/70 stagger-children flex flex-col divide-y">
            {blocks.map((b) => (
              <BlockRow key={b.id} block={b} onOpen={() => openEdit(b.id)} />
            ))}
          </ul>
        )}
      </section>

      <AvailabilityFormSheet
        open={sheetOpen}
        block={selected}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      />

      {/* Keep a hidden link target so the open-create URL works on
          fresh navigation (e.g. shared link). Server renders the open
          state via ?new=1 already. */}
      <Link href="/clinician/availability?new=1" prefetch className="hidden" aria-hidden>
        new
      </Link>
    </>
  );
}

function BlockRow({ block, onOpen }: { block: AvailabilityRow; onOpen: () => void }) {
  const starts = new Date(block.startsAtIso);
  const ends = new Date(block.endsAtIso);
  const sameDay = starts.toDateString() === ends.toDateString();

  const dateLabel = starts.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = sameDay
    ? `${formatTime(starts)} – ${formatTime(ends)}`
    : `${formatTime(starts)} → ${ends.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group tap hover:bg-brand-50/40 dark:hover:bg-brand-950/15 flex w-full items-center gap-4 px-4 py-3 text-left transition-colors outline-none sm:px-6",
          "focus-visible:ring-brand-500/40 focus-visible:ring-2 focus-visible:ring-inset",
        )}
      >
        <div className="flex w-32 shrink-0 flex-col">
          <span className="text-foreground text-body-s font-medium tabular-nums">{dateLabel}</span>
          <span className="text-muted-foreground text-caption font-mono tabular-nums">
            {timeLabel}
          </span>
        </div>

        <Pill tone={KIND_TONES[block.kind]}>{KIND_LABEL[block.kind]}</Pill>

        {block.recurrence === "weekly" && block.recurrenceWeekday ? (
          <span className="text-muted-foreground text-[11.5px]">
            Every {WEEKDAY_LABEL[block.recurrenceWeekday - 1]}
          </span>
        ) : null}

        {block.location ? (
          <span className="text-muted-foreground hidden truncate text-[12px] sm:inline">
            {block.location}
          </span>
        ) : null}

        <span className="text-muted-foreground group-hover:text-foreground ml-auto inline-flex items-center gap-1 text-[11.5px] transition-colors">
          Edit
          <span
            aria-hidden
            className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
          >
            →
          </span>
        </span>
      </button>
    </li>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
