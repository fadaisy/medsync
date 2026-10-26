import type { Metadata } from "next";

import { HistoryPage } from "../_components/history-page";

export const metadata: Metadata = { title: "My conditions" };
export const dynamic = "force-dynamic";

export default function ConditionsPage() {
  return <HistoryPage section="conditions" />;
}
