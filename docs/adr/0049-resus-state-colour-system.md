# ADR 0049 — Resus surface state colour system (visual layer)

**Status:** Accepted — visual/UX rework (no clinical-behaviour change)
**Context:** The resus surface worked but read as flat outlined badges — the ABCDE step pills looked near-identical and the action-state controls were uniform grey pills, so under pressure a clinician couldn't tell **at a glance** which letter is the live threat or what state an action is in. In a resus that glance-legibility _is_ safety. This rework makes state visible without reading text, while staying within MedSync's Attio discipline. Done **before** the Breathing step so B/C/D/E inherit the look.

## Decision

A **semantic state colour system** — colour _means_ state — documented in [`DESIGN-medsync.md`](../DESIGN-medsync.md) ("Resus state colour system") and applied across the surface. Governing rule: **alarm scarcity** — red (`rose`) only for a genuine life threat (active-threat step) or a **failed** action; everything else uses the calm ramp (teal = good/done, amber = open/recommended, grey = pending/parked). **Never colour alone** — every state also carries a word + (for actions) a Lucide icon, with WCAG 2.2 AA contrast in light/dark and a greyscale-legible fallback. **No left-edge accent bars** (standing project rule) — state is conveyed by full border + tinted fill + ring + a coloured chip/token + icon + word.

1. **ABCDE step bar** (`resus-desk.tsx`): each step is a state-styled card — `pending` grey · `clear` teal · `addressed` deep-teal · `threatened` amber · `active_threat` red-filled — with a coloured letter chip + the state word. The visual state is **derived from the existing engine** (`stepStatus`) by a UI-only `stepVisual()` helper: `open` is amber `threatened` and only escalates to red `active_threat` on a genuine life-threat-now (for A, read from `classifyAirway` → complete/apnoea, or a detected arrest). The **current/focused** step gets a brand **teal focus ring** (distinct from state); the recommended-next step a subtle teal dashed outline. Active-threat is calm-but-unmissable (filled + ring, no flashing; reduced-motion-safe). `aria-current="step"` on the focused letter.
2. **Action-state tokens** (`airway-panel.tsx`): the six states get distinct identities — `indicated` amber · `in_progress` blue (motion-safe pulse) · `performed` teal · `failed` red · `deferred` grey · `not_indicated` outline — each as icon + word. The **current** state is a filled coloured token; the others are quieter settable controls (the active control highlighted in its colour). The card carries a subtle full-card state tint (amber for an indicated/recommended action, rose for failed/emergency). A `failed` action surfaces its next-tier escalation inline (logic unchanged — now visible).
3. **Consistency:** the immutable record (timeline) tints each entry subtly by state (`failed`→faint rose, `performed`→faint teal, danger→faint rose) so it's scannable by state. Findings stay **calmer than actions** — a selected finding uses the brand teal selected-state; urgency is carried by the airway-STATE indicator, not the individual chips.

## What did NOT change

The findings→action **engine**, the **action-state model + vocabulary**, the escalation logic, the immutable record/timeline, team mobilisation, the ABCDE discipline, scoping, and audit are all **unchanged** — `git diff main` touches only `DESIGN-medsync.md` and the two resus UI components. The step-bar's amber/red split is a pure UI derivation over existing engine output; no new engine state was added.

## Consequences

**Positive:** the bar reads as a triage+progress strip (which letter is killing the patient _now_ is the loudest thing on screen); action state is obvious without reading; the documented tokens keep B/C/D/E (and arguably triage acuity) consistent; alarm scarcity keeps red meaningful. **Negative:** more colour to maintain (centralised in the token maps + DESIGN doc); the active-threat derivation is currently airway-aware only (B–E light up red once their engines land — same pattern).

## Related

- `DESIGN-medsync.md` (token spec), `app/nurse/resus/[episodeId]/_components/resus-desk.tsx`, `app/nurse/resus/[episodeId]/_components/airway-panel.tsx`
- ADRs 0044–0048 (the resus surface + airway step this restyles)
