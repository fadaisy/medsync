# ADR 0315 — The exchange module: append-only store, store before acknowledge, outbox, de-duplication

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

Partners and bridges retry; networks drop; a message acknowledged and then lost is a result lost.

## Decision

1. Every message in or out lives in `exchange_messages` (payload encrypted), committed by `private.exchange_store_inbound` **before** the 202; the acknowledgement means "held", not "filed". Processing runs after the response and a sweep picks up anything left at `received`.
2. Duplicates (same external id, or same content hash) are recorded as `duplicate` events and never processed twice.
3. The outbox claims rows with a conditional update, backs off with jitter, and ends in dead letters that a person retries or sets aside with a reason. Nothing is purged.
4. Filing is idempotent: one match item per (message, component). The module is generic (`lib/exchange/**`); connections are adapters.

## Consequences

Pharmacy, radiology and a national HIE can reuse the store. The worker is scheduled by `private.schedule_exchange_outbox` (0106's pattern).
