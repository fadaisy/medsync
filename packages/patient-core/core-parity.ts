/**
 * S8: one fixture through both apps (patient app v2 §6). The phone's Jest and the web's Vitest each run
 * `runCoreFixture` over `fixtures/core-parity.json` and must get the stored `expected` exactly. The fixture's
 * expected half is regenerated only by `npx tsx scripts/patient-app/gen-core-parity.ts`, after a reviewed change.
 */
import type { TodayState } from "./today-hero";

import { paymentChip, refundEligibility, ticketPayLine } from "./payments";
import { inTargetCount, plausible, weekChange } from "./reading-cards";
import { heroFor } from "./today-hero";
import { stageOf } from "./visit-stages";

// The fixture is JSON; each case names the function it exercises.
type Case = { fn: string; args: unknown[] };

export function runCase(c: Case): unknown {
  const [a0, a1, a2, a3, a4] = c.args as [never, never, never, never, never];
  switch (c.fn) {
    case "heroFor":
      return heroFor(a0 as TodayState).rung;
    case "weekChange":
      return weekChange(a0, a1, a2, a3, a4 ?? null);
    case "inTargetCount":
      return inTargetCount(a0, a1, a2);
    case "plausible":
      return plausible(a0);
    case "stageOf":
      return stageOf(a0, a1);
    case "paymentChip":
      return paymentChip(a0, a1);
    case "ticketPayLine":
      return ticketPayLine(a0, a1);
    case "refundEligibility": {
      const i = a0 as {
        paidUgx: number;
        refundedUgx: number;
        visitStartsAt: string;
        now: string;
        cutoffHours: number;
        cancelledBy: "patient" | "hospital";
      };
      return refundEligibility({
        ...i,
        visitStartsAt: new Date(i.visitStartsAt),
        now: new Date(i.now),
      });
    }
    default:
      throw new Error(`unknown fn ${c.fn}`);
  }
}

export function runCoreFixture(cases: Case[]): unknown[] {
  return cases.map(runCase);
}
