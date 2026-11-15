"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * A workspace's old sidebar-and-top-bar frame, which steps aside on the pages in `bareOn` (exact paths). Those
 * pages draw their own full-screen desk shell (Clinics & schedule, ADR 0501; the reception desk, ADR 0485), so the
 * frame around them doubled every menu and pushed the desk's own top bar out of view. Client-side because a layout
 * is not drawn again when the person moves between its pages.
 */
export function ShellFrame({
  bareOn,
  sidebar,
  header,
  children,
}: {
  bareOn: readonly string[];
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  if (bareOn.includes(path)) return <>{children}</>;
  return (
    <div className="bg-background text-foreground flex min-h-svh w-full">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
