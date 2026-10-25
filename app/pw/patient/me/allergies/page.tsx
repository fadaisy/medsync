import type { Metadata } from "next";

import { HistoryPage } from "../_components/history-page";

export const metadata: Metadata = { title: "Allergies · MedSync" };
export const dynamic = "force-dynamic";

export default function AllergiesPage() {
  return <HistoryPage section="allergies" />;
}
