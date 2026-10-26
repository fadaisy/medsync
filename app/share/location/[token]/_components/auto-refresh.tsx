"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads the share every 30 seconds while the page is open; nothing to see. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
