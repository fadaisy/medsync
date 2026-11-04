import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReceiveTab } from "@/components/pharmacy/receive";

import { fixtureWorld } from "./world";

/**
 * Development fixture: Stock › Receive a delivery in every state, for screenshots and axe. No database; a save is
 * refused. Off unless MEDSYNC_FIXTURES=1. `?delivery=` opens one of the deliveries in `world.ts`.
 */
export const metadata: Metadata = { title: "Receive fixture", robots: { index: false } };

export default async function ReceiveFixture({ searchParams }: { searchParams: Promise<{ delivery?: string }> }) {
  if (process.env.MEDSYNC_FIXTURES !== "1") notFound();
  const { delivery } = await searchParams;
  return (
    <main data-ds="tide" className="bg-background mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
      <ReceiveTab world={fixtureWorld()} deliveryId={delivery ?? null} live={false} />
    </main>
  );
}
