/**
 * The words an alert is shown in (Lab Phase 1 §5.3, §5.4; Law 2). Pure. "Sent", "seen" and
 * "acknowledged" are different words; amber only for late, escalated and not sent (Law 10).
 */
import type { ResponseTimes } from "./escalation";

import { CRITICALS_COPY, CRITICALS_UI } from "@/content/lab-criticals";

export type Tone = "neutral" | "caution";

export interface CellInput {
  state: "open" | "acknowledged";
  subState: "sent" | "not_sent" | "escalated" | null;
  sentAt: Date;
  escalatedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedVia: "app" | "phone" | null;
  acknowledgedByCadre: string | null;
  loggedByCadre: string | null;
  deliveryFailed: boolean;
}

/** §5.3: the Alert cell. Amber past half the signed time (D-LAB1-19) or any time after it. */
export function alertCell(
  a: CellInput,
  now: Date,
  times: ResponseTimes | null,
  time: (d: Date) => string,
): { text: string; tone: Tone } {
  const C = CRITICALS_UI.cell;
  if (a.state === "acknowledged") {
    const at = time(a.acknowledgedAt!);
    return a.acknowledgedVia === "phone"
      ? { text: C.byPhone(at, a.loggedByCadre ?? "the lab"), tone: "neutral" }
      : { text: C.acknowledged(at, a.acknowledgedByCadre ?? "a clinician"), tone: "neutral" };
  }
  if (a.subState === "not_sent" || a.deliveryFailed) return { text: C.notSent, tone: "caution" };
  if (a.subState === "escalated" && a.escalatedAt)
    return { text: C.escalated(time(a.escalatedAt)), tone: "caution" };
  const min = Math.max(0, Math.floor((now.getTime() - a.sentAt.getTime()) / 60_000));
  if (times && min * 2 >= times.ackWithinMin) return { text: C.late(min), tone: "caution" };
  return { text: C.sent(min), tone: "neutral" };
}

export interface TitleInput {
  marked: {
    display: string;
    value: string;
    unit: string | null;
    direction: "low" | "high" | null;
    /** A correction: the value it replaces (CA-10). */
    was?: string;
  }[];
}

/** §5.4 and Appendix A: "Critical result: {test} {value} {unit}, {high or low}." One line per value. */
export function alertTitles(a: TitleInput): string[] {
  return a.marked.map((m) =>
    m.was !== undefined
      ? CRITICALS_COPY.correctionTitle(m.display, m.was, m.value, m.unit ?? "").replace(
          /\s+\.$/,
          ".",
        )
      : m.direction
        ? CRITICALS_COPY.alertTitle(m.display, m.value, m.unit ?? "", m.direction).replace(
            /\s+,/,
            ",",
          )
        : `Critical result: ${[m.display, m.value, m.unit].filter(Boolean).join(" ")}.`,
  );
}

/** "4 min ago", "1 h 5 min ago": how long ago, in words. */
export function ago(from: Date, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ""} ago`;
}

export interface TimelineInput {
  kind: string;
  level: number | null;
  actor: string | null;
  recipient: string | null;
  channel: string | null;
  outcome: string | null;
  detail: Record<string, unknown>;
}

const RESPONSE_WORDS: Record<string, string> = CRITICALS_COPY.responses;
const LEVEL = (n: number | null) =>
  n === 0 ? "the ordering team" : n === 1 ? "the department's contacts" : "the hospital's contacts";

/**
 * §5.3: one line per event, in words, for the lab's detail and the escalated doctor (§5.4). A recipient
 * opening the alert reads "Opened by …, not acknowledged" (CA-5); an SMS that was off says nothing.
 * Returns null for an event with nothing to say.
 */
export function timelineLine(e: TimelineInput): string | null {
  const d = e.detail;
  const empty =
    Array.isArray(d.emptyLevels) && d.emptyLevels.length > 0
      ? ` Nobody was set up for ${(d.emptyLevels as number[]).map(LEVEL).join(" or ")}.`
      : "";
  switch (e.kind) {
    case "created":
      return d.correctionOf
        ? `Corrected result sent by ${e.actor ?? "the lab"}.`
        : `Marked critical and released by ${e.actor ?? "the lab"}.${empty}`;
    case "notified":
      if (e.channel === "app")
        return e.outcome === "failed"
          ? `Could not be sent to ${e.recipient}. Phone the ward.`
          : e.outcome === "queued"
            ? `Sent to ${e.recipient} in MedSync.`
            : null;
      return e.outcome === "queued" || e.outcome === "delivered"
        ? `SMS ${e.outcome === "delivered" ? "delivered to" : "sent to"} ${e.recipient}.`
        : e.outcome === "failed"
          ? `SMS to ${e.recipient} failed.`
          : null;
    case "seen":
      return `Opened by ${e.recipient}, not acknowledged.`;
    case "call_logged": {
      const to = e.recipient ?? [d.name, d.role].filter(Boolean).join(", ");
      return `Phone call to ${to || "someone not on MedSync"} logged by ${e.actor}${d.readBack ? ", read back" : ", not read back"}.`;
    }
    case "could_not_reach":
      return `${e.actor ?? "The lab"} could not reach anyone.`;
    case "escalated":
      return `Escalated to ${LEVEL(e.level)}.${empty}`;
    case "acknowledged": {
      const how = e.channel === "phone" ? " by phone" : "";
      const response =
        typeof d.response === "string" ? `: ${RESPONSE_WORDS[d.response] ?? d.response}` : "";
      return `Acknowledged${how} by ${e.actor}${response}.`;
    }
    case "disputed":
      return `Phone acknowledgement disputed by ${e.actor}. Open again.`;
    case "corrected":
      return "The result was corrected. A correction alert was sent.";
    default:
      return null;
  }
}

/** "Not acknowledged for {n} minutes by {role, place}": whoever had the alert before it came to me. */
export function missedBy(a: {
  escalatedFrom: number | null;
  level: number;
  place: string | null;
}): string {
  const from = a.escalatedFrom ?? a.level - 1;
  return from <= 0
    ? `the ordering team, ${a.place ?? "the ward"}`
    : `${a.place ?? "the ward"}'s critical-results contacts`;
}
