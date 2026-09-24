import { declareArrestV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import { correctEventV2 } from "@/app/nurse/resus/_v2/actions-survey";
import { detectArrest } from "@/lib/resus/arrest";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

const NO_SIGNS = { responsive: false, breathingNormally: false, centralPulse: false };

/**
 * ALS-ROSC-07: re-arrest is one tap — the declaration the header confirm sends
 * (all three signs "no"; the clinician asserts it). The server derives the arrest
 * number (same arrest or a new one, ALS-ROSC-04/05). Undo: still queued →
 * discarded; sent → both rows it wrote (arrest_detected, cpr_started) are
 * superseded with "undone", queued behind it like every other undo.
 */
export function useReArrest(): () => void {
  const { store, ui } = useDeskCtx();
  return () => {
    const episodeId = store.episode.id;
    const arrestSeq = store.episode.currentArrestSeq || 1;
    const reason = detectArrest(NO_SIGNS).reason;
    // The toast outlives this panel (the console replaces it): the write keeps its own state.
    const w: { sending: boolean; ids: string[] | null } = { sending: false, ids: null };
    const cid = store.submit({
      label: "Re-arrest",
      optimistic: () => [
        {
          kind: "arrest_detected",
          step: "arrest",
          arrestSeq,
          payload: {
            arrestSeq,
            reason,
            signs: NO_SIGNS,
            source: "desk",
            witnessed: null,
            monitored: null,
            label: `Re-arrest — ${reason}`,
          },
        },
        {
          kind: "cpr_started",
          step: "arrest",
          arrestSeq,
          payload: { arrestSeq, label: "CPR started" },
        },
      ],
      run: async ({ clientEventId, recordedAt }) => {
        w.sending = true;
        try {
          const r = await declareArrestV2({
            episodeId,
            clientEventId,
            recordedAt,
            signs: NO_SIGNS,
            source: "desk",
          });
          if (r.ok) w.ids = r.eventIds;
          return toOutcome(r);
        } finally {
          w.sending = false;
        }
      },
    });
    const undo = () => {
      if (!w.sending && !w.ids) return store.discard(cid);
      // CPR started first, then the declaration (rows 1 and 0 of the write).
      for (const [i, kind] of [
        [1, "cpr_started"],
        [0, "arrest_detected"],
      ] as const) {
        const label = `Undone: ${kind === "arrest_detected" ? "Re-arrest" : "CPR started"}`;
        const target = w.ids?.[i] ?? `pending:${cid}:${i}`;
        store.submit({
          label,
          optimistic: () => [
            {
              kind: "note",
              step: "arrest",
              supersedesEventId: target,
              payload: {
                noteKind: "correction",
                correction: { reason: "undone", of: target, kind },
                label,
              },
            },
          ],
          // The queue runs this after the re-arrest has landed or failed.
          run: async ({ clientEventId, recordedAt }) => {
            const id = w.ids?.[i];
            if (!id) return { ok: true };
            return toOutcome(
              await correctEventV2({
                episodeId,
                clientEventId,
                recordedAt,
                supersedesEventId: id,
                reason: "undone",
              }),
            );
          },
        });
      }
    };
    ui.toast({ message: "Re-arrest recorded — CPR started", undo });
  };
}
