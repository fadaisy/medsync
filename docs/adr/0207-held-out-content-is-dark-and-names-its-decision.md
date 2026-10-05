# ADR 0207 — Held-out content is dark and names the decision that switches it on

**Status:** Accepted for the shadow build — 2026-10-05 (GATE A; N11, J16).

## Context

The pack holds content that is written and sourced but not yet agreed: ADA's "test everyone from 35",
universal pregnancy testing, treatment prompts before the CSO read them against UCG 2023. Deleting it loses
the work; shipping it on puts unsigned advice in front of a clinician.

## Decision

1. **Dark, not deleted.** An item with `enabled: false` is evaluated and reported as dark, and appears
   nowhere else: not in fired items, urgency, gaps, cautions or the pregnancy-withheld list.
2. **Every dark item names its decision** (`enabledBy`, e.g. `D-DM-05`). An item dark with no decision fails
   the build (N11).
3. **Signing is a data change.** `k_signed.py` applies GATE A: each item it switches on or changes carries
   `x.signed` with the decision and date. At GATE A, D-DM-20 and D-DM-38 went on (review prompts, no dose),
   SGLT2/GLP-1 prompts went on at referral sites only (D-DM-21); D-DM-05 and D-DM-12 stay off.
4. **No dose, anywhere.** Treatment content is a review prompt; the dose check fails the build on any string
   that looks like one (N5). Formulary additions carry `dose.status: "to-verify"`.

## Consequences

- The CSO can see exactly what is held and why, and switch it on without a code change.
- The shadow report counts dark items separately (2 at 0.4.0-draft), so a dark item is never mistaken for
  one that never fires.
