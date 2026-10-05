# ADR 0206 — Restricted classes show neutral text

**Status:** Accepted for the shadow build — 2026-10-05 (GATE A: D-DM-30, N9; fifth review K17).

## Context

Some facts the diabetes pack reads are sensitive: HIV and its treatment, TB, mental health, and sexual and
reproductive health ("could become pregnant", previous gestational diabetes). A rule that reads one can say
what it read in its own words, on a screen a relative, a minor or a non-clinical user can see.

## Decision

1. **Features carry a restricted class** (`hiv`, `tb`, `mental_health`, `sexual_reproductive_health`), and
   every item that reads one lists the class (`restrictedClasses`). The evaluator reports the classes a
   result touched.
2. **A surface without the class shows only the neutral text** (`neutralDisplay`, `neutralAction`,
   `neutralAlternative`, `neutralProposal`) and nothing else from that item. Neutral text must not contain a
   restricted word; the build fails if it does (N9).
3. **Current pregnancy is not restricted** (D-DM-30): medicine safety checks must read it everywhere.
4. **No catalog string is patient-facing.** The new concepts follow the same line in the fact contract:
   `hist.prior_gdm` is restricted, and the restricted-for-minors list covers the new terms (0092).

## Consequences

- One rule serves every surface; the surface, not the rule, decides what it may show.
- The pack's content test counts items reading a restricted fact with no neutral text, and leaks: both 0.
