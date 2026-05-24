"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin client wrapper that reads the current pathname and tells the
 * server-rendered sidebar item whether it's the active route. Render-
 * prop pattern keeps the parent server-side except for this one bit.
 */
interface Props {
  href: string;
  children: (isActive: boolean) => ReactNode;
}

export function AdminSidebarActiveMarker({ href, children }: Props) {
  const pathname = usePathname();
  const isActive =
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(`${href}/`);
  return <>{children(isActive)}</>;
}
