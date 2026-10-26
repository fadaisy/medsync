# ADR 0425 — Urgent arrivals are always triaged; one live ticket per day is held by the database

- Status: accepted (owner and CSO, 26 Oct 2026)
- Amends: ADR 0101 (arrival routing)

## Context

ADR 0101 let the desk send an arrival straight to the clinic unless its entry type was an emergency. A fresh review
of the routing code (26 Oct 2026) found two gaps:

1. An urgent arrival that is not an emergency entry type could skip triage: a "coming today" ticket from an E-tier
   symptom report whose patient declined the emergency sheet (`walk_in`, `priority_hint = 'urgent'`), and an urgent
   booking (`appointments.priority = 'urgent'`).
2. "One live ticket per patient per hospital day" was a read-then-insert in `ha-register-intake` and
   `pt-declare-intake`, so a desk registration racing the patient's own declaration made two tickets and two queue
   rows.

## Decision

1. `effectiveRoute` forces triage for an emergency entry **or anything urgent**. At check-in, an urgent booking is
   triaged and its intake carries `priority_hint = 'urgent'`; a declared ticket marked urgent is triaged.
2. Migration **0213** adds the partial unique index `patient_intakes_one_live_per_day` on
   `(hospital_id, patient_user_id, Kampala date of arrived_at)` over live, non-urgent, non-booked tickets from
   2026-11-01. Both writers turn its 23505 into the 409 they already return. It never blocks anything urgent, so an
   emergency is still captured first and reconciled after.

## Consequences

- A few more patients go through triage. That is the safe direction, and it affects only urgent ones.
- 0213 is GATED: the owner applies it with `npm run db:migrate` from the folder holding this branch, then deploys
  `ha-check-in-patient`, `ha-register-intake`, `ha-pre-arrival-arrived` and `pt-declare-intake` (they share
  `_shared/intake.ts` and `_shared/queue.ts`). Rows before 2026-11-01 are outside the index, so existing days cannot
  fail the build.
