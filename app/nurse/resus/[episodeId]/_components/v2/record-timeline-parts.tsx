"use client";

import type { SubmitSpec } from "./use-desk";
import type { TimelineEvent } from "@/lib/resus/types";
import type { FormEvent } from "react";
import { useState } from "react";

import { correctEventV2 } from "@/app/nurse/resus/_v2/actions-survey";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeskCtx } from "./desk-context";
import { entryLabel } from "./record-format";
import { toOutcome } from "./use-desk";

/** Resus Desk v2 — the record's filters, the correction write and its dialog. */

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "drugs", label: "Drugs" },
  { id: "actions", label: "Actions" },
  { id: "vitals", label: "Vitals" },
  { id: "arrest", label: "Arrest" },
  { id: "team", label: "Team" },
] as const;
export type Filter = (typeof FILTERS)[number]["id"];

const KINDS: Record<"drugs" | "actions" | "arrest" | "team", ReadonlySet<string>> = {
  drugs: new Set(["drug", "fluid"]),
  actions: new Set(["action", "procedure", "decision", "reassessment"]),
  arrest: new Set([
    "arrest_detected",
    "cpr_started",
    "rhythm_check",
    "shock",
    "rosc",
    "resuscitation_stopped",
    "death_confirmed",
  ]),
  team: new Set(["role_change", "mobilisation", "handover"]),
};

export function matches(e: TimelineEvent, f: Filter): boolean {
  if (f === "all") return true;
  // A correction files with the entry it corrects.
  const kind = (e.payload.correction as { kind?: string } | undefined)?.kind ?? e.kind;
  if (f === "vitals") return kind === "vital" || e.payload.noteKind === "vital_annotation";
  if (f === "arrest") return KINDS.arrest.has(kind) || e.step === "arrest";
  return KINDS[f].has(kind);
}

/** The superseding row the server writes (correctEventV2); "undone" = Undo. */
export function correctionSpec(
  target: TimelineEvent,
  reason: string,
  episodeId: string,
): SubmitSpec {
  const label = entryLabel(target);
  const undone = reason === "undone";
  return {
    label: undone ? `Undo: ${label}` : `Correct: ${label}`,
    optimistic: () => [
      {
        kind: "note",
        step: target.step,
        supersedesEventId: target.id,
        payload: {
          noteKind: "correction",
          correction: { reason, of: target.id, kind: target.kind },
          label: undone ? `Undone: ${label}` : `Corrected: ${label} — ${reason}`,
        },
      },
    ],
    run: async ({ clientEventId, recordedAt }) =>
      toOutcome(
        await correctEventV2({
          episodeId,
          clientEventId,
          recordedAt,
          supersedesEventId: target.id,
          reason,
        }),
      ),
  };
}

export const PAGE = 300;

export interface Row {
  e: TimelineEvent;
  /** History view: the row that undid / corrected this one. */
  by: TimelineEvent | null;
}

export function CorrectDialog({
  target,
  onClose,
}: {
  target: TimelineEvent | null;
  onClose: () => void;
}) {
  const { store, ui } = useDeskCtx();
  const [reason, setReason] = useState("");
  const why = reason.trim();
  const close = () => {
    setReason("");
    onClose();
  };
  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!target || why.length < 2) return;
    store.submit(correctionSpec(target, why, store.episode.id));
    ui.toast({ message: "Corrected" });
    close();
  }
  return (
    <Dialog open={target !== null} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-heading-s">Correct this entry</DialogTitle>
            <DialogDescription className="text-body-s">
              {target ? `“${entryLabel(target)}” ` : ""}leaves the active record and stays in
              history with your reason. Record the right value separately.
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted-foreground">Reason (required)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              className="border-border bg-background text-body-l focus:shadow-focus sm:text-body-s rounded-md border px-2.5 py-2 outline-none focus:border-teal-500"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" className="min-h-11" disabled={why.length < 2}>
              Record correction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
