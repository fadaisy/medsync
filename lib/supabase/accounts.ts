import { env } from "@/lib/env";

/**
 * Several accounts signed in to one browser, Google-style. Each account owns
 * a numbered slot: its own Supabase auth cookie, so signing in one never
 * overwrites another. `ms-account` names the slot every tab uses right now.
 *
 * Slot 0 keeps Supabase's default cookie name, so sessions from before this
 * existed stay signed in.
 */
export const ACTIVE_ACCOUNT_COOKIE = "ms-account";
// Four, not five (ADR 0472): five sessions of cookies pass Node's 16 KB request-header limit (HTTP 431).
export const MAX_ACCOUNTS = 4;

export function authCookieName(slot: number): string {
  // Read on call, not at import: the build collects page data with no Supabase env (CI).
  const base = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  return slot === 0 ? base : `${base}-s${slot}`;
}

export function parseSlot(value: string | undefined | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < MAX_ACCOUNTS ? n : 0;
}

/** Slots that hold a session cookie (whole, or chunked as `<name>.0`). */
export function slotsInUse(cookies: { name: string; value: string }[]): number[] {
  const live = new Set(cookies.filter((c) => c.value).map((c) => c.name));
  const slots: number[] = [];
  for (let s = 0; s < MAX_ACCOUNTS; s++) {
    const name = authCookieName(s);
    if (live.has(name) || live.has(`${name}.0`)) slots.push(s);
  }
  return slots;
}

export const ACTIVE_ACCOUNT_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 400 * 24 * 60 * 60,
} as const;

/**
 * One account per tab (ADR 0529). Each tab's own requests name its account in `x-ms-account`
 * (lib/supabase/tab-account.ts); `ms-account` is only the fallback for a request that cannot carry
 * a header: a page load, a form post. `x-ms-tab` names the tab, so a request that switched account
 * (a sign-in) leaves `ms-account-tab=<tab>:<slot>` for that tab alone to take up.
 */
export const TAB_ACCOUNT_HEADER = "x-ms-account";
export const TAB_ID_HEADER = "x-ms-tab";
export const TAB_ADOPT_COOKIE = "ms-account-tab";
export const TAB_ID_PATTERN = /^[a-z0-9]{8,32}$/;

/** The slot a request acts as: an account this request just switched this tab to, else the
 *  tab's header, else the browser's `ms-account` cookie. */
export function resolveSlot(r: {
  header?: string | null;
  tab?: string | null;
  adopt?: string | null;
  cookie?: string | null;
}): number {
  if (r.tab && r.adopt) {
    const [tab, slot] = decodeURIComponent(r.adopt).split(":");
    if (tab === r.tab) return parseSlot(slot);
  }
  return parseSlot(r.header || r.cookie);
}
