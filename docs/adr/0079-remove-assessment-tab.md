# ADR-0079 — Remove the Assessment tab from the clerkship form

**Status:** Accepted (owner-directed, 2026-09-04). Built on `chore/remove-assessment-tab`.
**Supersedes (in part):** [ADR 0074](0074-assessment-as-diagnostic-logic.md) — Assessment as diagnostic logic; [ADR 0076](0076-diagnosis-feature-reconciliation.md) — diagnosis-driven feature reconciliation. Both remain valid as history; the surface they describe no longer exists.
**No migration.** The `synthesis.summary` / `synthesis.differential` schema fields are untouched.

## Decision

The clerkship form's fifth step, **Assessment**, is removed. `assessment-tab.tsx` is deleted and `TABS` drops from five steps to four:

`Complaint · Review of Systems · Background · Examination`

## Context

The Assessment tab was the convergence point of the clerkship: it displayed the agent's ranked differential, offered Agree/Exclude actions, held the clinician's one-liner, and was the single place a **working diagnosis** was committed to the record. Its removal was requested directly by the owner after the consequences below were laid out.

## Consequences

These are real regressions, recorded plainly so the decision can be revisited with full information.

### 1. There is no longer a commit surface for a working diagnosis

`synthesis.differential` can no longer be populated by a new encounter. Downstream:

- `encounterRecords` derives diagnoses from `c.synthesis?.differential` ([`lib/encounter/clerkship.ts`](../../lib/encounter/clerkship.ts)) — for encounters clerked after this change, that list is empty.
- The `summary` and `differential` entries in `CLERKSHIP_SECTIONS` (group `synthesis`) become **unreachable** — they can never report `filled`. This is not a new class of problem: `investigations` and `managementPlan` in the same group were already unreachable, because the agent surface never persisted the old Plan. `clerkshipStatus` feeds only a "has any content" check and gates nothing, so nothing blocks or errors.

### 2. The ranked differential is NOT lost — it is now read-only

The 17 sourced per-complaint weight files and the whole ranking engine continue to run, and the live rail (`agent-insights.tsx`) still renders the tiered differential, its "why" evidence, and the must-not-miss group. What disappears is the ability to **act** on it: no Agree/Exclude, no commit. The rail's copy was updated accordingly — it previously told the clinician to "commit on the Assessment tab", which would now be a dangling instruction.

Feature reconciliation (ADR 0076) is dormant rather than deleted: `reconcile.ts` and the NCD catalog remain, but nothing invokes them, because selecting a diagnosis was the trigger.

### 3. Existing clinical records are preserved — deliberately

`buildClerkshipInput` sends the whole clerkship payload on every save, so simply deleting the `summary` / `differential` state would have **wiped those fields from any encounter clerked before this change** on its next autosave. Clinical records are append-only, so that was not acceptable.

Both values are therefore still rehydrated from `initial.synthesis` and echoed back unchanged on save. They are no longer editable, but they are never destroyed. A pre-existing assessment stays readable in the encounter record.

## If this is reverted

The surface was deleted in one commit and depends on nothing that was removed: `_lib/ddx-grouping` survives (the rail shares it), the agent packs and reducers are untouched, and the schema never changed. Restoring the tab is re-adding the component, one `TABS` entry, one render block, and the two state setters.

## Follow-ups the owner may want

- If diagnoses should still reach the record, a commit affordance has to live somewhere — the rail, the encounter record view, or a dedicated diagnosis surface.
- If they should not, `summary` / `differential` should be removed from `CLERKSHIP_SECTIONS` so the synthesis group stops advertising sections that cannot be completed, and the `AGENT_DDX_RANKING_CSO_SIGNED` go-live decision should be re-examined — the ranking now informs but cannot be acted on.
