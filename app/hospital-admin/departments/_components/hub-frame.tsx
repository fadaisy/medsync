"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";

/**
 * The hub's frame (title, counts, tabs, a 6xl column) for the pages still in the older look. Departments, Emergency
 * and support, and Wards and beds draw their own Tether desk pages (ADR 0517), so the frame steps aside there; a
 * ward's layout and bed board are full-height working pages (ADR 0191) that fill the admin frame's scrolling page.
 */
export function HubFrame({ chrome, children }: { chrome: ReactNode; children: ReactNode }) {
  const seg = useSelectedLayoutSegments();
  if (seg[0] === "wards") return <div className="flex h-full min-w-0 flex-col">{children}</div>;
  // The page's own segment can arrive as "__PAGE__" with its search params attached.
  const own = seg.length === 0 || seg[0]!.startsWith("__PAGE__") || seg[0] === "emergency";
  if (own) return <>{children}</>;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      {chrome}
      {children}
    </div>
  );
}
