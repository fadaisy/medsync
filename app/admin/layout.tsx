import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { requireAdminish } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Shared shell for the /admin/* routes. Guards entry: any request to
 * /admin/* must be authenticated AND hold either superadmin or
 * hospital_admin. Page-level guards further narrow what each role can
 * see (the queue server components filter rows by role).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const state = await requireAdminish();
  const isSuperadmin = state.roles.includes("superadmin");

  return (
    <div className="bg-background relative flex min-h-svh w-full flex-col">
      <header className="border-border w-full border-b">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-5 py-3 sm:px-8">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="font-display text-foreground text-[16px] tracking-tight transition-opacity hover:opacity-80"
            >
              MedSync
            </Link>
            <nav className="flex items-center gap-3">
              <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
                {isSuperadmin ? "Superadmin" : "Hospital admin"}
              </span>
              {isSuperadmin ? (
                <Link
                  href="/admin/applications"
                  className="text-muted-foreground hover:text-foreground text-[12.5px] transition-colors"
                >
                  Applications
                </Link>
              ) : null}
              <Link
                href="/admin/affiliations"
                className="text-muted-foreground hover:text-foreground text-[12.5px] transition-colors"
              >
                Affiliations
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden text-[12px] sm:inline">
              {state.user?.email}
            </span>
            <ThemeToggle />
            <form action="/sign-out" method="POST">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
