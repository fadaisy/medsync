import type { StoreSection } from "@/content/pharmacy-store";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MainStore } from "@/components/pharmacy/store/shell";
import { SECTION_LABEL } from "@/content/pharmacy-store";
import snapshot from "./world.json";

/**
 * Development fixture: Stock › Main store on the seed's synthetic data (a saved `loadStoreWorld`, no database, no real
 * people), for the 1440 and 390 px pass and axe. 404 in production. Actions fail here; the page only renders.
 * `?section=`, `?med=` and `?shelf=` work as on the real page.
 */
export const metadata: Metadata = { title: "Main store fixture", robots: { index: false } };

type Snap = { world: StoreWorld; cards: Record<string, NonNullable<StoreWorld["card"]>> };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; med?: string; shelf?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const { world, cards } = snapshot as unknown as Snap;
  const section = (sp.section && sp.section in SECTION_LABEL ? sp.section : "home") as StoreSection;
  const med = sp.med && cards[sp.med] ? sp.med : section === "card" ? world.meds[0]!.id : null;
  return (
    <main data-ds="tide" className="bg-background mx-auto flex w-full flex-col gap-4 p-4">
      <MainStore
        world={{ ...world, card: med ? cards[med]! : null }}
        section={section}
        shelfId={sp.shelf ?? null}
        live={false}
      />
    </main>
  );
}
