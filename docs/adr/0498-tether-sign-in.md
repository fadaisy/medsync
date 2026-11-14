# ADR 0498: Sign-in and the two-step code in the Tether look

**Status:** Accepted, 14 Nov 2026. Fadhul chose "Sign in first" in chat. The page's new copy (`AUTH` in `content/tether-landing/copy.ts`) is draft.

## Context

The Tether landing page (ADR 0477) sends people to `/sign-in`, which still wears the old MedSync auth card. The canvas prototype also showed sign-up inside the same panel; that is larger work.

## Decision

- While `LANDING_TETHER` is on, `proxy.ts` rewrites `/sign-in` and `/sign-in/mfa` to `app/tether/sign-in*` (`tetherRewrite` in `lib/landing/feature.ts`). The address bar keeps `/sign-in`, so `?redirect=`, `?signed-up=`, the light-only theme and every redirect still work. `/tether/sign-in*` 308s to the public address.
- The forms are the same components with a `look` prop: same server actions, same role landing (`resolveLanding`), same focus and offline handling. Only the drawing changes.
- Two columns: sign-in on the left, "New to Tether?" on the right with the four ways to join from `GET_STARTED`, each linking to today's sign-up form.
- No theme toggle on these pages (light-only, as ADR 0099 kept).

## Consequences

- Off in production until the copy is signed. Flag off, `/sign-in` is unchanged.
- The tiles reuse `GET_STARTED` word for word, so two lines still say "MedSync" until that copy is changed.
- Sign-up inside the panel, and each role's workspace in the Tether look, are later PRs.
