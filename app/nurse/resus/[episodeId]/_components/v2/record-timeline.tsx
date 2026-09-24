"use client";

import type { Filter, Row } from "./record-timeline-parts";
import type { PendingEntry } from "./types";
import type { TimelineEvent } from "@/lib/resus/types";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HistoryIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { artefactFields } from "@/lib/resus/survey/vitals-bands";
import { cn } from "@/lib/utils";
import { undoStep } from "./arrest-console-model";
import { useDeskCtx } from "./desk-context";
import { RecordEntry, UNDO_MS } from "./record-entry";
import { clockOf, dayOf, undoableInRecord } from "./record-format";
import { CorrectDialog, correctionSpec, FILTERS, matches, PAGE } from "./record-timeline-parts";

/**
 * Resus Desk v2 — the append-only record, newest first (prompt §5.8). Undo for
 * 10 s after your own one-tap entry (undoableInRecord — never ROSC, arrest,
 * stopping, death or a terminal decision), "Correct…" (reason required)
 * otherwise; both write a superseding row, so the original stays in "Show
 * history". Renders the
 * newest 300 entries ("Show older" for the rest) — nothing is virtualised.
 */

/**
 * The record. "rail" (≥ 1280 px) carries its own heading; "sheet" is the same
 * record inside the desk's Sheet (the desk owns the Sheet and its title). The
 * host element scrolls; the filters stay stuck to its top.
 */
export function RecordTimeline({ variant = "rail" }: { variant?: "rail" | "sheet" }) {
  const { initial, store, ui } = useDeskCtx();
  const [filter, setFilter] = useState<Filter>("all");
  const [history, setHistory] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [correcting, setCorrecting] = useState<TimelineEvent | null>(null);
  const { submit, discard, retry, episode, events, activeEvents, pending, readOnly } = store;
  const meId = initial.me.userId;

  // Everyone who recorded an entry (R6: the loader's staff names), then the
  // current team for rows written since the last snapshot.
  const { recorders } = store;
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of store.responders) if (r.fullName) m.set(r.userId, r.fullName);
    for (const r of store.roster) if (r.fullName) m.set(r.userId, r.fullName);
    for (const r of recorders) if (r.fullName) m.set(r.userId, r.fullName);
    m.set(initial.me.userId, initial.me.fullName ?? "You");
    return m;
  }, [initial, store.responders, store.roster, recorders]);
  // A queued Undo runs later: it reads the store's latest rows, not this render's.
  const live = useRef({ events, pending });
  useLayoutEffect(() => {
    live.current = { events, pending };
  }, [events, pending]);

  const rows = useMemo(() => {
    const all = [...events, ...pending.flatMap((p) => p.optimistic)];
    const by = new Map<string, TimelineEvent>();
    for (const e of all) if (e.supersedesEventId) by.set(e.supersedesEventId, e);
    // Refused entries are left out of activeEvents: show them here as "Not saved" (Retry/Discard).
    const failedRows = pending.filter((p) => p.status === "failed").flatMap((p) => p.optimistic);
    const list: Row[] = [...activeEvents, ...failedRows].map((e) => ({ e, by: null }));
    if (history) for (const e of all) if (by.has(e.id)) list.push({ e, by: by.get(e.id)! });
    return list.sort((a, b) =>
      a.e.recordedAt !== b.e.recordedAt
        ? a.e.recordedAt < b.e.recordedAt
          ? 1
          : -1
        : a.e.createdAt < b.e.createdAt
          ? 1
          : a.e.createdAt > b.e.createdAt
            ? -1
            : 0,
    );
  }, [events, pending, activeEvents, history]);

  const artefact = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of artefactFields(activeEvents)) {
      const i = k.lastIndexOf(":");
      m.set(k.slice(0, i), [...(m.get(k.slice(0, i)) ?? []), k.slice(i + 1)]);
    }
    return m;
  }, [activeEvents]);

  const syncOf = useMemo(
    () => new Map<string, PendingEntry>(pending.map((p) => [p.clientEventId, p])),
    [pending],
  );

  const onUndo = useCallback(
    (e: TimelineEvent) => {
      const cid = e.clientEventId;
      if (!e.id.startsWith("pending:")) submit(correctionSpec(e, "undone", episode.id));
      else if (!cid) return;
      else if (!discard(cid)) {
        // R4: in flight or accepted — correct the row it becomes, once it lands.
        const i = Number(e.id.split(":").at(-1));
        submit({
          ...correctionSpec(e, "undone", episode.id),
          run: async (c) => {
            const target = live.current.events.filter((x) => x.clientEventId === cid)[i] ?? null;
            const q = live.current.pending.find((p) => p.clientEventId === cid);
            const step = undoStep(target !== null, false, q?.status);
            if (step === "correct") return correctionSpec(target!, "undone", episode.id).run(c);
            if (step === "wait")
              return {
                ok: false,
                error: "The entry is still being sent — will retry.",
                retry: true,
              };
            // Never recorded: nothing to correct — drop the refused entry too.
            if (q) discard(cid);
            return { ok: true };
          },
        });
      }
      ui.toast({ message: "Undone" });
    },
    [discard, submit, episode.id, ui],
  );

  const shown = rows.filter((r) => matches(r.e, filter));
  const visible = shown.slice(0, limit);
  const groups: { key: string; label: string; rows: Row[] }[] = [];
  for (const r of visible) {
    const d = dayOf(r.e.recordedAt);
    if (groups.at(-1)?.key !== d.key) groups.push({ ...d, rows: [] });
    groups.at(-1)!.rows.push(r);
  }

  return (
    <section aria-label="Record" className="flex flex-col gap-2">
      {/* Sticky inside whichever element scrolls the record (rail or sheet). */}
      <div className="bg-background sticky top-0 z-10 flex flex-col gap-2 pb-1">
        <div
          className={cn(
            "flex items-center gap-2",
            variant === "rail" ? "justify-between" : "justify-end",
          )}
        >
          {variant === "rail" ? (
            <h2 className="text-overline text-muted-foreground uppercase">Record</h2>
          ) : null}
          <button
            type="button"
            aria-pressed={history}
            onClick={() => setHistory((h) => !h)}
            className="tap text-body-s text-muted-foreground hover:bg-muted inline-flex min-h-11 items-center gap-1.5 rounded-md px-2"
          >
            <HistoryIcon className="size-4" aria-hidden />
            {history ? "Hide history" : "Show history"}
          </button>
        </div>
        <div role="group" aria-label="Filter the record" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "tap text-body-s min-h-11 min-w-11 shrink-0 rounded-md border px-2",
                // The teal ramp flips in .dark, so no dark: overrides.
                filter === f.id
                  ? "border-teal-600 bg-teal-50 font-medium text-teal-800"
                  : "text-muted-foreground hover:bg-muted border-transparent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        {groups.length === 0 ? (
          <p className="text-body-s text-muted-foreground px-2 py-6 text-center">
            {filter === "all"
              ? "No entries yet. Findings, actions and vitals appear here as they are recorded."
              : "No entries of this kind yet."}
          </p>
        ) : null}
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3 className="text-caption text-muted-foreground before:bg-border after:bg-border flex items-center gap-2 py-1 before:h-px before:flex-1 after:h-px after:flex-1">
              {g.label}
            </h3>
            <ol className="flex flex-col gap-px">
              {g.rows.map(({ e, by }) => {
                const mine = e.recordedByUserId === meId;
                const correction = e.payload.noteKind === "correction";
                const who = (e.recordedByUserId && names.get(e.recordedByUserId)) || "—";
                const note = by
                  ? `${(by.payload.correction as { reason?: string } | undefined)?.reason === "undone" ? "Undone" : "Corrected"} ${clockOf(by.createdAt, false)} by ${(by.recordedByUserId && names.get(by.recordedByUserId)) || "—"}`
                  : null;
                return (
                  <RecordEntry
                    key={by ? `h:${e.id}` : e.id}
                    event={e}
                    startedAtIso={episode.startedAtIso}
                    who={who}
                    sync={e.clientEventId ? (syncOf.get(e.clientEventId) ?? null) : null}
                    online={store.online}
                    artefactKeys={(artefact.get(e.id) ?? []).join(",")}
                    supersededNote={note}
                    undoUntilMs={mine && !by ? Date.parse(e.createdAt) + UNDO_MS : null}
                    nowMs={store.nowMs}
                    onUndo={!readOnly && mine && !by && undoableInRecord(e) ? onUndo : undefined}
                    onCorrect={
                      !readOnly && !by && !correction && !e.id.startsWith("pending:")
                        ? setCorrecting
                        : undefined
                    }
                    onRetry={retry}
                    onDiscard={discard}
                  />
                );
              })}
            </ol>
          </section>
        ))}
        {shown.length > limit ? (
          <div className="flex justify-center py-2">
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Show older ({shown.length - limit})
            </Button>
          </div>
        ) : null}
      </div>
      <CorrectDialog target={correcting} onClose={() => setCorrecting(null)} />
    </section>
  );
}
