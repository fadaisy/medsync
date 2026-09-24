# ADR 0102 — Resus Desk v2: the calm cockpit (focus UI and progressive disclosure)

**Status:** Accepted — 2026-09-24 (GATE A signed 2026-09-23, owner instruction "go through all gates")
**Context:** The v1 desk (ADRs 0044–0058) put every finding of a step on screen at once — 38 chips in A, 50 in B,
58 in C, 47 in D, 28 in E (STOP 0 baseline) — repeated context toggles in every step, gave each action five
equal-weight buttons, and said the same message in several places. Under resuscitation pressure the loudest thing
on screen must be what is killing the patient now; everything else must wait one tap away.

## Decision

1. **One page that recomposes itself by mode** — Survey → Arrest → Post-ROSC → Boarding → Closed (read-only) —
   client-side, no route change (`app/nurse/resus/[episodeId]/_components/v2/`, shared by the doctor route).
2. **Overall picture first, detail on demand.** Each step shows its existing state codes as an "Overall picture"
   row, ≤ 8 key signs, ≤ 4 context-promoted signs (D ≤ 2), read-only "From vitals" chips, then a collapsed "More
   signs" accordion by group and a synonym-aware search. The tiering is signed presentation metadata
   (`lib/resus/reference/presentation.ts`); the signed catalogs and engines are byte-identical.
3. **Budgets:** ≤ 12 finding chips and ≤ 22 interactive elements in a step's findings area on load (at maximum
   promotion); ≤ 3 controls per action row (Done, Start where the action has a duration, ⋯ for Failed / Defer / Not
   indicated). A test counts them.
4. **A cross-step Do now queue** (top 3 + "N more") built on the existing urgency ordering, plus system prompts
   (assess a vitals-threatened step, engine-triggered returns, stale vitals, core temperature, glucose, allergies).
5. **Say it once.** Duplicate banners are removed; CSO-signed always-visible items (E's checklist, D's pinned
   "check glucose") stay.
6. **Colour stays a safety property** (ADR 0049 stands): red only for the arrest state / ⚠ Arrest control, an
   active-threat step, a failed action, critical vitals, the RESUS tag, the board's arrest dot and the Emergency
   affordance (outline). Due / overdue / stale / offline are amber (the "Re-check vitals" nudge moved from red to
   amber, E7). No emoji; type-scale utilities only.
7. **The floating Emergency button moves into the header** as a red-outline labelled button (same function, never
   overlapping desk controls).

## Consequences

**Positive:** the clinician sees the threat and the next action first; finding capture is one or two taps for any
key sign and one search for the rest; A–E read identically. **Negative:** signs outside the key set take an extra
tap (mitigated by search + context promotion); the tiering is a clinical-presentation judgement the CSO signs and
must revisit as the catalogs change.

## Related

`docs/resus-v2-gate-a-proposal.md` §2–§3, `docs/resus-v2/UI-BUILD-SPEC.md`, ADR 0049 (state colour system), ADR 0057
(urgency ordering), ADR 0103 (inputs), ADR 0109 (sync).
