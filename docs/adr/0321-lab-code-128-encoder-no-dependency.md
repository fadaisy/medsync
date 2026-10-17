# ADR 0321 — A Code 128 encoder in the repo, with no dependency

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

Manifests need a scannable number; no barcode library is installed and adding one needs a stop.

## Decision

1. `lib/lab/code128.ts`: a pure Code 128 encoder (fixed table, check character) rendering SVG bars, with tests (the check value for a known string is computed by hand).
2. Lab numbers keep their `L` and eight digits format; labels may use the encoder later.

## Consequences

It must be proven on the site's scanners before go-live (an owner action).
