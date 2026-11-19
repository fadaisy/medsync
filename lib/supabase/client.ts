import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import { ACTIVE_ACCOUNT_COOKIE, authCookieName, parseSlot } from "@/lib/supabase/accounts";
import { TAB_ACCOUNT_GLOBAL } from "@/lib/supabase/tab-account";

function open(name: string) {
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: { name },
    isSingleton: false,
  });
}

let cached: { name: string; client: ReturnType<typeof open> } | null = null;

/**
 * Supabase client for use inside Client Components (`"use client"` files).
 *
 * Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — both
 * are public; RLS is the gate, never the anon key.
 *
 * One client per account: this tab's (ADR 0529, lib/supabase/tab-account.ts),
 * else the browser's `ms-account`; when it changes, the next call gets a
 * client on that account's cookie.
 */
export function createClient() {
  if (typeof document === "undefined") {
    return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  const tab = (window as unknown as Record<string, (() => string) | undefined>)[TAB_ACCOUNT_GLOBAL];
  const active = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_ACCOUNT_COOKIE}=([^;]*)`));
  const name = authCookieName(parseSlot(tab?.() ?? active?.[1]));
  if (cached?.name !== name) {
    cached = { name, client: open(name) };
  }
  return cached.client;
}
