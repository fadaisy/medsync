import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import { ACTIVE_ACCOUNT_COOKIE, authCookieName, parseSlot } from "@/lib/supabase/accounts";

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
 * One client per active account (lib/supabase/accounts.ts): when the browser
 * switches account, the next call gets a client on that account's cookie.
 */
export function createClient() {
  if (typeof document === "undefined") {
    return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  const active = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_ACCOUNT_COOKIE}=([^;]*)`));
  const name = authCookieName(parseSlot(active?.[1]));
  if (cached?.name !== name) {
    cached = { name, client: open(name) };
  }
  return cached.client;
}
