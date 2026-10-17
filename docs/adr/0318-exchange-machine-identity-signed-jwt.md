# ADR 0318 — Machine identities authenticate with a signed JWT

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

Vercel terminates TLS and documents no client-certificate verification (checked 17 Oct 2026), so mutual TLS to the app would need a proxy.

## Decision

1. Every machine (bridge or partner) uses SMART Backend Services: a per-sender key pair (we hold only the public key), an ES384 or RS384 client assertion of at most 5 minutes with a single-use `jti`, and an opaque 300-second token whose SHA-256 alone is stored. `system/` scopes only; no refresh tokens; the sender is re-read on every call, so revocation is immediate.
2. Pairing: a one-time 100-bit code (hash only, 30 minutes, locks after 10 failures, constant-time compare), made and enabled with a fresh second factor; the lead types the key fingerprint the machine shows (B3). A partner also needs its signed legal record (PT-4).
3. No dependency: verification on `node:crypto`. The new cron route compares `CRON_SECRET` in constant time.

## Consequences

GATE S (`docs/lab/phase-4/gate-s.md`) records what is tested and what waits for a bridge host or a partner endpoint. A per-address rate limit is an owner item (Vercel Firewall).
