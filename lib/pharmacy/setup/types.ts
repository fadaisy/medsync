import type { RuleParam } from "@/content/pharmacy-rules";
import type { Hours, ItemKey, PlaceKind, TemplateKey } from "@/content/pharmacy-setup";
import type { Phase } from "@/lib/pharmacy/derive/setup/golive";
import type { HandoverToday } from "@/lib/pharmacy/derive/setup/places";

/**
 * Set-up › Going live, Places, Rules and Messages: what each tab's loader hands its client component
 * (lib/pharmacy/setup/read.ts). Plain data: dates are ISO strings, times "HH:MM" Africa/Kampala, money whole UGX.
 */

export interface GoLiveItem {
  key: ItemKey;
  status: "todo" | "done";
  answer: string | null;
  choice: string | null;
  decidedBy: string | null;
  doneByName: string | null;
  doneAt: string | null;
  owner: string;
  dueOn: string | null;
  /** Auto items: [done, total], from the same query the go-live guard runs. */
  prog: [number, number] | null;
}
export interface GoLiveEvent {
  at: string;
  who: string | null;
  kind: string;
  item: ItemKey | null;
  detail: string | null;
}
export interface GoLiveView {
  today: string;
  phase: Phase;
  target: string | null;
  liveAt: string | null;
  retiredAt: string | null;
  practice: { open: boolean; trainedMe: boolean };
  items: GoLiveItem[];
  signatures: { role: "in_charge" | "ms"; byName: string; at: string }[];
  /** Latest 8. */
  events: GoLiveEvent[];
  can: {
    /** The in-charge: date, practice, retire, marks, owners. */
    manage: boolean;
    /** The in-charge or the medical superintendent: record answers. */
    answer: boolean;
    signInCharge: boolean;
    signMs: boolean;
  };
}

export interface PlaceRow {
  id: string;
  name: string;
  kind: PlaceKind;
  /** Kind can change only between clinic and theatre (the others are hub-linked). */
  kindLocked: boolean;
  hours: Hours | null;
  suppliedFrom: string | null;
  supplierIds: string[];
  device: string | null;
  lastSeenAt: string | null;
  slots: string[];
  closed: { at: string; byName: string; note: string | null } | null;
  stock: { lines: number; low: number; out: number; valueUgx: number | null };
  short: { name: string; state: "low" | "out" }[];
  /** Cold-chain lines kept here (names). */
  coldLines: string[];
  handoversToday: HandoverToday[];
  /** Last 3: missed slots and handovers. */
  history: {
    date: string;
    slot: string;
    from: string;
    to: string;
    at: string | null;
    differences: number;
    missed: boolean;
  }[];
  handoverOpen: boolean;
  onDuty: { userId: string; name: string; shift: "day" | "night" | "call" }[];
  /** Dispensing points only: the billing controls (reused from Medicines). */
  billing: { free: boolean; payFirst: boolean; hospitalPayFirst: boolean } | null;
}
export interface FridgeRow {
  id: string;
  code: string;
  name: string;
  placeId: string | null;
  sensorId: string | null;
  temp: number | null;
  readAt: string | null;
  todayMin: number | null;
  todayMax: number | null;
  excursions7d: number;
  excursions: {
    startedAt: string;
    endedAt: string | null;
    peak: number;
    note: string | null;
    byName: string | null;
  }[];
  /** Typed readings today by check ("08:00", "17:00"). */
  typed: Record<string, number>;
}
export interface SupplierRow {
  id: string;
  name: string;
  what: string | null;
  cycleMonths: number;
  nextCycleOn: string | null;
  leadDays: number;
  budgetUgx: number;
  usedUgx: number;
  period: string | null;
  contact: string | null;
  phoneMasked: string | null;
  /** tel: href, only when a phone is saved. */
  tel: string | null;
}
export interface PlacesView {
  nowMs: number;
  today: string;
  nowMin: number;
  /** From the signed rules. */
  rules: { missedMin: number; nearC: number; orderDueDays: number };
  places: PlaceRow[];
  fridges: FridgeRow[];
  suppliers: SupplierRow[];
  /** For "Add a place": hub units (stores) and wards not yet places. */
  hub: { units: { id: string; name: string }[]; wards: { id: string; name: string }[] };
  can: { manage: boolean; readings: boolean; suppliers: boolean };
}

export interface RuleRow {
  key: string;
  name: string;
  /** The wording in force, with the number filled. */
  text: string;
  appliesTo: string;
  param: RuleParam | null;
  /** The number in force. */
  n: number | null;
  source: "signed" | "changed" | "default";
  changedAt: string | null;
  isNew: boolean;
  pendingId: string | null;
}
export interface RuleGroupRow {
  key: string;
  title: string;
  showsOn: readonly string[];
  signed: boolean;
  signatures: { role: "in_charge" | "second"; byName: string; at: string }[];
  rules: RuleRow[];
}
export interface ProposalRow {
  id: string;
  group: string;
  key: string;
  name: string;
  kind: "change" | "new";
  oldText: string | null;
  newText: string;
  reason: string;
  proposedBy: string;
  proposedByName: string;
  proposedAt: string;
  appliesTo: string;
  roles: ("in_charge" | "second")[];
  signedBy: string[];
}
export interface RuleHistoryRow {
  at: string;
  group: string;
  name: string;
  from: string | null;
  to: string | null;
  kind: "changed" | "added" | "rejected" | "group_signed";
  proposer: string | null;
  signers: string[];
  rejectNote: string | null;
  rejectedBy: string | null;
}
export interface RulesView {
  me: string;
  groups: RuleGroupRow[];
  proposals: ProposalRow[];
  history: RuleHistoryRow[];
  can: { propose: boolean; signInCharge: boolean; signSecond: boolean };
}

export interface TemplateRow {
  key: TemplateKey;
  on: boolean;
  timing: string;
  en: string;
  lg: string | null;
  lgCheckedAt: string | null;
  sentThisMonth: number;
}
export interface OutboxRow {
  id: string;
  at: string;
  rule: TemplateKey | "test";
  phoneMasked: string;
  lang: "en" | "lg";
  note: string | null;
  status: "queued" | "sent" | "delivered" | "failed";
}
export interface MessagesView {
  nowMin: number;
  provider: {
    name: string;
    senderId: string;
    costUgx: number;
    facility: string | null;
    connected: boolean;
  } | null;
  budgetUgx: number | null;
  spentUgx: number;
  rules: { capPct: number; perPatient: number };
  stats: {
    sent: number;
    delivered: number;
    failed: number;
    queued: number;
    optedOut: number;
    consented: number;
    patients: number;
  };
  templates: TemplateRow[];
  /** Latest 50. */
  outbox: OutboxRow[];
  optOuts: {
    hmac: string;
    phoneMasked: string;
    reason: string | null;
    source: "reply_stop" | "staff";
    at: string;
  }[];
  can: { manage: boolean };
}
