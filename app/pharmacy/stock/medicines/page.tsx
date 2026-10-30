import StockMedicinePage from "../[medicineId]/page";
import { StockBody } from "../body";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

/**
 * Medicines (rework PRD §6.4): every medicine in every place, from the ledger, with its filters; `?med=` opens the
 * medicine page (stock per place and batch, months of stock, movements, the stock card).
 */
export default async function MedicinesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const med = (await searchParams).med;
  return typeof med === "string" && med ? (
    <StockMedicinePage params={Promise.resolve({ medicineId: med })} />
  ) : (
    <StockBody />
  );
}
