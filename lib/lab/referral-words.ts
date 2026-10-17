import type { ReferralState } from "@/lib/exchange/types";

import { fill, LAB4 } from "@/content/lab-phase-4";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";

/**
 * "Now" in words (Lab Phase 4 §5.3 table, §10): every state is a word with an icon where it warns; amber only for
 * overdue, rejected and lost (dark amber), dashed for packed and cancelled, neutral otherwise. Never red, never
 * green (Law 13).
 */
export type NowTone = "neutral" | "caution" | "dashed" | "check";
export interface NowWords {
  words: string;
  tone: NowTone;
  glyph: "clock" | "triangle" | "check" | null;
}

export function nowWords(r: {
  state: ReferralState;
  routine: boolean;
  overdueDays: number | null;
  reasonCode?: string | null;
}): NowWords {
  if (r.overdueDays)
    return {
      words: `Overdue ${r.overdueDays} ${r.overdueDays === 1 ? "day" : "days"}`,
      tone: "caution",
      glyph: "clock",
    };
  switch (r.state) {
    case "draft":
    case "packed":
      return { words: "Packed, waiting for courier", tone: "dashed", glyph: null };
    case "handed_over":
      return r.routine
        ? { words: "With the rider or courier", tone: "neutral", glyph: null }
        : { words: "Handed to the outbreak team", tone: "neutral", glyph: null };
    case "at_hub":
      return { words: "At the hub", tone: "neutral", glyph: null };
    case "received_by_lab":
    case "accepted":
      return { words: "At the reference lab", tone: "neutral", glyph: null };
    case "in_progress":
      return { words: "Testing", tone: "neutral", glyph: null };
    case "on_hold":
      return { words: "On hold at the reference lab", tone: "neutral", glyph: null };
    case "completed":
      return { words: "Result back", tone: "check", glyph: "check" };
    case "rejected":
      return {
        words: `Rejected: ${r.reasonCode ? (REJECTION_REASON_TEXT[r.reasonCode] ?? r.reasonCode.replaceAll("_", " ")) : "reason not recorded"}`,
        tone: "caution",
        glyph: "triangle",
      };
    case "failed":
      return { words: "Could not be done", tone: "caution", glyph: "triangle" };
    case "lost":
      return { words: "Lost", tone: "caution", glyph: "triangle" };
    case "cancelled":
      return { words: "Cancelled", tone: "dashed", glyph: null };
  }
}

const day = (d: Date) =>
  d
    .toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Kampala",
    })
    .toUpperCase();

/** RF-11, Appendix A: the doctor's order line for a referred test. */
export function orderLineWords(r: {
  destination: string;
  sentAt: Date | null;
  expected: Date | null;
  overdueSince: Date | null;
  state: ReferralState;
  reasonCode?: string | null;
}): string {
  if (!r.sentAt) return `Being packed for ${r.destination}.`;
  if (r.state === "rejected")
    return fill(LAB4.rejectedByReferenceLab, {
      Destination: r.destination,
      specimen: "specimen",
      reason: r.reasonCode
        ? (REJECTION_REASON_TEXT[r.reasonCode] ?? r.reasonCode)
        : "reason not recorded",
    });
  if (r.state === "lost")
    return fill(LAB4.lost, {
      specimen: "specimen",
      destination: r.destination,
      date: day(r.sentAt),
    });
  if (r.overdueSince)
    return fill(LAB4.orderOverdue, {
      destination: r.destination,
      date: day(r.sentAt),
      since: day(r.overdueSince),
    });
  if (!r.expected)
    return fill(LAB4.orderNotStated, { destination: r.destination, date: day(r.sentAt) });
  return fill(LAB4.orderSent, {
    destination: r.destination,
    date: day(r.sentAt),
    expected: day(r.expected),
  });
}

/** Today in Kampala as `YYYY-MM-DD` (UTC+3, no daylight saving). A function, so a render never reads the clock. */
export const kampalaToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
