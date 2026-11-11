"use client";

import { useStockLive } from "@/components/pharmacy/medicines/use-stock-live";

/** Places and Messages stay current: fridge readings and the outbox broadcast on `pharmacy-stock:<hospital>` (0270, 0274); 30 s polling while the channel is down. */
export function SetupLive({ hospitalId }: { hospitalId: string }) {
  useStockLive(hospitalId);
  return null;
}
