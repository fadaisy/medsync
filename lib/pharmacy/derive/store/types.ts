import type { RuleNumbers } from "@/lib/pharmacy/rules/registry";

/**
 * Stock › Main store (STORE.md): the shape every derivation reads. The loader (`lib/pharmacy/store/read.ts`) fills it
 * from the ledger; a fixture fills it for the dev page and the tests. No stored totals: quantities here are sums of
 * ledger rows, values are quantity × the last unit cost. Dates are ISO (Africa/Kampala), times ISO instants.
 */
export type Ven = "V" | "E" | "N";

export interface StoreRules {
  monthsTo: number;
  shortUnder: number;
  tooMuch: number;
  notMoving: number;
  trimTo: number;
  urgentDays: number;
  fillTarget: number;
  runningOut: number;
  runningOutBad: number;
  overLevel: number;
  asksLess: number;
  coverAmber: number;
  transferOver: number;
  transferUnder: number;
  countEvery: number;
  cdCount: number;
  countSign: number;
  roomTemp: number;
  roomTempWarn: number;
  humidity: number;
  humidityWarn: number;
  expiryWindow: number;
  expiryBad: number;
  balanceCase: number;
  coldNear: number;
}

/** Every threshold, from the signed rules (the registry default until one is signed). */
export const storeRules = (n: RuleNumbers): StoreRules => ({
  monthsTo: n("ord", "months_to"),
  shortUnder: n("ord", "short_under"),
  tooMuch: n("ord", "too_much"),
  notMoving: n("ord", "not_moving"),
  trimTo: n("ord", "trim_to"),
  urgentDays: n("ord", "urgent_days"),
  fillTarget: n("ord", "fill_target"),
  runningOut: n("cold", "running_out"),
  runningOutBad: n("cold", "running_out_bad"),
  overLevel: n("cold", "over_level"),
  asksLess: n("cold", "asks_less"),
  coverAmber: n("cold", "cover_amber"),
  transferOver: n("cold", "transfer_over"),
  transferUnder: n("cold", "transfer_under"),
  countEvery: n("cold", "count_every"),
  cdCount: n("cold", "cd_count"),
  countSign: n("cold", "count_sign"),
  roomTemp: n("cold", "room_temp"),
  roomTempWarn: n("cold", "room_temp_warn"),
  humidity: n("cold", "humidity"),
  humidityWarn: n("cold", "humidity_warn"),
  expiryWindow: n("cold", "expiry_window"),
  expiryBad: n("cold", "expiry_bad"),
  balanceCase: n("inv", "balance_case"),
  coldNear: n("cold", "near_limit"),
});

export interface StoreMed {
  id: string;
  medicineId: string;
  name: string;
  short: string;
  unit: string;
  ven: Ven | null;
  pack: number;
  cold: boolean;
  controlled: boolean;
  cost: number;
  /** Store issues a month: the last 3 months, adjusted for days out of stock. */
  use: number;
  /** Days since the store last moved it; null when it never has. */
  moved: number | null;
  onOrder: number;
  /** The shelf bin it already sits on. */
  bin: string | null;
}

export interface StoreBatch {
  id: string;
  medId: string;
  no: string;
  exp: string;
  bin: string | null;
  qty: number;
  /** Waiting to be put away: from a delivery, no shelf yet. */
  waiting: boolean;
  grn: string | null;
  receivedAt: string | null;
  /** Expired or recalled: on the shelf, counted, but never on hand and never picked. */
  blocked?: boolean;
}

export interface StorePlace {
  id: string;
  name: string;
  kind: string;
}

/** One line at a place: what is there (confirmed only), use a month and the top-up level. */
export interface PlaceStock {
  medId: string;
  placeId: string;
  here: number;
  use: number;
  level: number;
}

export type DispatchKind =
  | "requisition"
  | "topup"
  | "urgent"
  | "transfer"
  | "straight"
  | "no_requisition"
  | "expiry_move"
  | "return";
export type DispatchStatus = "transit" | "received" | "diff";

export interface Dispatch {
  id: string;
  voucher: string;
  kind: DispatchKind;
  fromId: string;
  toId: string;
  sentAt: string;
  status: DispatchStatus;
  note: string | null;
  receivedAt: string | null;
  requisitionId: string | null;
  lines: { medId: string; no: string; qty: number }[];
}

export type ReqState = "open" | "partial" | "issued" | "received" | "diff";

export interface ReqLine {
  medId: string;
  asked: number;
  issued: number;
}

export interface Requisition {
  id: string;
  placeId: string;
  askedAt: string;
  urgent: boolean;
  reason: string | null;
  state: ReqState;
  /** First and latest voucher issued against it. */
  firstIssuedAt: string | null;
  voucher: string | null;
  diffNote: string | null;
  receivedAt: string | null;
  lines: ReqLine[];
}

export interface TopupRun {
  id: string;
  placeId: string;
  weekdays: number[];
  at: string;
  /** The voucher already sent for today. */
  sentVoucher: string | null;
}

export interface StoreReturn {
  id: string;
  placeId: string;
  medId: string;
  no: string;
  exp: string;
  qty: number;
  reason: string;
  acceptedVoucher: string | null;
}

export interface OrderLine {
  medId: string;
  qty: number;
  trimmed: boolean;
}

export interface StoreOrder {
  id: string;
  supplierId: string | null;
  supplier: string;
  state: "draft" | "open" | "closed";
  budget: number;
  sentAt: string | null;
  createdAt: string;
  /** Units received against this order, from its deliveries. */
  received: number;
  ordered: number;
  closedAt: string | null;
  lines: OrderLine[];
}

export interface SupplierStat {
  id: string;
  name: string;
  /** Lines ordered and received in units across its orders; days from sent to the first delivery. */
  ordered: number;
  received: number;
  leadDays: number[];
  promisedDays: number;
  openOrder: boolean;
  /** Claims not yet credited (Receive §E). */
  openClaims: number;
}

export interface Shelf {
  id: string;
  code: string;
  name: string;
  controlled: boolean;
  /** Days since it was last counted; null when never. */
  days: number | null;
  countedToday: boolean;
  waitingSign: boolean;
  /** Counted in the open stock-take. */
  inStocktake: boolean;
}

export interface ShelfCount {
  id: string;
  shelfId: string;
  voucher: string;
  countedAt: string;
  diffValue: number;
  needsSign: boolean;
  signed: boolean;
  stocktakeId: string | null;
  totalValue: number;
}

export interface Stocktake {
  id: string;
  startedAt: string;
  closedAt: string | null;
}

export interface QuarantineBatch {
  id: string;
  medId: string;
  no: string;
  exp: string;
  qty: number;
  why: string;
}

export interface StoreLoss {
  id: string;
  at: string;
  medId: string;
  no: string;
  qty: number;
  reason: string;
  note: string | null;
  value: number;
  voucher: string;
  caseId: string | null;
}

export interface RoomReading {
  at: string;
  temp: number;
  humidity: number;
}

export interface ColdRoom {
  code: string;
  sensor: string | null;
  fridgeId: string;
  temp: number | null;
  readAt: string | null;
  min: number | null;
  max: number | null;
  history: { at: string; temp: number }[];
  outOfRange7d: number;
  lines: string[];
}

/** One place × medicine, this month, from `pharmacy_place_balance_month`. */
export interface BalanceRow {
  placeId: string;
  medId: string;
  opening: number;
  received: number;
  used: number;
  sent: number;
  closing: number;
}

/** A place with an open balance case this month. */
export interface LedgerRow {
  at: string;
  ref: string;
  party: string;
  delta: number;
  by: string;
  isCount: boolean;
}

export interface WeekFlow {
  /** The Monday. */
  start: string;
  inValue: number;
  outValue: number;
}

export interface DayDelta {
  medId: string;
  day: string;
  delta: number;
}

export interface PlaceDayDelta extends DayDelta {
  placeId: string;
}

export interface StoreActor {
  userId: string;
  inCharge: boolean;
  name: string;
}

export interface StoreWorld {
  today: string;
  now: string;
  storeId: string;
  storeName: string;
  hospitalId: string;
  actor: StoreActor;
  rules: StoreRules;
  meds: StoreMed[];
  batches: StoreBatch[];
  places: StorePlace[];
  placeStock: PlaceStock[];
  dispatches: Dispatch[];
  requisitions: Requisition[];
  runs: TopupRun[];
  returns: StoreReturn[];
  orders: StoreOrder[];
  suppliers: SupplierStat[];
  shelves: Shelf[];
  counts: ShelfCount[];
  stocktake: Stocktake | null;
  quarantine: QuarantineBatch[];
  losses: StoreLoss[];
  room: RoomReading[];
  coldRoom: ColdRoom | null;
  balances: BalanceRow[];
  balanceCases: string[];
  weeks: WeekFlow[];
  /** Store ledger by day, last 12 weeks; stock-outs and availability walk back from today's balance. */
  storeDays: DayDelta[];
  /** Places' ledger by day, this month. */
  placeDays: PlaceDayDelta[];
  expiryActions: Record<string, string>;
  transfersArranged: {
    key: string;
    voucher: string;
    toId: string;
    qty: number;
    medId: string;
    fromId: string;
  }[];
  /** Stock card, only for the chosen medicine. */
  card: { medId: string; rows: LedgerRow[] } | null;
}
