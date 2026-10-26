# ADR 0421 — SOS on devices that cannot dial

**Status:** Accepted — 2026-10-25 (GATE A, docs/patient-web/gate-a-proposal.md; signed by Fadhul, CSO, in chat: "do what's recommended").

## Decision

On a phone browser, SOS behaves as on the phone: a 3-second countdown with "Cancel, I'm okay", then `tel:`. On a computer the same countdown runs, then the page shows the number large with "Your computer cannot place the call. Dial {number} on any phone now." (D-PW-03). The number comes from data (W5). Nothing is dialled or sent during the countdown. The CSO signs the wording (`content/patient/web.ts`, draft).
