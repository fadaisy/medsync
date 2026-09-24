# ADR 0106 — Resus Desk v2: termination of resuscitation and confirmation of death

**Status:** Accepted — 2026-09-24 (CSO decisions D1, D9, D10, D11 at GATE A; AoMRC 2025 re-verified)
**Context:** v1 had no way to stop a resuscitation or record a death; episodes ran on for months (the live header read
112 days, P1) and outcomes were never recorded.

## Decision

1. **A termination review, never a directive.** The review shows the facts (arrest / CPR / persistent-asystole
   durations, shocks, adrenaline doses, airway and capnography, last three ETCO₂ values — "strong marker, never
   alone"), reversible causes not yet excluded (listed first, amber), continue-flags (hypothermia — rewarm before
   deciding; toxins / LAST; PE after thrombolysis; persistent or recurrent shockable rhythm; intermittent ROSC; rising
   ETCO₂; pregnancy with hysterotomy pending; a cause being treated) and an informational criterion chip: ERC 2025 —
   may be considered after 20 min of persistent asystole with no reversible cause; RCUK 2025's 45 min in detail
   (D1). TOR rules are not used for in-hospital arrest.
2. **Team pause and reasons are recorded** (team asked / objection, senior consulted, family present / informed / not
   reachable, structured reasons); any cadre may record the stop, doctor / clinical officer recommended, with a senior
   co-sign pending otherwise (D9). A treatment-limitation decision is recorded by a doctor / CO with its rationale and
   family involvement (D11). CPR-not-attempted is a secondary path with a mandatory reason.
3. **Confirmation of death follows AoMRC 2025:** a 5-minute observation from CPR stopped (onset of mechanical
   asystole; disconnect a ventilator first) of unconsciousness, apnoea and absent circulation, restarting after any
   return of function ("Signs of life — resume"); then absent pupillary and motor responses (corneal reflexes soon
   after an arrest); time of death = when the clinician is satisfied; the family is told the time may differ. The
   confirm button waits for a complete, unbroken observation — a data-validity rule, not a block on care.
4. **Who may confirm, certification and reportable deaths in Uganda** are legal questions (D10): the desk records the
   facts and presents configurable tasks. **After-death tasks** and the **debrief** are separate records, editable up
   to 24 h after close (D16).

## Consequences

**Positive:** the end of an unsuccessful resuscitation is planned, team-based and fully documented; deaths are
confirmed to a recognised standard. **Negative:** the Ugandan legal layer is a placeholder until legal review; the
ERC 2025 publisher text was verified via its accepted author version only.

## Related

`docs/clinical/resus-als-clinical-catalog.md` §9–§10, `lib/resus/als/termination.ts`,
`lib/resus/death/confirmation.ts`, ADR 0107.
