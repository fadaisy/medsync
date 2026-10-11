# ADR 0280 — Several accounts signed in to one browser

**Status:** Accepted — 2026-10-11 (owner).

## Context

The Supabase session lived in one cookie (`sb-<ref>-auth-token`) shared by every tab. Signing in as a second account
overwrote it and signed the first one out. The owner wants to stay signed in to several accounts in one browser and
switch between them, Google-style. A different account per tab at the same time was considered and declined: every URL
would need a `/u/N` prefix carried through every link and redirect.

## Decision

1. Each signed-in account owns a numbered slot (0–4) with its own auth cookie. Slot 0 keeps the default cookie name, so
   sessions from before this stay signed in. `ms-account` names the active slot; every tab uses it
   (`lib/supabase/accounts.ts`).
2. The server, proxy and browser Supabase clients read the active slot's cookie. Authorization is unchanged:
   `getUser()` validates whoever acts.
3. Sign-in reuses the slot already holding that email, else the first free one, else replaces the active one; the
   signed-in account becomes active.
4. `/accounts` lists the signed-in accounts (labels from `getSession()`, never used to authorize), switches with a form
   POST to `/accounts/switch` (validated with `getUser()`, then the usual role landing), and adds another account via
   `/sign-in`. Every workspace header links to it as "Switch account".
5. `POST /sign-out` signs out the active account only (still `scope: "local"`); if another remains it becomes active and
   the user lands on `/accounts`, otherwise `/sign-in`.

## Consequences

- On a shared ward computer, "Sign out" leaves the other accounts signed in. A "sign out of all accounts" control is not
  built; add one if that proves a risk.
- Five accounts at most; a sixth sign-in replaces the active one.
- A tab left open shows the account it loaded with until it navigates; switching affects every tab from then on.
