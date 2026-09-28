/**
 * Signing waits for "plan done" (ADR 0184 §5), on the server as on screen. The server cannot see
 * the screen's checklist, so it holds what the draft itself proves: the plan was marked done and
 * nothing is left in the basket. Pure.
 */
import type { PlanDraft } from "./draft";

import { basketOf } from "./draft";

export function planSignBlocks(plan: unknown): string[] {
  const d = (plan ?? undefined) as PlanDraft | undefined;
  const blocks: string[] = [];
  if (!d?.done) blocks.push("mark the plan done");
  if (d) {
    const b = basketOf(d);
    if (b.orders.length + b.prescriptions.length)
      blocks.push("place or remove what is in the basket");
  }
  return blocks;
}
