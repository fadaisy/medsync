"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";

/**
 * The hub's frame (title, counts, tabs, a 6xl column) for every tab — except Wards and beds, which is its own
 * desk page in the admin frame (phase 2 of ADR 0516), and a ward's layout and bed board, full-height working pages
 * (ADR 0191). Those fill the admin frame's scrolling page.
 */
export function HubFrame({ chrome, children }: { chrome: ReactNode; children: ReactNode }) {
  const seg = useSelectedLayoutSegments();
  if (seg[0] === "wards") return <div className="flex h-full min-w-0 flex-col">{children}</div>;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      {chrome}
      {children}
    </div>
  );
}
