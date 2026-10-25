# ADR 0417 — Web adaptations of the phone's patterns

**Status:** Accepted — 2026-10-25 (GATE A, docs/patient-web/gate-a-proposal.md; signed by Fadhul, CSO, in chat: "do what's recommended").

## Decision

As PROMPT-PATIENT-WEB-TIDE §3. Bottom sheets become centred landscape dialogs (ADR 0161, W1). No haptics except one `navigator.vibrate` on the danger interrupt. Steps show only what the phone synced ("From your phone"). Photos use `<input type="file" accept="image/*" capture="environment">` and the phone's `/api/mobile/*` routes; barcodes are typed. Voice notes use `MediaRecorder`; "Say it" for readings stays off. Live location uses `watchPosition` while the page is open, at most every 20 s. Text follows the browser's size to 200 %. No splash.

Two departures from the reference, for parity: lab results keep their values behind `PATIENT_RESULTS` (Lab Phase 5), and doctor ratings show only behind a facility switch (D-PW-08).
