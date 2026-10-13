# Lab Phase 2: handoff to the build session

Written 12 Oct 2026 at the end of the session that built Lab Phase 1 and prepared Phase 2. Read this first, then the prompt.

## Start here

1. **The task:** `docs/lab/phase-2/PROMPT-LAB-PHASE-2.md`. Run it step by step from Step 0, stopping at each STOP.
2. **Its inputs:**
   - `docs/lab/catalogue-research/DECISIONS.md`: the owner's 25 decisions. They are binding.
   - `docs/lab/catalogue-research/lab-catalogue-research.v1.json` and `RESEARCH-NOTES.md`: the researched proposal. It is unsigned, and it is data to import, never numbers to type into code.
3. **Where to work:**
   - Worktree `~/Desktop/medsync-lab1`, branch `feat/lab-catalogue`.
   - The branch was cut from `origin/main` 00a37cf6, which already includes Lab Phase 1 (PR #227) and the pharmacy dispensing merge (#228).
   - Commits so far: 835ebdf (research), 5cfc1d4 (decisions and prompt). Local only.

## Where things stand

| Item                       | State                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lab Phase 1 (safety floor) | Merged to main (PR #227). Migrations 0102–0106 applied in production. The criticals wording and the hazard log were signed by the CSO on 12 Oct 2026. |
| Timed trial                | Run and closed by the owner on 12 Oct 2026. Trial hospital `7a1a0000-0000-4000-8000-000000000001`.                                                    |
| Owner clean-up still open  | Remove the trial hospital from the `LAB_*` flag lists on Vercel. Unset `DEV_SKIP_MFA`, then redeploy.                                                 |
| Lab Phase 2                | **Nothing built.** Prompt only.                                                                                                                       |

## Gates that need the owner (Fadhul, the CSO)

- **STOP 1 (GATE A):** the schema, wireframes, import design and hazard seed. Build nothing until he signs it.
- **STOP 4:** the concept addendum (59 new concepts). The CSO signs it before it seeds.
- **Ranges:** signing ranges is done in the product, per hospital, by the lab lead and the CSO. It is never done in code.
- **Format for the owner's choices:** offer an artifact page for sign-offs or choices. He used them for the Phase 1 sign-off and the 25 decisions. A page with the `db` capability, owner-only writes, saving each answer immediately, worked well.

## Numbers

- Migrations **0107–0119** and ADRs **0251–0259** belong to the lab block in `docs/NUMBERS.md`. Mark them there as you use them.
- The pharmacy holds 0120–0139 and ADRs 0260–0279. Don't cross into its range.
- Migrations are immutable once shipped. The owner applies them himself, never Claude.

## How to check work

- Unit and PGlite tests: `SKIP_ENV_VALIDATION=1 npm run test`. Without the flag, about 26 files fail on env validation.
- Typecheck, lint and build in this worktree: set `NEXT_PUBLIC_SUPABASE_URL` to any URL, because `lib/supabase/accounts.ts` reads it at import. If you see validator errors about removed pages, run `rm -rf .next` before `typecheck`.
- Tests rendered from the build (landing, a11y, auth pages) skip unless `.next` is newer than the sources. Run a build before trusting the skip counts.
- **Screens: the harness** at `~/Desktop/lab0-harness`:
  - It syncs from `medsync-lab1`. Start with `P1=1` to seed lab leads and the CSO fixtures.
  - Screenshots and axe: `node cdp.mjs plans/<plan>.json`.
  - Plan steps include `{user}`, `{sql}` and `{select}`.
  - Before a harness production build, `rm .current-user`.
  - Re-run `node patch.mjs` when `lib/auth.ts`, `proxy.ts` or `db/index.ts` change.
  - New migrations must be added to its start-up chain.
  - The doctor's view needs `DOCTOR_WORKSPACE=1` and `RESUS_DESK_V2=1`.

## Points from the research to carry into Step 0

- Three concepts the research calls new already exist and match: `obs.eosinophils_abs`, `obs.bicarbonate` and `obs.aptt`.
- The research wrote invalid UCUM. Use the valid forms: `{copies}/mL`, `m[IU]/L`, `mL/min/{1.73_m2}`, `{count}` (F-1).
- The research uses a `text` value type. MedSync has no such type; free text is `as_typed`.
- Phase 1's laws stand: fixed units with no conversion; no clinical numbers in code or seeds; two signatures; red only for genuine emergencies; centred `EditorDialog` pop-ups only.
- Do not use the CBC report photo the owner shared. It is a real patient's record. The DH-615 parameter list in the research is the source.

## Owner rules

- `.env.example` is untouchable.
- Never push or merge without asking. `gh` is not installed. A direct push to main was refused, so the owner merges PRs on GitHub.
- No fabricated data.
- The owner deploys to production. Claude's production deploy is blocked.
- Write plain-language STOP reports, appended to `docs/lab/phase-2/STOP-REPORTS.md`, and make one local commit per step.
