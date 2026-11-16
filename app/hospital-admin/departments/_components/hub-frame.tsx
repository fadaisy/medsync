"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";

/**
 * The hub's frame (title, counts, tabs, a 6xl column) for the tabs still in the older look — except a ward's layout
 * and bed board, which are full-width working pages inside the hospital shell (ADR 0191). Departments and
 * Emergency and support draw their own Tether desk page (ADR 0516 phase 2), so the frame steps aside there.
 */
export function HubFrame({ chrome, children }: { chrome: ReactNode; children: ReactNode }) {
  const seg = useSelectedLayoutSegments();
  // The page's own segment can arrive as "__PAGE__" with its search params attached.
  const own = seg.length === 0 || seg[0]!.startsWith("__PAGE__") || seg[0] === "emergency";
  if (own) return <>{children}</>;
  const fullWidth =
    seg[0] === "wards" && seg.length >= 3 && (seg[2] === "layout" || seg[2] === "board");
  if (fullWidth) return <div className="flex min-w-0 flex-col">{children}</div>;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      {chrome}
      {children}
    </div>
  );
}
