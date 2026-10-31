# Pharmacy rework kit

**How to use it:**
1. Copy this folder into the MedSync repo as `docs/pharmacy/rework/`.
2. Open Claude Code at the repo root.
3. Paste everything below the line in `PROMPT.md`.

| File | What it is |
|---|---|
| `PROMPT.md` | The execution prompt: sources, token discipline, hard rules, phases P0–P6 with exit checks, definition of done |
| `PRD.md` | What to build: roles and stations, the 6-section information architecture, glossary, safety invariants S1–S14, every feature with acceptance criteria, non-functionals, open decisions with defaults, 14 end-to-end acceptance scenarios |
| `TECH-SPEC.md` | How to build it in the repo: known paths (to verify), routes, ledger changes and guard trigger, new tables, derivations to port, server actions, permission matrix, UI notes, safety tests, demo isolation, deletions |
| `REVIEW-FINDINGS.md` | The 29 Oct review's problems (C1–L6) with file and line evidence, Uganda fit, and size |
| `prototype/` | The clickable reference implementation (React 18 UMD + htm, sample data, localStorage). Open `index.html` with internet access for the CDN scripts |

## Prototype map (file → features → target route)
| File | Features | Route |
|---|---|---|
| `data.js` | Sample medicines (MEDS + INFO + CLIN: PK, PD, ADR, interactions), classes, batches, ledger and helpers (`move`, `allocate`, `fefo`, `medAt`), places, roster, levels | seeds + `lib/pharmacy/derive` |
| `kit.js` | Icons, Chip, Seg, Stepper, Dialog, MedTags, MedInfo (Rx info card), BrandPick, PackPick, WitnessDialog (roster people on duty) | `components/tide` |
| `app.js` | Shell: 6 sections, sub-tabs, bottom pill, Find, Start, Emergency, place chip, offline pill, More | layout + nav |
| `today.js` | Dashboard tiles, ranked work list by role | `/today` |
| `dispense.js`, `checks.js` | Prescription screen; allergy, dose-for-weight, kidney, pregnancy, duplicate and counselling checks; prescriber queries | `/dispense` |
| `inpatients.js`, `rounds.js` | MAR view, adherence, prescription track, pick and return, round pick lists | `/patients/inpatients` |
| `outpatients.js` | Refills, pill count, MPR, antibiotic courses | `/patients/outpatients` |
| `epi.js` | Vaccine stock, open vials, clinic dashboard, register, vaccinate, indicators | `/patients/immunisation` |
| `productivity.js` | Reminders (SMS), Reports (HMIS 105, controlled-drugs return, losses), Team | `/patients/reminders`, `/records?tab=reports`, `/records/team` |
| `medicines.js` | Medicine list and page, recall | `/stock/medicines` |
| `store.js` | Receive, Issue, Count, Order builder (VEN, budget), tabs | `/stock/store` |
| `cold.js` | Fridges, sensor trend, WHO monthly chart, readings, excursions, add to and take out of a fridge | `/stock/store?tab=cold` |
| `cd.js` | Controlled-drug registers, dose with residue, prescriber drop-down, balance checks, to-fix flags, resolutions | `/controls/cd` |
| `handover.js` | Station handover, roster, blind count, keys and seal, open items, missed and difference flags, in-charge oversight | `/controls/handover` |
| `cases.js` | Investigations: sources, severity and deadline, assign, steps, findings, sign-off, escalation | `/controls/cases` |
| `audit.js` | Audit trail with corrections, losses (UGX), expiring before use, prices | `/records` |
| `records.js` | Records tabs, paper sheets, recall page, Set-up | `/records`, `/setup` |
| `proto.css` | Styling reference only. Rebuild it in Tide tokens; do not copy the CSS | none |

To try the prototype, use "Viewing as … · try things" in the top strip to switch between Pharmacist, Store keeper and In-charge.
