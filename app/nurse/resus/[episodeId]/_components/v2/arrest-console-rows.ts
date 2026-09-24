import type { LogFn } from "./arrest-console-writes";
import type { CauseKey, CauseState, Rhythm, RoscSign } from "@/lib/resus/model";

import {
  recordRhythmCheckV2,
  recordRoscV2,
  setReversibleCauseV2,
} from "@/app/nurse/resus/_v2/actions-arrest";
import { RHYTHM_LABEL } from "./arrest-console-model";

/** Arrest console writes, one tap each — the rows mirror actions-arrest.ts. */

export function logRhythm(log: LogFn, seq: number, r: Rhythm, pulse?: boolean): void {
  const suffix =
    r !== "organised"
      ? ""
      : pulse
        ? " — pulse present"
        : pulse === false
          ? " — no pulse (PEA)"
          : "";
  const label = `Rhythm check: ${RHYTHM_LABEL[r]}${suffix}`;
  log({
    key: `rhythm:${r}`,
    label,
    row: {
      kind: "rhythm_check",
      step: "arrest",
      arrestSeq: seq,
      payload: { arrestSeq: seq, rhythm: r, pulse: pulse ?? null, label },
    },
    run: (b) => recordRhythmCheckV2({ ...b, arrestSeq: seq, rhythm: r, pulse: pulse ?? null }),
  });
}

export function logCause(log: LogFn, seq: number, c: CauseKey, s: CauseState): void {
  const label = `Reversible cause ${c.replace(/_/g, " ")}: ${s.replace(/_/g, " ")}`;
  log({
    key: `cause:${c}:${s}`,
    label,
    row: {
      kind: "decision",
      step: "arrest",
      arrestSeq: seq,
      payload: { decision: "reversible_cause", arrestSeq: seq, cause: c, state: s, label },
    },
    run: (b) => setReversibleCauseV2({ ...b, arrestSeq: seq, cause: c, state: s }),
  });
}

export function logRosc(log: LogFn, seq: number, signs: RoscSign[]): void {
  const label = `ROSC — ${signs.map((s) => s.replace(/_/g, " ")).join(", ")}`;
  log({
    key: "rosc",
    label,
    row: {
      kind: "rosc",
      step: "arrest",
      arrestSeq: seq,
      payload: { arrestSeq: seq, signs, label },
    },
    run: (b) => recordRoscV2({ ...b, arrestSeq: seq, signs }),
    // ROSC moves the episode to post-ROSC on the server; a mistaken ROSC is a re-arrest, not an undo.
    toast: { undo: false },
  });
}
