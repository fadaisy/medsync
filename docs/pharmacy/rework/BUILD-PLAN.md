# Rework kit 5: build plan (3 Nov 2026)

Run order from the kit README. Each brief is its own branch, stacked on the one before (each reuses the last).

| #   | Brief                                                          | Branch                              | Base                     | Migration |
| --- | -------------------------------------------------------------- | ----------------------------------- | ------------------------ | --------- |
| 0   | MEDICINES-TAB deltas (no intro line; Add button right-aligned) | feat/pharmacy-roster (first commit) | feat/pharmacy-medicines  | none      |
| 1   | PEOPLE-ROSTER (PROMPT-ROSTER)                                  | feat/pharmacy-roster                | feat/pharmacy-medicines  | 0273      |
| 2   | SETUP-TABS: Going live, Places, Rules, Messages (PROMPT-SETUP) | feat/pharmacy-setup-tabs            | feat/pharmacy-roster     | 0274      |
| 3   | STORE: Stock › Main store (PROMPT-STORE)                       | feat/pharmacy-main-store            | feat/pharmacy-setup-tabs | 0275      |

Per brief, the prompt's nine steps: recon file (RECON-\*.md) → migration + seed → pure derive + unit tests →
actions → UI (subagents, split as the prompt says) → wire-up → tests → UI pass against the prototype → clean-up +
one HANDOFF section. A commit after each step.

## Adaptations to this repo (the prompts are written generically)

- `npm`, not `pnpm`; there is no `src/` (the STORE grep runs over `app lib components`).
- **No Playwright in the repo.** Adding it means a new dependency and browser downloads. Instead:
  - acceptance items become Vitest tests (pure derive + PGlite lane `tests/emr-db/*` for DB guards and actions);
  - axe runs through `axe-core` (already a dependency) on rendered components, as `tests/a11y` does;
  - the 1440 / 390 px pass (console errors, no page scroll, keyboard) is done in the app's browser pane against
    the dev server, with screenshots kept out of the repo.
    Playwright can be added later if the owner wants CI end-to-end.
- Migrations are GATED and owner-applied: 0273, 0274, 0275 ship unapplied. Reads guard with `to_regclass` so
  pages don't break before they are applied (as 0272 does).
- Seeds go only in `scripts/seed-pharmacy-dev.ts`.
- All copy goes in `content/` as draft; the owner signs in chat.
- Rules registry: `pharmacy_rules` (0270) gains `params jsonb` and `shows_on` in 0273; the Medicines two-signature
  flow (`components/pharmacy/medicines/rules.tsx`) is reused for every group.

## Owner items (collected in HANDOFF as each brief closes)

Apply 0271–0275 · licence bodies (PSU, AHPC) · Eid dates · the 6-shift and 7-day rules · attendance device ·
SMS provider and key · Luganda texts · supplier contacts and budgets · HMIS 105 / NDA columns · second signer ·
go-live date · shelf list and bins · top-up run days · supplier cycles and NMS budget · place-balance opening
counts · room readings routine · requisition fill target.
