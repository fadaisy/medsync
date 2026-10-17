# Lab Phase 4: final report (STOP 12)

17 Oct 2026, branch `feat/lab-connect-outward`. Built dark behind `LAB_REFERRAL` and `LAB_EXCHANGE` (per hospital,
off in production while `LAB4_COPY_STATUS` is a draft). Migrations **0150 → 0151 → 0152 → 0153** are GATED and
unapplied: the owner applies them in that order, from this branch's folder. ADRs 0312–0327. No push has been made.

## What was built

| Step | Outcome                                                                                                              | Where                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 0    | Discovery, H1–H24, letter to NHLDS drafted (not sent)                                                                | `STOP-REPORTS.md` STOP 0, `letter-to-nhlds.md`                                                                     |
| 1    | GATE A signed by the owner (also the CSO) as recommended                                                             | `gate-a-proposal.md`                                                                                               |
| 2    | Data layer 0150–0153, schema, flags, permissions, copy                                                               | `supabase/migrations/015*`, `db/schema/lab-exchange.ts`                                                            |
| 3    | Pure engines: referral, manifest, Code 128, results back, matching, outbox, FHIR                                     | `lib/lab/*`, `lib/exchange/*`                                                                                      |
| 4–7  | Partners, To refer, manifests, Referrals and tracking, results back on paper, the doctor's view, the governance desk | `app/lab/refer`, `app/lab/referrals`, `app/lab/exchange/partners`, `app/referral-governance`, `app/doctor/results` |
| 8    | Exchange core: machine identity, store before acknowledge, processing, back-to-file, outbox, Connections, Analysers  | `lib/exchange/store.ts`, `app/api/exchange/*`, `app/lab/exchange`                                                  |
| 9–11 | Gap reports: no partner interface, no maker's document, no national specification                                    | `partner-gap.md`, `analyser-gap.md`, `national-gap.md`                                                             |
| 12   | S24 and S26, load, GATE S record, hazard log closed, screen harness, user guide, ADRs                                | this file, `gate-s.md`, `hazard-log.md`, `user-guide.md`, `shots/`                                                 |

## Found and fixed at Step 12

1. **An amended referred report fell back to `in_house`**, which the `dr_referral_external` check refuses (S26).
   Later versions now stay external with the referral and provenance (`lib/emr/write/results.ts`).
2. **A referred critical value could not be released**: Phase 1 asks for a repeat, which a reference lab's result
   cannot have. Paper and electronic filing now record "checked, not repeated" for values the signed limits flag,
   and the call runs as Phase 1's (S24). **ADR 0327 asks the CSO to countersign this rule.**
3. **Electronic filing skipped the critical check altogether**; it now runs it, as paper does.
4. **Connections crashed on the production driver** (a `Date` in raw SQL; PGlite accepted it). Found only by the
   harness, which runs postgres-js against the served database.
5. **Referrals never showed the rejection reason**, and kept an empty side-panel column.
6. **Partners said "Not connected" for a paired partner**, and its copy named a build step ("Step 9").
7. GATE S: pairing codes went from 50 to 100 bits, are compared in constant time, and need a fresh second factor to
   make. The outbox worker gained its scheduler (`private.schedule_exchange_outbox`, 0106's pattern).
8. Accessibility: a scroll region with no keyboard access (serious), in-text links told apart by colour alone in
   dark mode (serious), and missing landmarks and headings.

## Checks

| Check                                                     | Result                                                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                       | Clean                                                                                                                                    |
| `npm run lint`                                            | Clean (two old warnings in `scripts/embed-bench.mjs`)                                                                                    |
| `npm run test`                                            | 10,227 pass, 0 fail (PGlite-only files skip without `EMR_PGLITE`)                                                                        |
| PGlite lanes for Phase 4 and what it touches              | 371 pass: exchange 14, referral 16, Phase 4 data 13, criticals, limits, HMIS, `tests/lab/phase-4`                                        |
| `npm run build`                                           | Passes                                                                                                                                   |
| Screen harness (`~/Desktop/lab4-harness`, never the repo) | 12 routes at 1440 and 390 px plus 2 dark: **0 axe findings of any level**, no server errors, no horizontal page scroll. PNGs in `shots/` |
| Load (in-process PGlite, simulator)                       | 500 inbound messages stored in 855 ms; acknowledge p95 2.3 ms; process p95 8.8 ms. Production numbers need the real database             |

The harness seeds through the app's own stores (every name a fixture label), serves PGlite on a socket, and runs a
production build with the Phase 4 flags. Auth is patched in the harness copy only.

## Section 13 numbers

| Metric                                                                      | Target | Result                                                                                                   |
| --------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Referred specimens with no record between To refer and a result or decision | 0      | 0 by construction: the referral is created at Add to manifest, in the same transaction (R S5)            |
| Referred results filed on the original order                                | 100 %  | 100 % in tests (S20, S38); no new order is ever made                                                     |
| Referred results released without a scan (paper)                            | 0      | 0: release refuses (`releaseErrors`, S20–S25)                                                            |
| Referred results flagged against this hospital's range                      | 0      | 0: their printed range only (S20, S23)                                                                   |
| Results filed to the wrong patient (all sources)                            | 0      | 0 in tests (S21, S32–S34)                                                                                |
| Patients, orders or specimens created from a message                        | 0      | 0 (S34)                                                                                                  |
| Messages lost in kill and drop tests                                        | 0      | Server side: 0 (S29). Bridge kill and drop: not run (Step 10)                                            |
| Results filed twice after redelivery                                        | 0      | 0 (S30, S38)                                                                                             |
| Interfaced results released without a technologist / through a QC hold      | 0      | Not applicable: no analyser interface (Step 10)                                                          |
| Shadow-run differences unexplained at go-live                               | 0      | Not applicable (Step 10)                                                                                 |
| High-risk specimens on a routine manifest                                   | 0      | 0 (S9; refused by the database too)                                                                      |
| Electronic sends to a partner without a complete legal record               | 0      | 0: enabling a partner's machine needs the signed record (PT-4); no outbound transport exists             |
| Patient names on a manifest                                                 | 0      | 0 (`manifest.test.ts`; print checked in the harness)                                                     |
| HMIS 10.4 cells differing from the hand count, unexplained                  | 0      | Lane S28 matches the records; a hand count on site is an owner action                                    |
| Clinical numbers or codes in code, seeds or copy                            | 0      | 0: every value in tests and the harness is a named fixture                                               |
| National connectors coded without GATE N                                    | 0      | 0                                                                                                        |
| Hazards without a control and a test                                        | 0      | 4 analyser hazards and 2 others are gaps with the paper path as control (`hazard-log.md`, closure table) |
| Rule IDs without a test                                                     | 0      | Analyser rules (AB-_) and the national rules (NX-_) have none: not built                                 |
| RLS probes passed (including service identities)                            | 100 %  | 100 % of the Phase 4 data lane (every new table × every actor)                                           |
| axe serious or critical                                                     | 0      | 0 (26 page states)                                                                                       |
| Red fills or green on new routes                                            | 0      | 0                                                                                                        |

## Definition of Done

| Item                                                                                             | State                                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| H1–H24 confirmed or corrected; letter to NHLDS sent and answered                                 | H1–H24 recorded; **the letter is not sent** (owner)                             |
| A record from To refer to a result; manifests without names; high-risk never routine             | Done                                                                            |
| Overdue, rejected, cancelled, lost; the doctor sees where the specimen is                        | Done; **no notifications** (no notification module)                             |
| Results back on the original order with provenance, units, ranges, scan, second check            | Done                                                                            |
| HMIS 10.4 from records and matching the hand count                                               | From records; the hand-count comparison is an owner action                      |
| Store keeps everything, acknowledges after storing, never files twice; queue; no patient created | Done                                                                            |
| Step 9 built or gap report                                                                       | Gap report                                                                      |
| Step 10 live after a shadow run, or gap report                                                   | Gap report                                                                      |
| Step 11 built past GATE N, or gap report                                                         | Gap report                                                                      |
| GATE S passed for every machine connection in production                                         | **Not passed**: none is in production; the record is ready (`gate-s.md`)        |
| No clinical number or code in code, seeds or copy                                                | Done                                                                            |
| Every rule ID has a test; RLS green; append-only holds                                           | Yes for what is built; AB and NX rules not built                                |
| axe clean; no red or green; reduced motion                                                       | Done (no motion added)                                                          |
| S1–S51 or gap reports; flags off = Phase 3 baseline                                              | S1–S38 pass (S37/S38 on the simulator); S39–S51 gap; baseline test passes       |
| Hazard log complete and signed; guides, ADRs, final report; reviewable diff                      | Log closed against tests, **scores and signature are the CSO's**; the rest done |

## Owner actions, in order

1. Read and sign: **ADR 0327** (the CSO), the hazard log's scores, the Phase 4 copy (`content/lab-phase-4.ts`,
   still `draft`).
2. Apply **0150 → 0151 → 0152 → 0153** from this branch's folder: `cd ~/Desktop/medsync && npm run db:migrate`.
3. After 0153, with `CRON_SECRET` in Vault as `medsync_cron_secret`, run
   `SELECT private.schedule_exchange_outbox('https://{host}/api/cron/exchange-outbox');` once.
4. Add a Vercel Firewall rate limit on `/api/exchange/pair` and `/api/exchange/token` (GATE S S-5). **Deferred**: needs the Vercel Pro plan; do it before any machine connection goes live.
5. Send the letter to NHLDS (`letter-to-nhlds.md`) and record the date.
6. Before switching `LAB_REFERRAL` on at a hospital: the Q3/Q4/Q11/Q12/Q14 answers, the partners entered and signed,
   the data protection and IPC leads named, the Code 128 manifest scanned with the site's scanners, and the timed
   trials with real lab users (ten specimens to a sealed manifest; a five-component paper result).

## For the CSO

- **ADR 0327**: a referred critical value is "checked, not repeated".
- **Stricter MA-1** (raised at Step 3, not applied): a differing hospital number always waits, even when name and
  date of birth agree.
- **Duplicate form numbers** (seen in the harness): Add to manifest accepts the same partner form number for two
  patients. Matching then makes their results wait as ambiguous (S33), so nothing files to the wrong patient, but
  refusing it at Add to manifest would catch the typing error at the bench. Recommended; not built without a
  decision.

## Known gaps

No notifications to named people; no virus scanning of scans (ADR 0323); key rotation is a re-pair (no overlap);
the clock-skew note waits for a real sender; HL7 v2 inbound waits for the bridge; the governance desk and the HMIS
desk have no top bar (the Phase 3 pattern); a restricted result on the reconciliation queue has no lane test.
