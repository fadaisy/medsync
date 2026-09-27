# ADR 0170 — The examination as data: response types, statuses, token map

**Status:** Accepted — 2026-09-28. PROMPT-CLERKING-EXAM-V2; D-EX-01, D-EX-02, D-EX-03 signed by the CSO (`docs/emr/clerking-v2/exam/gate-a-proposal.md`).

## Decision

1. **One catalogue.** Every examination item, attribute, option, scale, classifier, reference value, flag rule, suggestion rule and composer rule lives in `data/clerking/clerking-exam-catalogue.v1.json` (MS-EMR-EXAM-CAT-001), parsed by a strict Zod schema (`lib/clerking/exam/catalogue.ts`) that refuses an unknown mirror owner, link owner, `shown_when` option or unplaced item.
2. **The runtime catalogue is the handoff plus signed edits, as code.** `scripts/clerking/exam-gate-a-edits.ts` applies GATE A's SC and TM changes to the handed-over file (kept untouched in `docs/emr/clerking-v2/exam/`). A test holds `applyGateAEdits(handoff) = runtime`, and the sign-off pins the runtime's SHA-256 (`data/clerking/exam-signoff.v1.json`).
3. **Nine response types (E1).** Components render by type and attribute kind, never by item. `presence`, `test`, `state` and `device` are a pair of buttons in the item's own words; only `state` items may say Normal/Abnormal; counters say "findings", "nothing found", "not examined".
4. **Four answer states (E2).** Unrecorded (absent key), negative, positive, not examined with a reason. "Everything else normal" answers only unrecorded presence, test and state items and single-expected choices; never links, devices, classified or measured items, blocks, oxygen or consciousness; it is undone exactly.
5. **The CFC token map** (`exam-token-map.csv`) maps each item to the finding vocabulary. Items with a concept chart at signing; the rest stay in the signed note with their catalogue ids until a CFC v1.3 addendum adds concepts (proposed: 165). No private vocabulary.

## Consequences

- Adding an item of any type, or a classifier band, needs no code (tested).
- `npm run clerking:catalogue-check` validates both catalogues and every id that crosses between them.
