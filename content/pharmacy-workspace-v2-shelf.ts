/**
 * Pharmacy Workspace v2, Shelf place copy (GATE A §3, board Shelf). Shares PHWS2_COPY_STATUS (draft) in
 * content/pharmacy-workspace-v2.ts; never a status of its own. Law 4: no role words. Dropped from the board (GATE A
 * §1): the Counts tab, the cold chain figure and emergency dose matching.
 */
export const PHWS2_SHELF = {
  tabsLabel: "Shelf views",
  adjust: "Record an adjustment",
  asOf: "As of {time}",
  refresh: "Refresh",
  strip: {
    label: "Shelf at {point}",
    medicines: "Medicines here",
    out: "Out of stock",
    vital: "{n} on the vital list",
    vitalNotSet: "Vital list not set",
    low: "Below reorder level",
    lowSub: "Only medicines with a reorder level",
    lastCount: "Last count",
    lastCountNone: "No count yet",
  },
  controlled: {
    title: "Controlled drugs",
    open: "{n} open differences",
    openOne: "1 open difference",
    none: "No open differences.",
    line: "Batch {batch}: counted {counted}, record says {recorded}.",
    more: "And {n} more.",
    note: "A difference stays open until it is closed with a note.",
    register: "Open the register",
  },
  emergency: {
    title: "Emergency doses, last 7 days",
    body: "Doses recorded on the resus desk in the last 7 days.",
    see: "See the doses",
  },
} as const;
