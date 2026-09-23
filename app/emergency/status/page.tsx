import type { Metadata } from "next";
import Link from "next/link";

import { StatusPanel } from "./_components/status-panel";

export const metadata: Metadata = {
  title: "Your pre-alert",
  robots: { index: false, follow: false },
};

/**
 * E3 (PRD MS-PRD-SYM-001 §8.4): the reporter's view of one pre-alert. The
 * page is a shell; the panel polls `pt-pre-arrival-status` with the token
 * E2 stored on this device — the id alone confirms nothing (PRD §9.3), so
 * a reload from another device reads as "not found", never as someone
 * else's alert. Follows the site theme.
 */
type Search = Record<string, string | string[] | undefined>;

export default async function StatusPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const id = (Array.isArray(sp.id) ? sp.id[0] : sp.id) ?? null;

  return (
    <div className="bg-background text-foreground min-h-svh">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
        <nav aria-label="Back" className="flex justify-between">
          <Link
            href="/emergency"
            className="text-muted-foreground hover:text-foreground text-body-s inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            Emergency numbers
          </Link>
        </nav>
        {id ? (
          <StatusPanel id={id} />
        ) : (
          <p className="text-foreground text-body-m">
            No pre-alert to show.{" "}
            <Link
              href="/emergency#tell"
              className="text-primary underline-offset-4 hover:underline"
            >
              Tell a hospital you&rsquo;re coming
            </Link>
            .
          </p>
        )}
      </main>
    </div>
  );
}
