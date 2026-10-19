/**
 * Needs you (Lab Workspace v2 prompt 5.3, 6.2; ADR 0345): one list of what waits on a person in the lab, from
 * existing sources only. Pure: the read (needs-you-read.ts) gathers the rows; this orders, scopes and filters
 * them. An item has no state of its own: it leaves when its source changes, never by a dismiss (D-UI-05).
 */

export type NeedsYouKind =
  | "alert"
  | "delta"
  | "qc_hold"
  | "match"
  | "overdue"
  | "lot"
  | "signature";
export type NeedsYouGroup = "now" | "lab" | "today";
export type NeedsYouFilter = "all" | "results" | "quality" | "send_outs" | "setup";

export interface NeedsYouItem {
  /** Stable key: kind + source id. */
  key: string;
  kind: NeedsYouKind;
  /** The object's words (test, lot, item); identifiers below. */
  title: string;
  /** The patient, when there is one: the page shows both identifiers (Law 5) through `identitiesFor`. */
  patientUserId: string | null;
  /** Restricted test (Law 6): a mark beside the name, the name never hinted by location. */
  restricted?: boolean;
  /** One more line: escalation level, partner and days, change, drafted by. */
  detail: string | null;
  /** Server time it has waited since. */
  since: Date;
  /** The exact place to act. */
  href: string;
  /** How many results this item stands for (QC holds and matches are grouped). */
  count?: number;
}

export const GROUP_OF: Record<NeedsYouKind, NeedsYouGroup> = {
  alert: "now",
  delta: "lab",
  qc_hold: "lab",
  match: "lab",
  overdue: "today",
  lot: "today",
  signature: "today",
};

export const FILTER_OF: Record<NeedsYouKind, Exclude<NeedsYouFilter, "all">> = {
  alert: "results",
  delta: "results",
  qc_hold: "quality",
  match: "send_outs",
  overdue: "send_outs",
  lot: "quality",
  signature: "setup",
};

const GROUP_ORDER: Record<NeedsYouGroup, number> = { now: 0, lab: 1, today: 2 };

/** NY-2: by group (Now, Waiting on the lab, Today), then oldest first. */
export function orderNeedsYou(items: readonly NeedsYouItem[]): NeedsYouItem[] {
  return [...items].sort(
    (a, b) =>
      GROUP_ORDER[GROUP_OF[a.kind]] - GROUP_ORDER[GROUP_OF[b.kind]] ||
      a.since.getTime() - b.since.getTime() ||
      a.key.localeCompare(b.key),
  );
}

/**
 * NY-3: what the viewer may act on. Signatures are the lead's (lab.manage); match items need the resolve
 * permission; lots need stock management; everything else needs lab.view.
 */
export function scopeNeedsYou(
  items: readonly NeedsYouItem[],
  can: { manage: boolean; resolveMatch: boolean; stock: boolean },
): NeedsYouItem[] {
  return items.filter((i) =>
    i.kind === "signature"
      ? can.manage
      : i.kind === "match"
        ? can.resolveMatch
        : i.kind === "lot"
          ? can.stock
          : true,
  );
}

export function filterNeedsYou(items: readonly NeedsYouItem[], f: NeedsYouFilter): NeedsYouItem[] {
  return f === "all" ? [...items] : items.filter((i) => FILTER_OF[i.kind] === f);
}

export function groupNeedsYou(
  items: readonly NeedsYouItem[],
): { group: NeedsYouGroup; items: NeedsYouItem[] }[] {
  const out: { group: NeedsYouGroup; items: NeedsYouItem[] }[] = [];
  for (const i of orderNeedsYou(items)) {
    const g = GROUP_OF[i.kind];
    const last = out.at(-1);
    if (last?.group === g) last.items.push(i);
    else out.push({ group: g, items: [i] });
  }
  return out;
}

/** "12 min", "1 h 08", "3 days": how long an item has waited, from the server's now. */
export function waited(since: Date, now: Date): string {
  const m = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  return `${Math.floor(m / 1440)} days`;
}
