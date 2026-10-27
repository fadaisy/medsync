/**
 * Pharmacy Workspace v2, Find's batch, supplied and delivery rows (board Find). Shares `PHWS2_COPY_STATUS` (draft)
 * in content/pharmacy-workspace-v2.ts; the CSO signs. Law 4: no role words.
 */
export const PHWS2_FIND = {
  batch: "{product} · {batch}",
  batchSub: "{place} · expires {expiry}",
  batchSubNoPlace: "Expires {expiry}",
  firstNumber: "first recorded as {first}",
  supplied: "{mrn} · {medicine} · supplied {at}",
  delivery: "{supplier} · {place} · arrived {at}",
} as const;
