# ADR 0509: On the Tether domain, nurses and doctors land on the clinic floor

**Status:** Accepted, 15 Nov 2026. Fadhul reported in chat that signing in as a nurse on Tether opened MedSync's sign-in page.

## Context

ADR 0499 closes the clinical workspaces on the Tether domain and sends them to MedSync's address. A nurse's home is `/nurse` and a doctor's `/doctor`, so signing in on Tether sent them there, where they are not signed in. The clinic floor (`/clinic`, ADRs 0491–0497) is the booking-side surface for both and is open on Tether.

## Decision

- On the domains in `TETHER_HOSTS`, `/nurse` goes to `/clinic`, `/nurse/triage` to `/clinic?view=triage` and `/doctor` to `/clinic?view=line` (`tetherHome` in `lib/landing/feature.ts`, applied in `proxy.ts`).
- On those domains `/clinic` and its waiting-room screen are on for every hospital, whatever `CLINIC_FLOOR` says and whatever the floor copy's status. On MedSync's domain `CLINIC_FLOOR` still decides.

## Consequences

- The floor needs migration 0295, which is applied.
- The floor's draft copy shows on Tether in production; Fadhul's request is the sign-off for that domain, as in ADR 0500.
- The floor's open items (REPORT.md: SpO₂ scale 2 and pregnancy not asked, follow-up booking not linked) apply on Tether from now.
