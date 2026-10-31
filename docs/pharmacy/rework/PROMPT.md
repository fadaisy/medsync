# Prompt for Claude Code: execute the pharmacy rework

Paste everything below the line into Claude Code, opened at the root of the MedSync repo. Copy this kit to `docs/pharmacy/rework/` first.

---

You are rebuilding the MedSync pharmacy workspace. Build it end to end in this session, on a branch `feat/pharmacy-rework`. Commit after each phase.

## Sources of truth (read only these, in this order, as needed)
1. `docs/pharmacy/rework/PRD.md`: what to build, the safety invariants S1–S14, and the acceptance scenarios.
2. `docs/pharmacy/rework/TECH-SPEC.md`: routes, data model, guards, actions, derivations, permissions, tests.
3. `docs/pharmacy/rework/prototype/*.js`: the working reference for behaviour and layout. Open `prototype/index.html` to click through it. Port the logic function by function; do not redesign it.
4. `docs/pharmacy/rework/REVIEW-FINDINGS.md`: the problems this closes (C1–C4, H1–H9, M1–M11, L1–L6), with file and line evidence.
5. `DESIGN-medsync.md` (Tide). Read only the token, type, navigation and component sections.

**Do not read** `docs/pharmacy/**` (86 files), the ADRs, `docs/lab/**` or old FINAL-REPORTs. The PRD supersedes them.

## Token discipline
- Find code with `rg -n`, then read only the line range you need. Never read a file over 400 lines whole: read it in ranges.
- Read each prototype file only in the phase that ports it.
- Do not paste large files into your reasoning. Do not re-read a file right after editing it.
- Edit in place. Do not rewrite a whole file to change part of it.
- Run only the tests for what you just touched, plus the full safety suite at the end of each phase.
- Use subagents only for the parallel phases marked ⇉. Give each one its phase section, the exact folders it owns, and "do not touch the shell or shared derive files". Integrate their work yourself.
- Do not write ADRs, a changelog, or docs beyond `docs/pharmacy/HANDOFF.md` (one living file).

## Hard rules
- **Safety:** the safety invariants S1–S14 in PRD §5 are non-negotiable. Enforce the ones marked [DB] in SQL triggers, not only in TypeScript.
- **No accent borders:** never use coloured left or side accent borders (`border-l-*`, `border-left` accents) anywhere. Never use very dark themes. Use Tide tokens only.
- **Copy:** all user-facing words go through signed content. New strings are added with status `draft`. Never put build codes in copy.
- **Data:** no sample or demo data in production code paths. Seeds go only in `scripts/seed-pharmacy-dev.ts`.
- **Preserve history:** keep existing migrations and the append-only ledger. Add migrations; never edit applied ones.
- **One home per thing:** reuse an existing table, component or helper before you create one. If two exist, keep one and turn the other into a read-only view or delete it (TECH-SPEC §9).
- **Ambiguity:** when something is unclear, choose the PRD §9 default, note it in HANDOFF.md, and continue. Stop only if a phase's exit check cannot pass.

## Phases
**P0 Recon (short).**
- Verify every path in TECH-SPEC §0 with `rg`.
- Write `docs/pharmacy/rework/RECON.md`, at most 60 lines: actual table, file and function names for the ledger, guard, attestation, catalogue, places, permission map, signed copy, shell, flags, refills, immunisation and staff.
- Exit when every TECH-SPEC reference is mapped to a real name or marked "create".

**P1 Foundations (sequential; everything else depends on it).**
- **Migration:** extend the ledger (TECH-SPEC §2.1). Rewrite the guard (S2, S3, reversal rule). Make attestations single-use with a 10-minute life. Add `place_id` to controlled-drug entries. Create the roster, prescriber, price and VEN tables.
- **Permissions** gated on recorded legal answers; refuse to boot in production with dev overrides set (C1, H1, S13).
- **Demo isolation:** `is_demo` plus a filter, a separate demo database URL, and no trigger disabling (C3, S14).
- **Flags** collapsed to 4 tiers.
- **Tide kit** promoted to `components/tide`.
- **Shell:** 6-section rail, sub-tab nav, bottom pill, one h1, one href map, and redirects for all old routes (PRD §3).
- **Lints:** copy lint, and an accent-border lint.
- **Witness:** request and approval on the witness's own device, with the roster-based people picker (PRD §6.5 witness).
- Exit when safety tests 1–3, 7 and 11 pass and every old URL redirects.

**P2 Daily work.**
- Today (§6.1) and the derive `todayItems`.
- Dispense, with the checks panel and prescriber queries (§6.2).
- Medicines and recall (§6.4).
- Store: Receive grid, Issue with on the way, resumable Count sheet, Order builder (§6.4).
- Exit when PRD scenarios 1–4, 9 and 10 pass and tests 4 and 8–9 pass.

**P3 ⇉ Controls**, owning `app/pharmacy/controls/**` and `lib/pharmacy/{cd,handover,cases}`. Build:
- controlled-drug registers, dose recording, checks, flags and resolutions
- shift handover, own station only, with in-charge oversight
- investigations (§6.5)

Exit when scenarios 5–7 and tests 5–6 pass.

**P4 ⇉ Patients and cold chain**, owning `app/pharmacy/patients/**`, `app/pharmacy/stock/store/cold/**` and `lib/pharmacy/{wards,op,epi,cold,sms}`. Build:
- Inpatients: MAR view, track, pick, return, round pick lists
- Outpatients: refills, pill count, courses
- Immunisation: vaccine stock, the EPI fridge, clinic dashboard and indicators
- Cold chain: sensor, WHO monthly chart, excursions, fridge contents add and take out
- Reminders: SMS queue and the provider interface (§6.3, §6.4 Cold chain)

Exit when the Playwright smoke passes on these pages and vaccinating decrements stock.

**P5 ⇉ Records and Set-up**, owning `app/pharmacy/records/**`, `app/pharmacy/setup/**` and `lib/pharmacy/{audit,losses,reports,team}`. Build:
- the audit trail with corrections
- losses in UGX with expiring-before-use
- paper sheets
- reports with Draft → Checked → Submitted and a snapshot at submission
- Team
- Set-up: the Going live checklist, places, medicines, prices and VEN, read-only Rules, people and roster, SMS templates (§6.6, §6.7)

Exit when scenarios 8, 11 and 12 pass and test 10 passes.

**P6 Finish.**
- **Offline:** an outbox (IndexedDB) for hand over, receive, issue, count lines and CD dose (as drafts), with persisted idempotency keys and a network pill showing the count still to send (scenario 13). Block new CD entries after the PRD §9 offline limit.
- **Deletions:** as listed in TECH-SPEC §9.
- **390 px pass:** every route at 390 px, with no horizontal scroll (scenario 14).
- **Tests:** the full safety suite and the Playwright smoke at 1440 px and 390 px.
- **HANDOFF.md:** what was built, PRD defaults taken, open legal decisions, copy still `draft`, and the HMIS/NDA column mapping still to confirm.

## Definition of done
- All 14 PRD acceptance scenarios pass. The safety tests pass. `pnpm typecheck`, `pnpm lint` and the build are clean.
- No route outside the new information architecture renders except redirects. There is no sample data in production paths.

## Final message
Keep it to at most 20 lines:
- phases completed
- the test summary
- defaults taken
- anything blocked, with the exact reason
- the branch name

Do not recap the steps.
