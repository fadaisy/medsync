# ADR 0419 — Shared devices: no PHI in browser storage without the own-device choice

**Status:** Accepted — 2026-10-25 (GATE A, docs/patient-web/gate-a-proposal.md; signed by Fadhul, CSO, in chat: "do what's recommended").

## Decision

- Sign-in asks once, "Is this your own device?", default No (D-PW-05).
- No: nothing is written to localStorage, sessionStorage, IndexedDB or Cache Storage; no offline; idle sign-out after 15 minutes (D-PW-06).
- Yes: a small service worker caches Help, the emergency sheet, the latest ticket and the health card; health logs queue in IndexedDB with the phone's idempotency keys; 7 days idle, with the password again for history edits.
- Sign-out clears everything the app stored, in both modes. No PHI in URLs, logs, analytics or screenshot fixtures (W4).
- Browser storage is touched only through one device module; a guard scan fails any other use on patient routes.
