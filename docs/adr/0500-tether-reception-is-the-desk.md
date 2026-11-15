# ADR 0500: On the Tether domain, reception is the desk

**Status:** Accepted, 15 Nov 2026. Fadhul asked in chat that a receptionist signing in on Tether sees the booking desk (ADR 0485).

## Decision

- On the domains in `TETHER_HOSTS` (ADR 0499), `/reception` is the reception desk for every hospital, whatever `RECEPTION_DESK` says and whatever the desk copy's status. On MedSync's domain `RECEPTION_DESK` still decides, as before.

## Consequences

- The desk needs migration 0294 and its five functions (ADR 0485). They must be applied and deployed before this reaches the Tether domain, or reception there fails.
- The desk's draft copy shows on Tether in production. Fadhul's request is the sign-off for that domain.
