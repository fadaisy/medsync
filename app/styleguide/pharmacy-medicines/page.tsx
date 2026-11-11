import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { medicinesFixture } from "@/components/pharmacy/medicines/fixture";
import { MedicinesGrid } from "@/components/pharmacy/medicines/grid";

/** Development fixture: Set-up › Medicines and supplies on the prototype's sample list. 404 outside development. Actions fail here. */
export const metadata: Metadata = { title: "Medicines fixture", robots: { index: false } };

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main data-ds="tide" className="bg-background mx-auto max-w-[1400px] p-4">
      <MedicinesGrid data={medicinesFixture()} hospitalId="fixture" mode="edit" />
    </main>
  );
}
