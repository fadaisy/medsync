# ADR 0512: On the Tether domain, hospital admins land on Clinics & schedule

**Status:** Accepted, 15 Nov 2026. Fadhul reported in chat that signing in as an admin on Tether opened the old MedSync dashboard, and asked for this.

## Context

ADR 0509 gave nurses and doctors a Tether home. `/hospital-admin` is open on Tether (ADR 0499) but had no home, so an admin signing in there landed on MedSync's hospital-admin dashboard. Clinics & schedule (`/hospital-admin/clinics`, ADRs 0501–0508) is the booking-side admin surface.

## Decision

- On the domains in `TETHER_HOSTS`, `/hospital-admin` goes to `/hospital-admin/clinics` (`tetherHome` in `lib/landing/feature.ts`, applied in `proxy.ts`).
- Every other `/hospital-admin/*` page still opens on Tether unchanged. On MedSync's domain nothing changes.

## Consequences

- An admin on Tether reaches the old dashboard only by a deep link to one of its sub-pages.
- Production shows this only once the owner deploys a build that holds the cut-over (ADR 0508).
