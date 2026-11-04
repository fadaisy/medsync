import type { RuleNumbers } from "@/lib/pharmacy/rules/registry";

/** RECEIVE §J: every number from the registry. */
export interface ReceiveRules {
  look: number;
  priceTol: number;
  secondCheck: number;
  invPct: number;
  invUgx: number;
  targetStock: number;
  targetShelf: number;
  targetMatched: number;
  tempLow: number;
  tempHigh: number;
  coldMins: number;
}
export const receiveRules = (n: RuleNumbers): ReceiveRules => ({
  look: n("recv", "look"),
  priceTol: n("recv", "price_tol"),
  secondCheck: n("recv", "second_check"),
  invPct: n("recv", "inv_pct"),
  invUgx: n("recv", "inv_ugx"),
  targetStock: n("recv", "target_stock"),
  targetShelf: n("recv", "target_shelf"),
  targetMatched: n("recv", "target_matched"),
  tempLow: n("recv", "temp_low"),
  tempHigh: n("recv", "temp_high"),
  coldMins: n("recv", "cold_mins"),
});

export type DeliveryKind = "supplier" | "donation" | "facility" | "ward";
export type RejWhy = "damaged" | "wrong_product" | "expired" | "short_dated" | "recall" | "cold_chain" | "other";
export type LineSource = "scan" | "catalogue" | "typed" | "order";

export interface ReceiveMed {
  id: string;
  name: string;
  unit: string;
  per: number;
  /** The usual cost of a pack, 0 when none. */
  cost: number;
  shelf: string;
  gtin: string;
  cold: boolean;
  controlled: boolean;
  vaccine: boolean;
  regLapsed: boolean;
  local: boolean;
  ownCode: boolean;
  /** A place short of it, for "Send n straight to". */
  short: { place: string; placeName: string; n: number } | null;
}

/** One line as counted: inputs stay text, as typed, so a half-filled line saves. Same on the device and the server. */
export interface ReceiveLine {
  id: string;
  no: number;
  medId: string;
  source: LineSource;
  orderLineId: string | null;
  batch: string;
  exp: string;
  packs: string;
  per: string;
  notePacks: string;
  cost: string;
  temp: string;
  decision: "" | "accept" | "accept_tell" | "reject";
  approvedBy: string;
  approvalAsked: boolean;
  regReason: "" | "donation" | "no_registered_alternative" | "renewal_pending" | "other";
  regNote: string;
  rejOn: boolean;
  rejPacks: string;
  rejWhy: "" | RejWhy;
  rejFate: "driver" | "quarantine";
  vvm: "" | "1" | "2" | "3" | "4";
  freeze: "" | "ok" | "tripped";
  rank: number;
  owedFrozen: number | null;
  witnessName: string;
}

export interface PutRow {
  lineId: string;
  batchId: string;
  shelf: string;
  qty: number;
  sent: number;
  done: boolean;
  shelfRowId: string | null;
  /** Mine and this session's: undo is open. */
  alreadyOn: string | null;
}

export interface DeliveryPhoto {
  id: string;
  kind: "note" | "invoice" | "damage";
  url: string;
}

export interface ReceiveDelivery {
  id: string;
  kind: DeliveryKind;
  supplierId: string | null;
  /** Supplier name, or the donor, facility or ward. */
  source: string;
  from: string;
  fromPlace: string | null;
  orderId: string | null;
  note: string;
  place: string;
  /** `YYYY-MM-DD HH:MM`, Kampala. */
  arrived: string;
  deliverer: string;
  vehicle: string;
  blind: boolean;
  invoice: string;
  invoiceTotal: string;
  /** `queued` lives on the device only (§H). */
  state: "counting" | "queued" | "received" | "abandoned";
  grn: string;
  finished: string;
  shelvedAt: string;
  abandonReason: string;
  secondCheck: string;
  claimRef: string;
  lines: ReceiveLine[];
  put: PutRow[];
  photos: DeliveryPhoto[];
  /** Why it came back from the device. */
  conflict: string;
}

export interface ReceiveOrderLine {
  id: string;
  medId: string;
  packs: number;
  received: number;
  price: number;
}
export interface ReceiveOrder {
  id: string;
  ref: string;
  supplierId: string;
  supplier: string;
  place: string;
  leadDays: number;
  /** `YYYY-MM-DD`. */
  sentOn: string;
  chasedOn: string;
  editedOn: string;
  state: "sent" | "part" | "closed";
  lines: ReceiveOrderLine[];
}

export interface ReceiveRecall {
  medId: string;
  /** Empty: every batch of the medicine. */
  batch: string;
  notice: string;
  why: string;
  from: string;
}

export interface ClaimLine {
  medId: string;
  kind: string;
  packs: number;
  value: number;
}
export interface ReceiveClaim {
  id: string;
  ref: string;
  note: string;
  grn: string;
  deliveryId: string;
  supplierId: string;
  supplier: string;
  state: "draft" | "sent" | "credit";
  made: string;
  total: number;
  creditNote: string;
  lines: ClaimLine[];
}

export interface ReceiveDispatch {
  id: string;
  voucher: string;
  kindText: string;
  sentAt: string;
  state: "transit" | "received" | "diff";
  note: string;
  lines: { name: string; batch: string; qty: number }[];
}

export interface ReceivePlace {
  id: string;
  name: string;
  kind: string;
  /** Receives from suppliers itself (§A). */
  direct: boolean;
}

export interface ApprovalAsk {
  deliveryId: string;
  lineId: string;
  note: string;
  med: string;
  batch: string;
  exp: string;
  askedBy: string;
}

/** One finished delivery, for the figures (§G). */
export interface FigureRow {
  note: string;
  supplierId: string | null;
  arrived: string;
  finished: string;
  shelvedAt: string;
  lines: number;
  matched: number;
}

/** One order line, for the suppliers table (§G2). */
export interface SupplierRow {
  supplierId: string;
  orderId: string;
  sentOn: string;
  packs: number;
  received: number;
  /** First delivery against the order. */
  firstAt: string;
  leadDays: number;
}

export interface RegistrationLine {
  note: string;
  med: string;
  batch: string;
  reason: string;
}

export interface ReceiveWorld {
  hospitalId: string;
  facility: string;
  me: { id: string; name: string; inCharge: boolean };
  placeId: string;
  places: ReceivePlace[];
  meds: ReceiveMed[];
  suppliers: { id: string; name: string; leadDays: number }[];
  orders: ReceiveOrder[];
  deliveries: ReceiveDelivery[];
  claims: ReceiveClaim[];
  recalls: ReceiveRecall[];
  dispatches: ReceiveDispatch[];
  asks: ApprovalAsk[];
  figureRows: FigureRow[];
  supplierRows: SupplierRow[];
  registration: RegistrationLine[];
  rules: ReceiveRules;
  today: string;
}

/** What `lineInfo` reads. */
export type LineWorld = Pick<ReceiveWorld, "meds" | "orders" | "recalls" | "rules" | "today">;
