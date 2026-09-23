import type { BundleItemState } from "@/lib/resus/model";
import type { RefEntry } from "@/lib/resus/reference/ref";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";

import { BUNDLE_ITEM_STATES } from "@/lib/resus/model";
import {
  POST_ROSC_BUNDLE,
  POST_ROSC_PIN_STEP,
  POST_ROSC_REF,
} from "@/lib/resus/reference/post-rosc-catalog";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * Post-ROSC mode (docs/clinical/resus-post-rosc-clinical-catalog.md) — PURE.
 *
 * Bundle item states come from `decision` events
 * `{decision:"post_rosc_item", itemId, state}` (latest wins; nothing recorded =
 * "open"). "Not available here" is its own state (feeds capability data).
 */

export type BundleItemView = BundleItemState | "open";

function isItemState(v: unknown): v is BundleItemState {
  return typeof v === "string" && (BUNDLE_ITEM_STATES as readonly string[]).includes(v);
}

/** Every checklist item (PR-NEVER-01 excluded) → its latest recorded state, or "open". */
export function bundleState(events: readonly TimelineEvent[]): Record<string, BundleItemView> {
  const out: Record<string, BundleItemView> = {};
  for (const item of POST_ROSC_BUNDLE) if (item.checklist) out[item.id] = "open";
  for (const e of reconstructTimeline(events)) {
    if (e.kind !== "decision" || e.payload.decision !== "post_rosc_item") continue;
    const { itemId, state } = e.payload;
    if (typeof itemId === "string" && itemId in out && isItemState(state)) out[itemId] = state;
  }
  return out;
}

/** The post-ROSC survey pins for a step (PR-PIN-B/C/D/E; A has none). */
export function postRoscPins(step: AbcdeLetter): RefEntry[] {
  return Object.entries(POST_ROSC_PIN_STEP)
    .filter(([, s]) => s === step)
    .map(([id]) => POST_ROSC_REF[id]!);
}

/** PR-D-01: the latest "obeys commands?" answer, or null when never recorded. */
export function obeysCommands(events: readonly TimelineEvent[]): boolean | null {
  let value: boolean | null = null;
  for (const e of reconstructTimeline(events)) {
    if (e.kind !== "decision" || e.payload.decision !== "obeys_commands") continue;
    if (typeof e.payload.value === "boolean") value = e.payload.value;
  }
  return value;
}
