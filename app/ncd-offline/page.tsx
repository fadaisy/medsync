import type { Metadata } from "next";

import { OfflineApp } from "./_components/offline-app";

export const metadata: Metadata = { title: "NCD registry · offline", robots: { index: false, follow: false } };
export const dynamic = "force-static";

/** The static offline shell (§9): no data in the HTML; everything comes from the encrypted device cache. */
export default function OfflinePage() {
  return <OfflineApp />;
}
