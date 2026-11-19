import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import {
  ACTIVE_ACCOUNT_COOKIE,
  ACTIVE_ACCOUNT_COOKIE_OPTIONS,
  authCookieName,
  MAX_ACCOUNTS,
  resolveSlot,
  slotsInUse,
  TAB_ACCOUNT_HEADER,
  TAB_ADOPT_COOKIE,
  TAB_ID_HEADER,
  TAB_ID_PATTERN,
} from "@/lib/supabase/accounts";

/** The slot this request acts as: its tab's account (ADR 0529), else the browser's `ms-account`. */
async function currentSlot(): Promise<number> {
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);
  return resolveSlot({
    header: h.get(TAB_ACCOUNT_HEADER),
    tab: h.get(TAB_ID_HEADER),
    adopt: cookieStore.get(TAB_ADOPT_COOKIE)?.value,
    cookie: cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value,
  });
}

/**
 * Supabase client for use inside Server Components, Route Handlers, and
 * Server Actions. Threads cookies through `next/headers` so the auth
 * session round-trips between server and browser.
 *
 * Next.js 16: `cookies()` is async — always `await createClient()`.
 *
 * IMPORTANT: Always call `await supabase.auth.getUser()` to validate the JWT.
 * `getSession()` returns the cookie without verifying the token signature, so
 * it must NOT be used for authorization decisions in Server Components, route
 * handlers, or middleware/proxy. (Supabase guidance, mandatory for MedSync.)
 *
 * Talks as this tab's account (lib/supabase/accounts.ts) unless a
 * `slot` is given — only sign-in, sign-out and the account switcher pass one.
 */
export async function createClient(slot?: number) {
  const cookieStore = await cookies();
  const name = authCookieName(slot ?? (await currentSlot()));

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: { name },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component, which
          // cannot mutate cookies. Safe to ignore as long as middleware/proxy
          // is refreshing the session on every request.
        }
      },
    },
  });
}

export type SignedInAccount = { slot: number; email: string; active: boolean };

/**
 * Every account signed in to this browser. Reads each slot's cookie with
 * `getSession()`, so it is for LABELS and slot choice only — never authorize
 * on it; whoever acts is validated by `getUser()` as usual.
 */
export async function listAccounts(): Promise<SignedInAccount[]> {
  const cookieStore = await cookies();
  const active = await currentSlot();
  const accounts: SignedInAccount[] = [];
  for (const slot of slotsInUse(cookieStore.getAll())) {
    const { data } = await (await createClient(slot)).auth.getSession();
    const email = data.session?.user.email;
    if (email) accounts.push({ slot, email, active: slot === active });
  }
  return accounts;
}

/**
 * The slot a sign-in as `email` should use: the one already holding that
 * account, else the first free one, else (all full) the active one.
 */
export async function slotForSignIn(email: string): Promise<number> {
  const accounts = await listAccounts();
  const same = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (same) return same.slot;
  const used = new Set(accounts.map((a) => a.slot));
  for (let s = 0; s < MAX_ACCOUNTS; s++) if (!used.has(s)) return s;
  return currentSlot();
}

/**
 * Make `slot` this tab's account, and the one a new tab or page load starts with. A request from
 * the tab's script names the tab; it alone takes the slot up, before its next request (ADR 0529).
 */
export async function setActiveAccount(slot: number): Promise<void> {
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);
  cookieStore.set(ACTIVE_ACCOUNT_COOKIE, String(slot), ACTIVE_ACCOUNT_COOKIE_OPTIONS);
  const tab = h.get(TAB_ID_HEADER);
  if (tab && TAB_ID_PATTERN.test(tab))
    cookieStore.set(TAB_ADOPT_COOKIE, `${tab}:${slot}`, {
      ...ACTIVE_ACCOUNT_COOKIE_OPTIONS,
      maxAge: 60,
    });
}
