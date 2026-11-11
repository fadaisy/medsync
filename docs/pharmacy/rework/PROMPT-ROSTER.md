# Prompt for Claude Code: replace Set-up › People and roster

Paste everything below the line into Claude Code, opened at the root of the MedSync repo. Before you do, copy the updated kit to `docs/pharmacy/rework/`. You can run this on its own, or after `PROMPT-MEDICINES.md`; it reuses that prompt's rules machinery.

---

Replace the pharmacy **People and roster** tab with the design in `docs/pharmacy/rework/PEOPLE-ROSTER.md`. Build every function it describes, exactly. The bar is **perfect UI and perfect behaviour, at minimal token cost**. Work on a branch `feat/pharmacy-roster`, and commit after each step.

## Sources of truth (read in this order, and only the parts you need)

1. `docs/pharmacy/rework/PEOPLE-ROSTER.md` is the spec. It overrides the PRD "People" rows and the `pharmacy_duty_roster` row of TECH-SPEC. Read it by section (`rg -n "^## " PEOPLE-ROSTER.md`, then read ranges).
2. `docs/pharmacy/rework/prototype/people-roster.dc.html` is the working reference (~1,700 lines).
   - **Never read it whole.** Find the behaviour with `rg -n "<name>"` (e.g. `judge`, `fillGaps`, `effStatus`, `breaksFor`, `attOf`, `holidays`, `lvList`, `rqList`, `nowGroups`) and read only those ranges.
   - Port the behaviour **function for function**, with the same wording, thresholds, colours and flows. Do not copy its markup or inline styles; rebuild with Tide components.
3. TECH-SPEC §0 (repo shape), §4 (action pattern), §6 (UI notes) and §7 (tests). PRD §5 (S10 witness rule).
4. `DESIGN-medsync.md` (Tide): tokens, type and components only.
5. Already built and to be reused, not rebuilt:
   - the Medicines tab's rules badges, dialog and two-signature flow (`components/pharmacy/medicines/rules*`, `lib/pharmacy/actions/rules*`)
   - Tide Dialog, Chip, Segmented and Avatar
   - the Messages/SMS queue

## Token discipline (strict)

- **Plan once.** Write `docs/pharmacy/rework/RECON-ROSTER.md`: at most 40 lines mapping every table and action in spec §16–§18 to a real name, or "create". Then do not re-explore.
- Use `rg -n` before every read. Read line ranges, never whole files over 200 lines. Never re-read a file you just wrote.
- Edit in place with minimal diffs. No rewrites to change a few lines. No speculative refactors outside the roster.
- No narration between tool calls. No restating the spec. No summaries until the final message.
- Run only the tests touching what you changed, then the full roster suite once per step.
- Use subagents only for steps 5a and 5b, in parallel. Give each the exact folders it owns and the spec sections it implements. Each returns a list of changed files only.
- Docs: update only `docs/pharmacy/HANDOFF.md` (one section). No ADRs or changelogs.

## Hard rules

- **Scope:**
  - The **pharmacy** roster is the only editable one.
  - Ward rosters (doctors, nurses, midwives) are **read-only**, coming from the ward module. Contact and today's prescriptions or doses only.
  - Enforce this in RLS or a trigger, not only in the UI.
- **The database enforces the invariants**, each with a guard test:
  - one place per person per shift per date (unique)
  - slot capacity (2, or 1 for on call)
  - approval only after the colleague accepts, by the roster maker of both places
  - leave approval frees the shifts in the same transaction
  - no rostering on approved leave or after licence expiry
  - only the owner writes their photo
  - only the in-charge (or a delegate who can publish) publishes or unlocks
- **Rules are live.** Each rule group's numbers (2 per shift, 6 a week, 10 and 15 minutes, 30 days, 7 days) live in `pharmacy_rules.params`. The checks read them. Changing one needs two signatures, as in Medicines.
- **Look:**
  - Tide tokens only. No coloured side or left accent borders anywhere. No very dark themes.
  - Shift tints: Day `#fff1cc`, Night `#e4e7ee`, On call `#ede9fe`.
  - Status colours always come with a word.
  - Avatars: photo, or initials on a stable tint.
- **Copy:**
  - All strings go through signed content as `draft`.
  - Use the spec's wording verbatim, and the en-GB date style `Tue 3 Nov`.
  - Phone numbers are `+256 7xx xxx xxx`.
  - Patients are shown as bed + initials only.
- **Do not ship:**
  - the "Acting as" selector
  - the fixed date
  - the generated data (`dayMeds`, hashed phones and attendance, the sample roster)
  - data-URL photos
- Seed fixtures go only in `scripts/seed-pharmacy-dev.ts`.

## Steps

1. **Recon.** Write RECON-ROSTER.md (above).
2. **Data.**
   - Migrations for spec §16, with triggers and RLS.
   - Seed: about 8 weeks of pharmacy roster covering every state:
     - gaps and unwitnessed shifts
     - one rest break
     - pending, accepted, approved, declined and expired swaps
     - pending and approved leave
     - one expired and one expiring licence
     - late and absent sign-ins
     - a delegation
   - Seed `public_holidays` with the fixed ones plus computed Easter, and Eid as `confirmed=false`.
3. **Derivations.**
   - Write `lib/pharmacy/derive/roster.ts` with the §17 pure functions.
   - Unit-test every branch:
     - `judge` blocks and scores
     - `fillGaps` never breaks a rule
     - `effStatus` covers expired and stale
     - `holidays` computus for 2025–2030
     - `breaksFor`, `needsWitness` (the store keeper and EPI exemptions)
     - `canEditPlace` with the delegation end date
4. **Actions.** Write `lib/pharmacy/actions/roster.ts` with the §18 actions, following the TECH-SPEC §4 pattern. Re-check permissions and rules on the server, write an audit event, and queue the SMS per the reminder settings.
5. **UI.** Build `components/pharmacy/roster/*`, following spec §2–§15 in order.
   - **5a ⇉:** On duty now, the toolbar, Who makes the roster, the week grid (incl. the Leave row, holidays, cards, drag and drop), month view, phone day view, slot dialogs (assign with best fit, card, contact), print CSS.
   - **5b ⇉:** Swap requests (form, states, progress steps, gated Approve), Leave (form, states, approve frees shifts), Load table, Reminders, People (licences, renewal, own-photo upload) and Prescribers.
   - Then wire the rule badges and dialog yourself, reusing the Medicines components.
6. **Wire-up.**
   - Realtime on `pharmacy_duty_roster`, requests, leave and attendance, with a 30 s polling fallback.
   - The witness picker and handover (S10) read this roster.
   - Contact cards read prescribing and MAR for that shift.
   - Reminders enqueue to Messages.
   - Going live counts staff with no roster or no licence.
7. **Tests.**
   - every acceptance item in spec §20, as Playwright end-to-end tests
   - the SQL guard tests above
   - Playwright at **1440 px and 390 px**: no console errors, no horizontal page scroll, axe clean (WCAG AA), and keyboard-only operation of every dialog
8. **UI perfection pass.**
   - Run the prototype and your build at 1440 and 390 px. Screenshot each section (On duty now, toolbar, week grid, month, day view, every dialog, Swaps, Leave, Load, Reminders, People).
   - Compare them side by side and fix every difference in spacing, type, colour, wording, order, states and empty states, until they match.
   - Keep the screenshots out of the repo.
9. **Clean-up.**
   - Delete the old People/roster code and the copy keys it no longer uses.
   - Add one section to `docs/pharmacy/HANDOFF.md` covering what was built, the defaults taken, and what needs the owner:
     - the licence bodies to confirm (PSU, AHPC)
     - the Eid dates each year
     - the 6-shift and 7-day rules
     - the attendance device

## Definition of done

- Every function in PEOPLE-ROSTER.md works as specified, and every §20 item passes.
- One roster component. The old one is deleted.
- `pnpm typecheck`, `pnpm lint`, unit tests, SQL guard tests and Playwright (both widths, axe) are all clean.
- The screenshots match the prototype section by section.

## Final message (≤ 12 lines)

Steps done, the test summary (counts), defaults taken, what the owner still needs to supply, and the branch name. Nothing else.
