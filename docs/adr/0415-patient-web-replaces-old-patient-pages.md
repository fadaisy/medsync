# ADR 0415 — The patient web replaces the old patient pages, at parity with the phone

**Status:** Accepted — 2026-10-25 (GATE A, docs/patient-web/gate-a-proposal.md; signed by Fadhul, CSO, in chat: "do what's recommended"). Supersedes Step 9 (`patient-web`) of PROMPT-TIDE-WEB-MIGRATION.md.

## Decision

- The patient web is rebuilt in MedSync Tide to do what the patient phone (Tide v1, ADRs 0340–0342, 0356–0358, 0402–0414) does, adapted to the browser (ADR 0417), and the old patient pages are deleted once nothing is lost.
- New pages live in `app/pw/` and serve at the old URLs (`/patient`, `/emergency`, `/sign-in`, `/signup/patient`) through a `proxy.ts` rewrite while `PATIENT_WEB_TIDE=1` (D-PW-10). Off, `/pw` is a 404 and the old pages serve.
- The cutover is global after a five-day pilot. Step 9 deletes the old pages, their components and the flag, moves `app/pw/` to its real URLs and keeps a 308 for every moved URL. There is no toggle back.
- The slice adds no clinical rule, table, RLS policy or write path: every read and write is the phone's (gate-a-proposal §4).

## Consequences

Two pages are briefly reachable at two URLs (`/patient/x` and `/pw/patient/x`) while the flag is on; `/pw` is behind the same sign-in.
