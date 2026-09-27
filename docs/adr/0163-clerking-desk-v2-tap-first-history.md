# ADR 0163 — Clerking desk v2: a sectioned, tap-first history, with the prototype as design authority

**Status:** Accepted — 2026-09-27. GATE A signed by the owner and CSO (D-CV-01, D-CV-02, D-CV-07, D-CV-08, D-CV-09, D-CV-10, D-CV-11, D-CV-12, D-CV-14). Builds on ADRs 0130–0139 (the EMR) and 0161 (centred pop-ups).

## Context

The EMR's clerking page (ADR 0134) stored the right facts but was slow and shallow to use, as production showed on 27 Sep 2026 (PROMPT-CLERKING-DESK-V2 §3):

- **C1:** symptoms had no properties;
- **C2:** the review of systems was 81 chips all reading "Not asked", with menstrual questions shown to a man;
- **C3:** a complaint did not reach the review of systems;
- **C4:** the page ran about four screens long;
- **C5:** the history was mostly typed;
- **C6:** a temperature of 32.5 °C sat unmarked.

## Decision

1. **Replace the history half of the desk** (Complaint, History, Systems, Past history, Family, Social) with a sectioned, tap-first design:
   - a section bar and one section on screen at a time;
   - properties for every complaint and for every positive system symptom (in a centred pop-up);
   - medicines and allergies inside Past history;
   - a Flags panel;
   - a note that writes itself.

   Examination, Summary, Impression and Plan keep their v1 bodies inside the new shell.

2. **Design authority:** the approved prototype (`docs/emr/clerking-v2/prototype/`) and its screenshots set layout and interaction; the catalogue (ADR 0164) sets content; the repo wins on mechanics.
3. **Built on today's tokens** (D-CV-11). Chroma (ADR 0162) ships as its own release and restyles this desk by a token swap.
4. **Behind `CLERKING_V2`,** per hospital, only where `EMR_V1` is on. Off, the v1 desk is unchanged.
5. **v1 drafts coexist:** they open as before, with "Continue in the new format" (ADR 0167).

## Consequences

- There is a new template, `tpl.clerking.adult_v2`, in its own signed file, so the v1 template catalogue is untouched.
- Migration 0076 (GATED) must run before the flag goes on.
- The emergency form (`tpl.clerking.emergency`) is unchanged, and the form switch pairs it with v2.
