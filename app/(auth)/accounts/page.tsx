import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/medsync/auth-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ACCOUNTS } from "@/content/auth";
import { listAccounts } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Accounts" };

/**
 * Every account signed in to this browser. Switching and signing out are
 * plain form POSTs, so the page reloads whole and no client keeps talking as
 * the previous account.
 */
export default async function AccountsPage() {
  const accounts = await listAccounts();
  if (accounts.length === 0) redirect("/sign-in");

  return (
    <AuthCard
      title={ACCOUNTS.title}
      subtitle={ACCOUNTS.subtitle}
      footer={
        <form action="/sign-out" method="POST">
          <Button type="submit" variant="secondary" size="lg" className="h-12 w-full">
            {ACCOUNTS.signOut}
          </Button>
        </form>
      }
    >
      <ul className="divide-gray-150 border-gray-150 divide-y rounded-md border">
        {accounts.map((a) => (
          <li key={a.slot} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
            <span className="text-body-m text-foreground truncate" title={a.email}>
              {a.email}
            </span>
            {a.active ? (
              <Pill tone="neutral">{ACCOUNTS.active}</Pill>
            ) : (
              <form action="/accounts/switch" method="POST">
                <input type="hidden" name="slot" value={a.slot} />
                <Button type="submit" variant="secondary" size="sm">
                  {ACCOUNTS.use}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <Link
        href="/sign-in"
        className={cn(buttonVariants({ variant: "primary", size: "lg" }), "h-12 w-full")}
      >
        {ACCOUNTS.add}
      </Link>
    </AuthCard>
  );
}
