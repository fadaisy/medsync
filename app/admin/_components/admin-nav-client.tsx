"use client";

import { usePathname } from "next/navigation";

import { AdminNav } from "./admin-nav";

/**
 * Thin client wrapper so the layout (a Server Component) can pass
 * `isSuperadmin` down and we still read the current pathname for
 * active-link highlighting. Splitting client/server lets the rest of
 * the admin shell stay server-rendered for the auth check.
 */
export function AdminNavClient({ isSuperadmin }: { isSuperadmin: boolean }) {
  const pathname = usePathname();
  return <AdminNav isSuperadmin={isSuperadmin} pathname={pathname} />;
}
