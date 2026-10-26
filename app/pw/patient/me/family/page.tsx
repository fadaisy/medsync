import type { Metadata } from "next";

import { HistoryPage } from "../_components/history-page";

export const metadata: Metadata = { title: "Family history" };
export const dynamic = "force-dynamic";

export default function FamilyPage() {
  return <HistoryPage section="family" />;
}
