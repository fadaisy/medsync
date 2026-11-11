/**
 * Needs you (GATE A §7, D-PW-06): one inbox over existing sources. Pure types and grouping; the reads are in
 * app/pharmacy/_lib/needs-you.ts. An item leaves only when its source changes.
 */
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_NEEDS_YOU } from "@/content/pharmacy-workspace-v2-needs-you";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

export type NeedsYouGroup = "today" | "store" | "clinical" | "setup";
export type NeedsYouKind =
  | "controlled"
  | "lookBack"
  | "downtime"
  | "delivery"
  | "requisition"
  | "confirm"
  | "reaction"
  | "reconciliation"
  | "pack";

export const KIND_GROUP: Record<NeedsYouKind, NeedsYouGroup> = {
  controlled: "today",
  lookBack: "today",
  downtime: "today",
  delivery: "store",
  requisition: "store",
  confirm: "store",
  reaction: "clinical",
  reconciliation: "clinical",
  pack: "setup",
};

export interface NeedsYouItem {
  kind: NeedsYouKind;
  /** Stable per source row, for keys. */
  id: string;
  /** How many source rows this item stands for (a grouped item, e.g. "3 supplies to look back at"). */
  n: number;
  /** ISO time the oldest source row began, or null. */
  since: string | null;
  /** Late by the source's own rule (amber with its word). */
  attention: boolean;
  href: string;
  /** Short facts for the row (e.g. "Morphine M-0112 · counted 6, record 7"); never patient names. */
  detail: string | null;
}

export const GROUP_ORDER: readonly NeedsYouGroup[] = ["today", "store", "clinical", "setup"];

export function groupNeedsYou(items: readonly NeedsYouItem[]) {
  return GROUP_ORDER.map((g) => ({
    group: g,
    items: items.filter((i) => KIND_GROUP[i.kind] === g),
  })).filter((x) => x.items.length);
}

/** Chip filter on the Needs you page; "all" keeps everything. */
export function filterNeedsYou(items: readonly NeedsYouItem[], chip: string | undefined) {
  if (!chip || chip === "all") return [...items];
  return items.filter((i) => i.kind === chip || KIND_GROUP[i.kind] === chip);
}

/* ─── Gating (D-PW-06): each source only for the permission that acts on it, and only where its tab exists ─── */

export interface NeedsYouGate {
  /** v2.permissions. */
  permissions: ReadonlySet<string>;
  /** The viewer's tabs as "place.key" (v2.tabs). */
  tabs: ReadonlySet<string>;
  /** An acting point exists (controlled differences are per point). */
  acting: boolean;
}

const RULES: Record<NeedsYouKind, (g: NeedsYouGate) => boolean> = {
  controlled: (g) =>
    g.acting && g.permissions.has("pharmacy.manage") && g.tabs.has("shelf.controlled"),
  lookBack: (g) => g.permissions.has("pharmacy.review") && g.tabs.has("window.supplied"),
  downtime: (g) => g.permissions.has("pharmacy.dispense") && g.tabs.has("setup.downtime"),
  delivery: (g) => g.permissions.has("pharmacy.store") && g.tabs.has("store.deliveries"),
  requisition: (g) => g.permissions.has("pharmacy.store") && g.tabs.has("store.issues"),
  confirm: (g) => g.permissions.has("pharmacy.stock") && g.tabs.has("store.issues"),
  reaction: (g) => g.permissions.has("pharmacy.review") && g.tabs.has("clinical.reactions"),
  reconciliation: (g) =>
    g.permissions.has("pharmacy.review") && g.tabs.has("clinical.reconciliation"),
  pack: (g) => g.permissions.has("pharmacy.manage") && g.tabs.has("setup.packs"),
};

/** The sources this viewer sees; the reads run only for these. */
export function needsYouKinds(g: NeedsYouGate): NeedsYouKind[] {
  return (Object.keys(RULES) as NeedsYouKind[]).filter((k) => RULES[k](g));
}

/* ─── Shaping: the existing loaders' rows → items ─── */

type When = Date | string;
const iso = (d: When) => (typeof d === "string" ? d : d.toISOString());
const at = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: DEFAULT_TIME_ZONE,
});

/** What each loader returned (only the fields used); a missing source is not shown. */
export interface NeedsYouSources {
  /** getControlledRegister(…, acting point).differences */
  controlled?: readonly {
    id: string;
    at: When;
    batchNumber: string;
    counted: number;
    recorded: number;
  }[];
  /** getLookBack */
  lookBack?: readonly { supplyId: string; at: When }[];
  /** countSheetsToEnter */
  downtime?: number;
  /** getDeliveriesPage().deliveries */
  deliveries?: readonly {
    id: string;
    noteNumber: string | null;
    supplier: string;
    locationName: string;
    arrivedAt: When;
    state: string;
  }[];
  /** getIssuesPage().requisitions */
  requisitions?: readonly {
    id: string;
    fromName: string;
    toName: string;
    raisedAt: When;
    state: string;
    lines: number;
  }[];
  /** getIssuesPage().toConfirm */
  toConfirm?: readonly { issueId: string; from: string; to: string; issuedAt: When }[];
  /** listReports */
  reactions?: readonly {
    id: string;
    medicine: string;
    recordedAt: When;
    state: string;
    pastDue: boolean;
    dueAt: Date | null;
  }[];
  /** listReconciliations */
  reconciliations?: readonly { rec: { id: string; openedAt: When }; state: string }[];
  /** packRows */
  packs?: readonly { kind: string; signed: unknown }[];
}

const T = PHWS2_NEEDS_YOU.detail;
const oldest = (xs: readonly When[]) => (xs.length ? xs.map(iso).sort()[0]! : null);

export function buildNeedsYou(s: NeedsYouSources): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  for (const d of s.controlled ?? [])
    out.push({
      kind: "controlled",
      id: `controlled:${d.id}`,
      n: 1,
      since: iso(d.at),
      attention: true,
      href: "/pharmacy/shelf?view=controlled",
      detail: fill(T.controlled, {
        batch: d.batchNumber,
        counted: d.counted,
        recorded: d.recorded,
      }),
    });
  if (s.lookBack?.length)
    out.push({
      kind: "lookBack",
      id: "lookBack",
      n: s.lookBack.length,
      since: oldest(s.lookBack.map((r) => r.at)),
      attention: false,
      href: "/pharmacy/window?view=supplied",
      detail: T.lookBack,
    });
  if (s.downtime)
    out.push({
      kind: "downtime",
      id: "downtime",
      n: s.downtime,
      since: null,
      attention: false,
      href: "/pharmacy/setup?view=downtime",
      detail: T.downtime,
    });
  for (const d of s.deliveries ?? [])
    if (d.state === "counting")
      out.push({
        kind: "delivery",
        id: `delivery:${d.id}`,
        n: 1,
        since: iso(d.arrivedAt),
        attention: false,
        href: `/pharmacy/stock/store?tab=receive&delivery=${d.id}`,
        detail: fill(d.noteNumber ? T.delivery : T.deliveryNoNote, {
          note: d.noteNumber ?? "",
          supplier: d.supplier,
          place: d.locationName,
        }),
      });
  for (const r of s.requisitions ?? [])
    if (r.state === "raised")
      out.push({
        kind: "requisition",
        id: `requisition:${r.id}`,
        n: 1,
        since: iso(r.raisedAt),
        attention: false,
        href: `/pharmacy/store/issues/${r.id}`,
        detail: fill(T.requisition, { from: r.fromName, to: r.toName, lines: r.lines }),
      });
  for (const c of s.toConfirm ?? [])
    out.push({
      kind: "confirm",
      id: `confirm:${c.issueId}`,
      n: 1,
      since: iso(c.issuedAt),
      attention: false,
      href: "/pharmacy/store?tab=issues",
      detail: fill(T.confirm, { from: c.from, to: c.to }),
    });
  // Past due first, then oldest first (data-sources.md).
  const reactions = (s.reactions ?? [])
    .filter((r) => r.state === "to_submit")
    .sort(
      (a, b) =>
        Number(b.pastDue) - Number(a.pastDue) || iso(a.recordedAt).localeCompare(iso(b.recordedAt)),
    );
  for (const r of reactions)
    out.push({
      kind: "reaction",
      id: `reaction:${r.id}`,
      n: 1,
      since: iso(r.recordedAt),
      attention: r.pastDue,
      href: `/pharmacy/clinical/reactions/${r.id}`,
      detail: r.dueAt
        ? fill(T.reactionDue, { medicine: r.medicine, due: at.format(r.dueAt) })
        : fill(T.reaction, { medicine: r.medicine }),
    });
  for (const r of s.reconciliations ?? [])
    if (r.state === "open" || r.state === "reopened")
      out.push({
        kind: "reconciliation",
        id: `reconciliation:${r.rec.id}`,
        n: 1,
        since: iso(r.rec.openedAt),
        attention: false,
        href: `/pharmacy/clinical/reconciliation/${r.rec.id}`,
        detail: fill(r.state === "reopened" ? T.reconciliationReopened : T.reconciliationOpen, {
          at: at.format(new Date(iso(r.rec.openedAt))),
        }),
      });
  const missing = (s.packs ?? []).filter((p) => p.signed === null);
  if (missing.length)
    out.push({
      kind: "pack",
      id: "pack",
      n: missing.length,
      since: null,
      attention: false,
      href: "/pharmacy/setup",
      detail: T.pack,
    });
  return out;
}
