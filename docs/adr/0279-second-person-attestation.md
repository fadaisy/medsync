# ADR 0279 — Second-person attestation for witnesses and signers

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), D-PH1-42, PA2-6, CD-2, CD-3.

## Decision

1. A witness proves who they are by typing their own password and authenticator code on the supplier's screen; the
   server checks them on a throwaway Supabase client that never touches the active session's cookies.
2. Every attempt is a row in `pharmacy_attestations` (who for whom, the action, the method, the outcome), never a secret.
   A witness is never the actor (CHECK), and a controlled entry accepts only a passed attestation for that actor, at that
   hospital, under 30 minutes old (migration 0127).
3. Five failures per witness account per hour lock that account's attestations.
4. A signer's fresh second factor is a new authenticator code on their own session.

## Consequences

- A typed witness name, as on the resus desk, is not accepted for a controlled supply.

## Alternatives considered

- The witness confirms from their own device: possible later; at the cupboard both people are at one screen.
