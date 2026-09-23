"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Close" on the Emergency page: back to wherever the pill was pressed —
 * the landing page, the patient home, a staff workspace. Opened directly
 * (no in-app page behind it), it falls back to the landing page.
 */
export function CloseLink({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <Link
      href="/"
      className={className}
      onClick={(e) => {
        const cameFromHere =
          document.referrer.startsWith(window.location.origin) && window.history.length > 1;
        if (!cameFromHere) return;
        e.preventDefault();
        router.back();
      }}
    >
      Close
    </Link>
  );
}
