# ADR 0510: On the Tether domain, sign-up looks like Tether and stays there

**Status:** Accepted, 15 Nov 2026. Fadhul reported in chat that the sign-up pages had the same problem as sign-in, and chose "Both": keep sign-up on Tether, and draw it in the Tether look.

## Context

ADR 0499 serves the hospital app on Tether's own domain. Sign-in got the Tether look (ADR 0498), but the four sign-up forms, `/get-started` and the "awaiting approval" pages still drew MedSync's header, wordmark and Chroma colours, and their tab titles said MedSync. Every step already stayed on the address the person started from: no link or redirect in sign-up leaves it.

## Decision

On the domains in `TETHER_HOSTS`:

- `/signup/clinical`, `/signup/non-clinical` and `/signup/hospital` sit in Tether's bar (wordmark, Help as the emergency link) with a link back to the four ways to join, and `data-ds="tide"` redraws the forms in Tide (`TetherFlow`, `components/landing/tether/flow.tsx`). The forms and their actions are unchanged.
- The patient form (`/signup/patient`, the Tide patient web) keeps its own Cancel and Help; only its title changes.
- `/get-started` goes to `/sign-in`, where the four ways to join already sit beside the form (`tetherHome`).
- `/onboarding/*` (awaiting approval) is Tide whatever `TIDE_SURFACES` says, and its header says Tether.
- Tab titles end in "· Tether" (`tetherTitles`, `lib/landing/tether-host.ts`). The sign-up page titles lose their own "· MedSync", which the root layout's template already adds on MedSync's domain.

## Consequences

- The body copy is unchanged and still names MedSync in places ("Join your hospital on MedSync", the data-processing notice). Changing it per domain is a copy decision for Fadhul.
- MedSync's domain is unchanged.
