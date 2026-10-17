# ADR 0317 — The analyser bridge: reuse the OpenELIS bridge with a MedSync companion, pending the maker's document

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

Analysers speak ASTM or HL7 over serial or TCP on the lab LAN; MedSync runs in the cloud.

## Decision

1. D-LAB4-14 (B1–B5): adopt the OpenELIS Analyzer Bridge (MPL-2.0) unmodified, with a small MedSync companion on the same PC that holds the device key, takes 5-minute tokens and forwards to `/api/exchange/inbound`. Outbound only; store before ACK.
2. Driver profiles and code maps come only from the maker's interface document. Live follows a shadow run with zero unexplained differences, signed by the laboratory lead.
3. **Today no maker's document is in hand**, so no bridge code, profile or map exists (`docs/lab/phase-4/analyser-gap.md`).

## Consequences

The server side the companion would call exists and is tested. Analysers reads "Waiting for {model}'s interface document".
