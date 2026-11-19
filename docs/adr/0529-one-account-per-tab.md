# ADR 0529 — One account per tab (amends ADR 0280)

- **Status:** Accepted (owner, in chat, 19 Nov 2026: "Yes, build it").
- **Date:** 19 Nov 2026
- **Relates to:** ADR 0280 (several accounts in one browser), ADR 0472 (four accounts per browser)

## Context

ADR 0280 kept every signed-in account's session in its own cookie slot, but one cookie, `ms-account`, named the account
**every** tab used. Signing in as a nurse in a second tab made the nurse the account of the first tab too. On its next
request the doctor's tab acted as the nurse: a different role was sent away from the page, which read as being signed
out, and a save from a page still showing the doctor was made as the nurse. The owner asked for a role to sign in in
another tab of the same window "without the two interfering", and for sessions to end only when the user signs out.

ADR 0280 had declined a different account per tab because every URL would need a `/u/N` prefix. About 750 links,
redirects and `router.push` calls would have to carry it, and one missed would switch a tab's account in silence.

## Decision

1. **Each tab has its own account, carried in a header, not the URL.** An inline script in the root layout's `<head>`
   (`lib/supabase/tab-account.ts`), run before any of Next's code, takes the account the page loaded with and adds
   `x-ms-account: <slot>` and `x-ms-tab: <tab id>` to every request the tab makes to this site. Next 16's router
   sends navigations, prefetches and server actions through `window.fetch` (`next/dist/client/components/segment-cache/fetch.js`), so they all carry it. Requests to other sites (Supabase) do not.
2. **The server reads the tab's account first.** `resolveSlot` (`lib/supabase/accounts.ts`) is used by the server
   client, the proxy and `listAccounts`: an account this request just switched the tab to, else `x-ms-account`, else
   `ms-account`. Authorization is unchanged: `getUser()` validates whoever acts, and a tab can only name an account
   whose session cookie this browser already holds.
3. **`ms-account` is the fallback for what cannot carry a header**: a page load, a reload, a form post, a typed
   address. The tab writes its account back to it whenever it is shown or focused, so anything started in the tab you
   are using loads as that tab's account. A new tab starts as the account of the tab used last.
4. **Switching a tab's account.** `setActiveAccount` writes `ms-account` and, when the request names its tab,
   `ms-account-tab=<tab>:<slot>` for 60 seconds. Only that tab takes it up, after the response and before its next
   request (so the MFA step after a sign-in acts as the new account), and clears it. Switch and sign-out stay plain form
   posts; the page they load starts as `ms-account`.
5. **Sign-out ends the account of the tab it is pressed in** (still `scope: "local"`). Another tab on that same account
   is sent to sign-in on its next request; tabs on other accounts carry on.
6. The browser Supabase client uses the tab's account (`window.__msTabAccount`), else `ms-account`.

## Consequences

- Two roles work side by side in one window; each tab's saves are made as the account it shows.
- A tab you are not using that loads a whole page on a timer uses `ms-account`, which may be another tab's account. The
  one such timer today, the patient idle sign-out, signs out through `fetch` (which carries the tab's account) and then
  loads the signed-out `/sign-in?idle=1`.
- If another tab takes focus while a page is still loading, the loading tab can adopt that tab's account. It needs a
  focus change mid-load; a reload of the tab puts it right.
- Four accounts per browser stays (ADR 0472).
- Not seen in a browser in this change; held by `tests/auth/tab-account.test.ts`.
