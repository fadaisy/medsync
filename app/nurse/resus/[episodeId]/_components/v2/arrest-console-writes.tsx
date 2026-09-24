"use client";

import type { PrescribeRequest } from "./desk-context";
import type { WriteOutcome } from "./types";
import type { OptimisticRow } from "./use-desk";
import { useLayoutEffect, useRef } from "react";

import { correctEventV2 } from "@/app/nurse/resus/_v2/actions-survey";
import { fmtMs, undoStep } from "./arrest-console-model";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

/**
 * Arrest console — the one-tap write path (UI-BUILD-SPEC §3). Every console entry goes
 * through `log`: a double-tap guard, an optimistic row that renders at once, the queued
 * server action, and a 10 s toast "Logged A+06:12 · … · Undo (· Edit for fast-path drugs)".
 * A fast-path drug (D4) says "Logged" only once the server's safety check has passed; a
 * block keeps the entry as "Not saved — needs the prescribe dialog" (never silently gone),
 * says why, and opens the dialog pre-filled. Recording it there discards the entry.
 *
 * Undo = discard while the entry is still queued; once sent, a superseding correction
 * (`correctEventV2`, reason "undone"). A correction queued behind an entry still in flight
 * waits for it; if that entry is never recorded (failed, blocked, discarded) the correction
 * is dropped with it, so it can never hold the queue.
 */

export interface WriteArgs {
  episodeId: string;
  clientEventId: string;
  recordedAt: string;
}

export interface LogSpec {
  /** Double-tap guard: the same key again within 1.2 s is ignored. */
  key: string;
  label: string;
  /** The optimistic row — must match what the server writes (null: none). */
  row: OptimisticRow | null;
  run: (b: WriteArgs) => Promise<unknown>;
  /** false = no toast; `undo: false` for entries that move the page (ROSC). */
  toast?: false | { extra?: string; tone?: "info" | "warn"; undo?: boolean };
  /** Fast-path drug (D4): a safety block opens the prescribe dialog; the toast offers Edit. */
  drug?: { recCode: string; recLabel: string };
}

export type LogFn = (spec: LogSpec) => string | null;
export type UndoFn = (clientEventId: string, reason?: string) => void;

/** The error a blocked fast-path entry keeps (the strip offers "Open dialog" for it). */
export const NEEDS_DIALOG = "Needs the prescribe dialog";

const DOUBLE_TAP_MS = 1200;

type DialogRequest = PrescribeRequest & { reasons: string[]; doseMg: number | null };

export function useConsoleLog(arrestAtMs: number | null): {
  log: LogFn;
  undo: UndoFn;
  /** Re-open the prescribe dialog for a blocked fast-path entry. */
  reopen: (clientEventId: string) => void;
} {
  const { store, ui } = useDeskCtx();
  const episodeId = store.episode.id;
  // Toast callbacks fire up to 10 s later: read the store's latest rows, not a stale render.
  const live = useRef({ events: store.events, pending: store.pending });
  useLayoutEffect(() => {
    live.current = { events: store.events, pending: store.pending };
  }, [store.events, store.pending]);
  const lastTap = useRef(new Map<string, number>());
  /** Entries the server accepted (they may not have reached `events` yet). */
  const accepted = useRef(new Set<string>());
  const blocked = useRef(new Map<string, DialogRequest>());

  const reopen = (cid: string) => {
    const req = blocked.current.get(cid);
    if (req) ui.openPrescribe(req);
  };

  const undo: UndoFn = (cid, reason = "undone") => {
    const queued = live.current.pending.find((p) => p.clientEventId === cid);
    // discard is false once the entry is on its way or accepted: correct it instead (R4).
    if (queued && queued.status !== "sending" && store.discard(cid)) return;
    const landed = () => live.current.events.find((e) => e.clientEventId === cid) ?? null;
    const shown = landed() ?? queued?.optimistic[0] ?? null;
    if (!shown) return;
    const was = String(shown.payload.label ?? shown.kind);
    const label = reason === "undone" ? `Undone: ${was}` : `Corrected: ${was} — ${reason}`;
    store.submit({
      label,
      optimistic: () => [
        {
          kind: "note",
          step: shown.step,
          supersedesEventId: shown.id,
          payload: {
            noteKind: "correction",
            correction: { reason, of: shown.id, kind: shown.kind },
            label,
          },
        },
      ],
      run: async ({ clientEventId, recordedAt }): Promise<WriteOutcome> => {
        const target = landed();
        const q = live.current.pending.find((p) => p.clientEventId === cid);
        const step = undoStep(target !== null, accepted.current.has(cid), q?.status);
        if (step === "correct" && target)
          return toOutcome(
            await correctEventV2({
              episodeId,
              clientEventId,
              recordedAt,
              supersedesEventId: target.id,
              reason,
            }),
          );
        if (step === "wait")
          return { ok: false, error: "The entry is still being sent — will retry.", retry: true };
        // Never recorded: nothing to correct. Drop the entry too — that was the intent.
        if (q) store.discard(cid);
        return { ok: true };
      },
    });
  };

  const log: LogFn = (spec) => {
    const t = Date.now();
    if (t - (lastTap.current.get(spec.key) ?? 0) < DOUBLE_TAP_MS) return null;
    lastTap.current.set(spec.key, t);
    const { drug, row } = spec;
    const at = arrestAtMs === null ? "" : ` A+${fmtMs(store.nowMs() - arrestAtMs, "mm")}`;
    const logged = (cid: string) => {
      if (spec.toast === false) return;
      const extra = spec.toast?.extra ? ` — ${spec.toast.extra}` : "";
      ui.toast({
        message: `Logged${at} · ${spec.label}${extra}`,
        tone: spec.toast?.tone ?? "info",
        undo: spec.toast?.undo === false ? undefined : () => undo(cid),
        // The one-tap entry is corrected only once the dialog records its replacement.
        edit: drug
          ? () =>
              ui.openPrescribe({
                ...drug,
                onRecorded: () => undo(cid, "replaced via the prescribe dialog"),
              })
          : undefined,
      });
    };
    const cid = store.submit({
      label: spec.label,
      optimistic: row ? () => [row] : undefined,
      run: async (c) => {
        const o = toOutcome(await spec.run({ episodeId, ...c }));
        if (o.ok) {
          accepted.current.add(c.clientEventId);
          if (drug) logged(c.clientEventId);
          return o;
        }
        if (!drug || !o.openDialog) return o;
        const d = o.openDialog;
        const why = d.reasons.join(" · ") || "safety check";
        const req: DialogRequest = {
          recCode: d.recCode,
          recLabel: drug.recLabel,
          reasons: d.reasons,
          doseMg: d.doseMg,
          onRecorded: () => {
            blocked.current.delete(c.clientEventId);
            store.discard(c.clientEventId);
          },
        };
        blocked.current.set(c.clientEventId, req);
        ui.toast({
          message: `Not logged: ${spec.label} — ${why}. Confirm in the prescribe dialog.`,
          tone: "warn",
        });
        ui.openPrescribe(req);
        return { ok: false, error: `${NEEDS_DIALOG}: ${why}`, retry: false };
      },
      onWarnings: (w) => ui.toast({ message: `${spec.label}: ${w.join(" · ")}`, tone: "warn" }),
    });
    if (!drug) logged(cid);
    return cid;
  };

  return { log, undo, reopen };
}
