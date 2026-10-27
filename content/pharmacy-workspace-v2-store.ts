/**
 * Pharmacy Workspace v2, Store place copy (GATE A §3, board Store). Shares PHWS2_COPY_STATUS (draft) in
 * content/pharmacy-workspace-v2.ts; never a status of its own. Law 4: no role words. Amber appears only for what an
 * engine marks overdue (a cart past its signed check interval); "still being counted" is a state, not lateness.
 */
export const PHWS2_STORE = {
  tabsLabel: "Store tabs",
  asOf: "As of {time}",
  refresh: "Refresh",
  flow: {
    title: "Where the hospital's medicines are",
    note: "Each stop is a tab below. Amber means something is overdue.",
    label: "Medicines flow",
    suppliers: "Suppliers",
    deliveriesWeek: "deliveries in the last 7 days",
    counting: "{n} still being counted",
    stores: "Stores",
    toIssue: "requisitions to issue",
    points: "Dispensing points",
    live: "live",
    toConfirm: "{n} issues not yet confirmed",
    wards: "Wards",
    keepStock: "{n} keep stock",
    carts: "Emergency carts",
    cartsSub: "carts",
    overdue: "{n} overdue for a check",
  },
  expiry: {
    title: "Expiry and recall",
    open: "Open",
    recalls: "{n} open recalls",
    recallsOne: "1 open recall",
    recallsNone: "No open recalls",
    expiring: "{n} batches expire in the look-ahead",
    expiringOne: "1 batch expires in the look-ahead",
    lookaheadNotSet: "Expiry look-ahead not set",
    expired: "{n} expired batches to move to quarantine",
    quarantine: "{n} batches in quarantine",
  },
  monthEnd: {
    title: "Month end",
    open: "Open",
    closed: "{month} closed on {date}.",
    notClosed: "{month} is not closed yet.",
  },
} as const;
