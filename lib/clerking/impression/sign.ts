import type { ImpressionDraft } from "./board";
import type { DxSignoff } from "./catalogue";
import type { DxIndex, VisitDiagnosis } from "./recorded";

import { buildBoard, EMPTY_IMPRESSION, signBlocks } from "./board";
import { dxLive } from "./catalogue";
import { CLINICAL_VIEWER } from "./facts";
import { toRecorded } from "./recorded";

/**
 * D-SI-06 at signing, on the server: what holds a v2 note's signature, from the visit's diagnoses
 * as they stand and the note's own reasoning (likelihood and reasons, keyed by logical id). The
 * desk says the same in the sign bar; this makes it true whatever the client sent. The author
 * holds every class (D-SI-18). Pure.
 */
export function impressionSignBlocks(
  rows: readonly VisitDiagnosis[],
  impression: unknown,
  dx: DxIndex,
  signoff: DxSignoff,
): string[] {
  const draft: ImpressionDraft = {
    ...EMPTY_IMPRESSION,
    ...(impression && typeof impression === "object"
      ? (impression as Partial<ImpressionDraft>)
      : {}),
  };
  const board = buildBoard({
    diagnoses: toRecorded(rows, dx),
    draft,
    dx: dx.cat,
    live: dxLive(signoff),
    viewer: CLINICAL_VIEWER,
    deferred: null,
  });
  return signBlocks(board);
}
