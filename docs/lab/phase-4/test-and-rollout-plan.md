# Lab Phase 4: test plan, rollout plan, user-guide outline and ADR drafts

**Status: draft for GATE A, 17 OCT 2026. Not signed.** This is the part of the GATE A proposal the prompt asks for in
Step 1 ("the test plan … the rollout plan per flag, the user-guide outline and the ADR drafts"). It follows the
prompt ([PROMPT-LAB-PHASE-4.md](PROMPT-LAB-PHASE-4.md)) where the repo agrees and the STOP 0 findings
([STOP-REPORTS.md](STOP-REPORTS.md)) where it does not. The hazards it closes are in [hazard-log.md](hazard-log.md).

Table names below use the `lab_` prefix proposed at STOP 0 (difference 3) and keep `exchange_*` generic
(E-LAB4-01). They are proposals; the schema diff in the GATE A proposal decides them. Nothing here proposes a
clinical number, code, turnaround or range. Every operational number (retry back-off, presence window, skew
threshold, attempt limit) is labelled operational and set by the owner.

---

## (a) Test plan

### a.1 Lanes

| Lane      | Where                                            | Runs                                                                             | Proves                                                 |
| --------- | ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `unit`    | `tests/lab/phase-4/*.test.ts`                    | `npm run test` (Vitest, no database)                                             | Pure engines, every rule ID; scans of code and copy    |
| `lane`    | `tests/emr-db/lab-phase4-*.test.ts`              | `npm run test:emr-db` (`EMR_PGLITE=1`, every migration replayed, one connection) | Migrations, RLS, append-only triggers, actions, S1–S51 |
| `harness` | the local screenshot harness (rebuilt at Step 4) | by Claude at each UI STOP                                                        | Screens against the canvas, axe-core, 1440 and 390 px  |
| `owner`   | dev Supabase, the site                           | by the owner or site staff                                                       | Real kill, load, timed trials, scanners, shadow run    |

No Playwright (STOP 0 Q15): axe runs inside the harness, as in Phase 3. No new test dependency. Engines take `now`
as an argument; scenarios that need a clock use `vi.setSystemTime`.

### a.2 Per step

| Step | Test files                                                                                                                                                        | What each proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Scenarios |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2    | lane `lab-phase4-data`                                                                                                                                            | Migrations 0150 onward replay on top of Phase 3; every new table has RLS enabled and forced; the probe matrix (a.4); append-only triggers refuse UPDATE and DELETE including the service-role path; the `lab-report-scans` bucket has no client policy; `specimens.parent_specimen_id` added without touching the append-only trigger; the NC source CHECK accepts `referral` and `manifest`                                                                                                                        | —         |
|      | unit `flags-off`                                                                                                                                                  | Each Phase 4 flag is false when a flag it needs is off (HZ-4-40); with all four off, every Phase 3 route and action behaves as the Phase 3 baseline                                                                                                                                                                                                                                                                                                                                                                 | —         |
| 3    | unit `referral`, `manifest`, `code128`, `referral-results`, `match`, `exchange`, `fhir-referral`, `partners`, `hmis-10-4`, `national-gate`, `no-remembered-codes` | Every rule ID of 6.1–6.9 by name (a.3); the RF-3 table edge by edge; RF-5 in hours, days, working days and none; MA-1 and MA-2 on every reason code with two-hospital fixtures; the near-miss name fixture; EX-3 and EX-6; RB-3 with no printed range and an unknown unit; FX-1 Bundles through the structural check; FX-3 on a non-conformant but profiled message; HM-14 on a fixture month with an expected-output file reviewed by a person; no national code without GATE N; no remembered codes or turnaround | —         |
| 4    | lane `lab-phase4-partners`; unit `partners`                                                                                                                       | Register, tests and turnaround, packing, legal record, field lists, signatures with fresh second factor and D-LAB1-12; the DP lead designation                                                                                                                                                                                                                                                                                                                                                                      | S1–S4     |
| 5    | lane `lab-phase4-sendout`; unit `manifest`, `code128`; unit `baseline` (a) flipped                                                                                | Send panel server checks (RF-6), aliquots, seal, print, reprint "Copy", handover, receipt and discrepancy, outbreak referral, restricted rows                                                                                                                                                                                                                                                                                                                                                                       | S5–S11    |
| 6    | lane `lab-phase4-tracking`; unit `referral`                                                                                                                       | Now and Expected, overdue by fake clock, timeline with who said so, late status not applied, rejected, cancel after handover, lost, tiles that open their rows, "No data"                                                                                                                                                                                                                                                                                                                                           | S12–S19   |
| 7    | lane `lab-phase4-results-back`, `lab-phase4-hmis`; unit `referral-results`, `hmis-10-4`; unit `baseline` (b), (c) flipped                                         | Paper entry from the referral, identity compare, units and ranges as printed, scan upload checks, second-person check and its marker, criticals, amendments, dashboard printouts, 10.4 from records                                                                                                                                                                                                                                                                                                                 | S20–S28   |
| 8    | lane `lab-phase4-exchange`, `lab-phase4-simulator`; unit `exchange`, `match`, `log-scan`                                                                          | Inbound endpoint, store before acknowledge, outbox, processing, matching, queue, Connections, raw view, service identity, revocation                                                                                                                                                                                                                                                                                                                                                                                | S29–S36   |
| 9    | conditional: lane `lab-phase4-partner-link` (see a.10)                                                                                                            | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | S37–S40   |
| 10   | conditional: lane `lab-phase4-analyser`, unit `analyser`, the bridge's own tests (see a.10)                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | S41–S51   |
| 11   | conditional: none until GATE N; unit `national-gate` stays green                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —         |
| 12   | harness axe on every new route; lane `lab-phase4-security`; unit `ui` (red scarcity, words with icons); owner load and kill scripts                               | axe serious or critical = 0; keyboard paths; reduced motion; revocation at once; rotation rehearsed; secrets only in the store; load budgets; every hazard closed                                                                                                                                                                                                                                                                                                                                                   | —         |

Timed trials (S5: ten specimens to a sealed manifest, median ≤ 3 min; paper entry with scan, median ≤ 90 s) are
run in the harness by Claude for a first number, and by site staff for the number that counts. Both are reported.

### a.3 Rule coverage (rule ID → test)

Each rule ID appears in the title of at least one test so `grep` finds it. "Gap" means its step is a gap report
today; the rule is listed so the coverage metric (§13 "Rule IDs without a test: 0") counts it as **gap, not
covered**. GATE A decides whether the metric excludes gap rules or reports them separately.

**Referrals (6.1)**

| Rule  | Unit test (`tests/lab/phase-4/`) | Lane test (`tests/emr-db/`)    |
| ----- | -------------------------------- | ------------------------------ |
| RF-1  | `referral`                       | `lab-phase4-sendout` S5        |
| RF-2  | `referral`                       | `lab-phase4-sendout` S8        |
| RF-3  | `referral` (one test per edge)   | `lab-phase4-tracking` S12–S18  |
| RF-4  | `referral`                       | `lab-phase4-tracking` S14, S15 |
| RF-5  | `referral`                       | `lab-phase4-tracking` S12, S13 |
| RF-6  | `referral`                       | `lab-phase4-sendout` S5        |
| RF-7  | `referral`                       | `lab-phase4-sendout` S9        |
| RF-8  | `referral`                       | `lab-phase4-tracking` S17      |
| RF-9  | `referral`                       | `lab-phase4-tracking` S16      |
| RF-10 | `referral`                       | `lab-phase4-tracking` S18      |
| RF-11 | `referral`                       | `lab-phase4-sendout` S7        |
| RF-12 | `referral`                       | `lab-phase4-sendout` S10       |

**Manifests (6.2)**

| Rule | Unit test             | Lane test                    |
| ---- | --------------------- | ---------------------------- |
| MF-1 | `manifest`            | `lab-phase4-sendout` S6, S10 |
| MF-2 | `manifest`, `code128` | `lab-phase4-sendout` S6      |
| MF-3 | `manifest`            | `lab-phase4-sendout` S7, S11 |
| MF-4 | `manifest`            | `lab-phase4-sendout` S6      |

**Results back (6.3)**

| Rule  | Unit test          | Lane test                                                                      |
| ----- | ------------------ | ------------------------------------------------------------------------------ |
| RB-1  | `referral-results` | `lab-phase4-results-back` S20                                                  |
| RB-2  | `referral-results` | `lab-phase4-results-back` S21                                                  |
| RB-3  | `referral-results` | `lab-phase4-results-back` S20, S22, S23                                        |
| RB-4  | `referral-results` | `lab-phase4-results-back` S20                                                  |
| RB-5  | `referral-results` | `lab-phase4-results-back` S24                                                  |
| RB-6  | `referral-results` | `lab-phase4-results-back` S20                                                  |
| RB-7  | `referral-results` | `lab-phase4-results-back` S25                                                  |
| RB-8  | `referral-results` | `lab-phase4-results-back` S20, S27                                             |
| RB-9  | `referral-results` | `lab-phase4-results-back` S26                                                  |
| RB-10 | `referral-results` | `lab-phase4-exchange` (file "back, to file" from the simulator); S38 if Step 9 |

**Exchange (6.4)**

| Rule  | Unit test                                                   | Lane test                                                  |
| ----- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| EX-1  | `exchange`                                                  | `lab-phase4-data` (append-only), `lab-phase4-exchange` S29 |
| EX-2  | `exchange`                                                  | `lab-phase4-exchange` S29                                  |
| EX-3  | `exchange`                                                  | `lab-phase4-exchange` S30                                  |
| EX-4  | `exchange` (back-off, jitter, cap)                          | `lab-phase4-exchange` S31                                  |
| EX-5  | `exchange`                                                  | `lab-phase4-exchange` S29, S32                             |
| EX-6  | `exchange`                                                  | `lab-phase4-exchange` S30                                  |
| EX-7  | `exchange`                                                  | `lab-phase4-tracking` S15                                  |
| EX-8  | `exchange`                                                  | `lab-phase4-simulator` (zone and skew)                     |
| EX-9  | `log-scan`                                                  | `lab-phase4-exchange` S35                                  |
| EX-10 | `exchange` (the simulator adapter implements the interface) | `lab-phase4-simulator`                                     |

**Matching (6.5)**

| Rule | Unit test                                           | Lane test                                 |
| ---- | --------------------------------------------------- | ----------------------------------------- |
| MA-1 | `match`                                             | `lab-phase4-exchange` S32, S33            |
| MA-2 | `match`                                             | Gap (S44, S45 if Step 10)                 |
| MA-3 | `match` (every reason code)                         | `lab-phase4-exchange` S32, S33            |
| MA-4 | `match`                                             | `lab-phase4-exchange` S34                 |
| MA-5 | `match`                                             | `lab-phase4-exchange` S32                 |
| MA-6 | `match`                                             | `lab-phase4-exchange` S32                 |
| MA-7 | `match`                                             | `lab-phase4-simulator` (not ours, notice) |
| MA-8 | `match` (against `lab_stock_lots` of control items) | Gap (S46 if Step 10)                      |
| MA-9 | `match`                                             | Gap (S44 if Step 10)                      |

**The analyser bridge (6.6)**: AB-1 to AB-15 are **gap** until Step 10 is built. If it is, each has a test in unit
`analyser` (server side) or the bridge's own suite, and a lane scenario: AB-3 S41, S43; AB-4 S42; AB-5 S41; AB-6 S51;
AB-7 S49; AB-8 S44; AB-9 S45; AB-10 S48; AB-11 S47; AB-12 a test that order download is off; AB-13 a heartbeat test;
AB-14 S50; AB-15 the GATE A evaluation (a document, not a test).

**FHIR (6.7)**

| Rule | Unit test                                                                 | Lane test              |
| ---- | ------------------------------------------------------------------------- | ---------------------- |
| FX-1 | `fhir-referral`                                                           | S37 if Step 9          |
| FX-2 | `fhir-referral`                                                           | `lab-phase4-simulator` |
| FX-3 | `fhir-referral`                                                           | `lab-phase4-simulator` |
| FX-4 | `fhir-referral` (no LOINC without a signed mapping)                       | —                      |
| FX-5 | `fhir-referral`                                                           | —                      |
| FX-6 | `fhir-referral`                                                           | —                      |
| FX-7 | `fhir-referral` (the structural check; inbound "profiled, not base" flag) | `lab-phase4-simulator` |

**Partners (6.8)**

| Rule | Unit test  | Lane test                                               |
| ---- | ---------- | ------------------------------------------------------- |
| PT-1 | `partners` | `lab-phase4-partners` S1                                |
| PT-2 | `partners` | `lab-phase4-partners` S2                                |
| PT-3 | `partners` | `lab-phase4-partners` S2                                |
| PT-4 | `partners` | `lab-phase4-partners` S3                                |
| PT-5 | `partners` | `lab-phase4-sendout` (printed form uses the field list) |
| PT-6 | `partners` | `lab-phase4-partners` S4                                |

**HMIS (6.9)**

| Rule  | Unit test   | Lane test             |
| ----- | ----------- | --------------------- |
| HM-14 | `hmis-10-4` | `lab-phase4-hmis` S28 |
| HM-15 | `hmis-10-4` | `lab-phase4-hmis` S28 |
| HM-16 | `hmis-10-4` | `lab-phase4-hmis` S28 |
| HM-17 | `hmis-10-4` | `lab-phase4-hmis` S28 |

**National (6.10)**: NX-1 is tested now by unit `national-gate`. NX-2 to NX-6 are **gap** until GATE N; NX-6 (the
paper path) is S27.

**Laws** with a test of their own: Law 2 (unit `no-remembered-codes` also checks that nothing in Phase 4 writes the
hub's availability), Law 3 (`no-remembered-codes`: no LOINC pattern, partner code, turnaround or conversion in code,
seeds or copy), Law 9 (`national-gate`), Law 13 (unit `ui` red scarcity), Law 15 (`flags-off`), Law 16 (unit `copy`:
en-GB, dates `13 OCT 2026`).

### a.4 RLS probe matrix (Step 2, lane `lab-phase4-data`)

Every new table: RLS enabled and forced; INSERT, UPDATE and DELETE revoked from `anon` and `authenticated`; person
writes only through server actions as the clinical writer; reads scoped to `private.current_hospital_id()`; tables
with patient rows further limited through `accessible_patient_ids()`.

**Service identities are not Supabase users** (settled in `gate-a-proposal.md` §4). The inbound route checks the
sender's access token (issued by `/api/exchange/token` from a signed JWT assertion) and then, on the server's own
connection, calls one function, `private.exchange_store_inbound(sender_id, …)`, which takes the hospital from the
sender row, never from the caller. `EXECUTE` on it is revoked from `anon` and `authenticated`, so no client can call
it. The "`svc.*`" columns below are probed by calling that function and the config reader with each sender bound,
and by asserting the token's sender can reach nothing else.

Key: **R** read · **R\*** read with Law 12 (restricted shown as "Restricted test", no result) · **own** only its own
rows · **agg** counts only, through a definer function, no ids · **—** denied · **ins** insert through the definer
function only.

| Object                                                                               | Lab staff (with perm)     | Lab user, no restricted access | Lab lead               | DP lead | Clinician                                   | Hospital admin             | `svc.bridge`                   | `svc.partner`                  | Other hospital | Superadmin (no break-glass) | Anon |
| ------------------------------------------------------------------------------------ | ------------------------- | ------------------------------ | ---------------------- | ------- | ------------------------------------------- | -------------------------- | ------------------------------ | ------------------------------ | -------------- | --------------------------- | ---- |
| `lab_partners`                                                                       | R                         | R                              | R                      | R       | —                                           | R (no legal files)         | —                              | own                            | —              | —                           | —    |
| `lab_signed_configs` kinds `partner_tests`, `partner_packing`                        | R                         | R                              | R                      | R       | —                                           | —                          | —                              | own                            | —              | —                           | —    |
| `lab_signed_configs` kinds `partner_legal`, `partner_fields`                         | R                         | R                              | R                      | R       | —                                           | —                          | —                              | —                              | —              | —                           | —    |
| (no separate connection table: a partner's connection is its `exchange_senders` row) | R                         | R                              | R                      | R       | —                                           | —                          | —                              | own                            | —              | —                           | —    |
| `lab_referrals`                                                                      | R\*                       | R\*                            | R\*                    | —       | R on orders they may open                   | agg                        | —                              | —                              | —              | —                           | —    |
| `lab_referral_events`                                                                | R\*                       | R\*                            | R\*                    | —       | R on orders they may open                   | —                          | —                              | —                              | —              | —                           | —    |
| `lab_manifests`, `lab_manifest_items`, `lab_manifest_prints`                         | R\*                       | R\*                            | R\*                    | —       | —                                           | —                          | —                              | —                              | —              | —                           | —    |
| `specimens.parent_specimen_id` (existing table)                                      | as today                  | as today                       | as today               | —       | as today                                    | —                          | —                              | —                              | —              | —                           | —    |
| `diagnostic_reports` provenance columns, `lab_result_snapshots` partner range        | as today                  | R\*                            | as today               | —       | R where they may open the result            | —                          | —                              | —                              | —              | —                           | —    |
| `lab_result_attachments`; bucket `lab-report-scans`                                  | R\* (signed URL)          | R\*                            | R\*                    | —       | R signed URL where they may open the result | —                          | —                              | —                              | —              | —                           | —    |
| `lab_transcription_checks`                                                           | R\*                       | R\*                            | R\*                    | —       | —                                           | —                          | —                              | —                              | —              | —                           | —    |
| `exchange_messages` (raw payload)                                                    | — (list without payload)  | —                              | R with reason, audited | —       | —                                           | —                          | ins (own hospital, own sender) | ins (own hospital, own sender) | —              | —                           | —    |
| `exchange_events`, `exchange_outbox`                                                 | R (no PHI columns)        | R                              | R                      | —       | —                                           | agg                        | —                              | —                              | —              | —                           | —    |
| `lab_match_items`, `lab_match_resolutions`                                           | R\* (values hidden, MA-5) | R\*                            | R\*                    | —       | —                                           | —                          | —                              | —                              | —              | —                           | —    |
| `exchange_senders` (public keys, revoked at), `exchange_tokens`, `exchange_jti`      | —                         | —                              | R                      | —       | —                                           | —                          | own                            | own                            | —              | —                           | —    |
| Analyser tables (**Step 10 only; not built in this slice**, A5)                      | R                         | R                              | R                      | —       | —                                           | —                          | own config                     | —                              | —              | —                           | —    |
| Shadow comparisons (Step 10 only; not built)                                         | R                         | R\*                            | R                      | —       | —                                           | —                          | —                              | —                              | —              | —                           | —    |
| `hospital_designations` (DP lead, IPC lead)                                          | R                         | R                              | R                      | own     | —                                           | R (and writes, via action) | —                              | —                              | —              | —                           | —    |
| Live events `referral_updated`, `match_waiting`, `message_dead`                      | hear                      | hear (no PHI anyway)           | hear                   | —       | —                                           | —                          | —                              | —                              | —              | —                           | —    |

Two rows apply to every object:

| Probe                                                                                                                                                                                              | Expected                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Any client, direct INSERT, UPDATE or DELETE                                                                                                                                                        | Denied everywhere                                                  |
| Any actor, UPDATE or DELETE on `lab_referral_events`, `lab_manifest_prints`, `exchange_messages`, `exchange_events`, `lab_match_resolutions`, `lab_result_attachments`, `lab_transcription_checks` | Denied, **including the service-role path** (triggers, not grants) |

Service-identity probes also assert: a sender cannot insert for another hospital or under another sender's id; it
cannot read any message, including its own, after insert; it cannot read `patients`, `encounter_orders`,
`specimens`, `diagnostic_reports` or `clinical_observations`. A revoked identity is refused on its next call.

### a.5 Partner simulator (Step 8)

Test-only code in `tests/lab/phase-4/simulator/`: a FHIR R4 sender and receiver and an HL7 v2 sender, built as an
adapter (EX-10) so the same interface is exercised. Messages are generated from fixture referrals with fixture
patients; no real code or range is used (codes are fixture strings marked as such). The suite runs in lane
`lab-phase4-simulator`.

| Case                        | Sent                                                                                   | Expected                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Clean result                | One result for one open referral, identity agrees                                      | Stored, acknowledged, parsed, matched; lands "back, to file" (RB-10); filed by a lab user once                                     |
| Malformed                   | Truncated JSON; bad MLLP framing; a Bundle with no Observation                         | Stored, acknowledged, then `unreadable` with the parse error; dead; nothing filed                                                  |
| Duplicated ×3               | The same message three times, same id; then same content, new id                       | One message processed; two duplicate events; one filed row (EX-3, EX-6)                                                            |
| Out of order                | `completed`, then an earlier `in-progress`                                             | The earlier one stored and shown, not applied (EX-7)                                                                               |
| Wrong patient               | Form number of referral A, name and date of birth of patient B                         | `demographics_disagree`; values hidden; nothing filed                                                                              |
| Ambiguous                   | A form number on two open referrals                                                    | `ambiguous`; nothing picked                                                                                                        |
| Not found                   | A form number on no referral                                                           | `not_found`; nothing created                                                                                                       |
| Partner not enabled         | A message from a sender whose connection is off                                        | Stored; `partner_not_enabled`                                                                                                      |
| Partner down → retry → dead | Outbound to a simulator returning 503, then timing out                                 | `retrying` with growing gaps (fake clock), `delivered` when it returns; past the attempt limit, `dead`, shown under Needs a person |
| Late Task status            | `rejected` after `completed`                                                           | Stored, not applied; terminal state holds                                                                                          |
| Non-conformant but profiled | A result shaped like H5 (not base R4)                                                  | Accepted and flagged "profiled, not base" (FX-7)                                                                                   |
| Bad credentials             | Expired token, wrong audience, another hospital's path, replayed `jti`, revoked sender | 401 or 403; **nothing stored**                                                                                                     |

After the whole suite: the count of `patients`, `encounter_orders` and `specimens` is unchanged (S34, MA-4).

### a.6 Kill between store and process

- **Lane (S29):** the inbound handler commits the message, then the processor is made to throw before its own
  commit. A new worker run picks up the `received` message and processes it once. Re-running it again changes
  nothing (EX-6).
- **Owner (`tests/lab/phase-4/kill/inbound-kill.mts`, against dev Supabase):** a child process posts 200 messages
  and is killed with SIGKILL at random points; the worker is killed between claim and commit. Afterwards every
  acknowledged message exists exactly once, every one reaches a final state, and no result is filed twice. Run by
  the owner because PGlite has one connection and cannot be killed mid-transaction. The script prints counts only.

### a.7 Log scan for PHI

Unit `log-scan`: the simulator suite runs with a capturing logger in place of the app logger. The scan fails on any
fixture patient's name, date of birth, hospital number, NIN, or any raw payload fragment longer than the fixture's
form number. It also scans live-event payloads and the "about" column. Step 12 adds a check that error reports do not
carry request bodies (HZ-4-35).

### a.8 Load test

`tests/lab/phase-4/load/inbound-load.mts`, run by the owner against a preview deployment on the dev database: 500
inbound messages in one minute from the simulator (a mix of clean, duplicate and wrong-patient). Reports p50 and p95
for store and acknowledge (budget p95 < 300 ms), inbound to filed (p95 < 5 s), outbox pick-up (p95 < 10 s), and the
counts: stored, duplicates, filed, waiting. The test passes only with zero lost and zero filed twice. PGlite cannot
measure this; the lane only proves correctness.

### a.9 Other checks run at every STOP from Step 4

- unit `ui`: `renderToStaticMarkup` of every new component; no red fills and no green (Law 13); every chip has a
  word and an icon; the provenance block has no left-edge bar (STOP 0 difference 10).
- unit `copy`: every Appendix A key exists, word for word, in `content/lab-phase-4.ts`; `LAB4_COPY_STATUS` blocks
  production while `draft`; no number inside copy except placeholders.
- unit `no-remembered-codes` and `national-gate` (Laws 3 and 9).
- harness: axe-core on each page state; keyboard path through To refer, the manifest, paper entry and the queue.

### a.10 Conditional steps: tests if their inputs arrive

| Step | Input that unlocks it                                                                  | Tests                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9    | A partner's interface document, test environment, signed agreement                     | Lane `lab-phase4-partner-link` with the adapter against the simulator first, then a recorded run against the partner's test environment: S37 (Bundle carries only signed fields; Task updates move the referral), S38 (MA-1, "back, to file", filed), S39 (disable stops sending at once), S40 (GATE S record)                                                                    |
| 10   | The maker's LIS document for the model on site                                         | Recorded messages from the document or captured on site with patient data replaced; a serial and TCP simulator in the bridge's own tests; lane `lab-phase4-analyser` S41–S51; the shadow comparison report (S50); the network-drop test (S42: an hour without network, delivered in order, none lost, none doubled) and the bridge kill test (S43) on site hardware, by the owner |
| 11   | Per system: a written specification, signed agreement, test environment, named contact | One adapter per system on the same store and matching; tests from the specification's own examples only; at an A-LIS site, the two-week "no result typed twice" trial (NX-3)                                                                                                                                                                                                      |

Until then each step's STOP shows its gap report and unit `national-gate` (for Step 11).

STOP 0 recorded that Q6's wording lets Step 9 build an adapter **against the simulator only, disabled**, while
Step 9's own text says "write the gap report and STOP". GATE A must pick one. This plan assumes the gap report only;
the Step 8 simulator already exercises the adapter interface.

### a.11 What no test here proves

- A real race between two connections (PGlite is one connection). The owner's kill and load scripts are the nearest.
- The barcode printed on paper and read by the site's scanners (owner, STOP 5).
- The real rider, courier and reference lab: S5 to S19 use fixture events.
- A real partner or analyser: Steps 9 and 10 are gap reports.
- Malware in a scan (no scanning exists).
- The p95 budgets on Vercel in Kampala, other than by the owner's load run.

---

## (b) Rollout plan (D-LAB4-26 order)

Flags are env, `"1"` or hospital ids, all off by default, one helper each beside `phase3()` in `lib/lab/feature.ts`,
each also blocked in production while `LAB4_COPY_STATUS` is `draft`. Env names are proposals.

| Flag                  | Env                     | Needs (proposed)                                               |
| --------------------- | ----------------------- | -------------------------------------------------------------- |
| `labReferral`         | `LAB_REFERRAL`          | `LAB_ONE_MENU`, `LAB_HIGH_RISK`, `LAB_UNITS_RANGES`            |
| `labExchange`         | `LAB_EXCHANGE`          | `LAB_REFERRAL`                                                 |
| `labAnalyserBridge`   | `LAB_ANALYSER_BRIDGE`   | `LAB_EXCHANGE`, `LAB_BENCH`; GATE A to decide on `LAB_QC_HOLD` |
| `labNationalExchange` | `LAB_NATIONAL_EXCHANGE` | `LAB_EXCHANGE` and a GATE N record per system                  |

**Before any flag, at any site:** migrations 0150 onward applied by the owner (`cd <worktree> && npm run
db:migrate`); the `lab-report-scans` bucket created; the cron entry for `/api/cron/exchange-outbox` with its Vault
secret (STOP 0 Q13); `LAB4_COPY_STATUS` signed by the CSO, with the IPC lead's signature on "High-risk referral";
this hazard log signed. **At an A-LIS site all four stay off** (D-LAB4-24).

### b.1 `labReferral` (paper, at the pilot site)

| Entry criteria                                                                                                                                    | Owner action (STOP 0) |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 90 days of the referral book read: destinations, tests, volume, forms, transport, how results return                                              | Q3                    |
| Each destination in the partner register with its tests, codes, stated turnaround and requirements, signed by the laboratory lead from the source | Q3                    |
| Each destination's packing checklist signed by the laboratory lead (WHO 2025–2026 guidance and the destination's instructions)                    | Q3, H11               |
| The hub rider's schedule and who signs at handover, on the manifest sign-off                                                                      | Q4                    |
| The data protection lead designated; the legal basis recorded for each destination; field lists signed                                            | Q11                   |
| The IPC lead, the district surveillance focal person and the outbreak procedure named (or "none written" recorded); the high-risk wording signed  | Q12                   |
| `LAB_HIGH_RISK` on at the site (HZ-4-40)                                                                                                          | —                     |
| S1–S28 green; the manifest print scanned with the site's scanners; timed trials at the site                                                       | —                     |

| Exit criteria (before `labExchange` turns on)                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One full month with zero referred specimens without a record between To refer and a result or a decision (§13)                                                                                                                                               |
| Every referred result in that month on its original order, with a scan; none flagged against this hospital's range                                                                                                                                           |
| Zero high-risk specimens on a routine manifest; zero manifests with a name                                                                                                                                                                                   |
| One-person entries checked by the next shift, or each open one explained                                                                                                                                                                                     |
| **HMIS 10.4:** the turnaround definition confirmed with the Division of Health Information (Q14); one month in parallel with the hand count; every difference explained; then the manual cells retire for months when `labReferral` was on all month (HM-16) |
| The laboratory lead's statement that the paper register can stop, or the decision to keep both                                                                                                                                                               |

### b.2 `labExchange` (simulator, then the first partner if any)

| Entry criteria                                                                                                                                                                               | Owner action |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `labReferral` exit criteria met at the site                                                                                                                                                  | —            |
| S29–S36 green; the simulator suite green; the log scan clean; the owner's kill and load runs reported                                                                                        | —            |
| The matching rule and manual filing countersigned by the CSO (D-LAB4-12)                                                                                                                     | —            |
| Operational settings set by the owner: attempt limit, back-off cap, skew threshold, oldest-waiting age                                                                                       | —            |
| For a partner: its document, test environment, signed agreement with processor terms, complete legal record, PDPO registration on file; GATE S passed for its credentials and endpoint (S40) | Q6, Q11      |

Without a partner, `labExchange` turns on only to show Connections honestly ("Not connected: …") and to hold
messages from the simulator in a test hospital. It does not change the paper path.

| Exit criteria                                                                                                 |
| ------------------------------------------------------------------------------------------------------------- |
| Zero results filed to the wrong patient; zero patients, orders or specimens created from a message            |
| Zero messages lost; zero filed twice                                                                          |
| The reconciliation queue and dead letters worked to empty, or each item explained, every week                 |
| D-LAB4-11 review after three months with no mismatches (automatic filing is a later decision, not this slice) |

### b.3 `labAnalyserBridge` (one analyser, shadow, then live)

| Entry criteria                                                                                                     | Owner action |
| ------------------------------------------------------------------------------------------------------------------ | ------------ |
| The exact model and firmware; **the maker's LIS document** for it                                                  | Q7           |
| Where the bridge runs, power, UPS, network, outbound internet, who holds the hardware                              | Q8           |
| D-LAB4-14 decided (build or reuse); the bridge's dependencies listed and reviewed                                  | —            |
| GATE S passed: pairing, signed JWT, scopes, no inbound port from the internet, dependency review (S51)             | —            |
| The code and unit mapping signed by the laboratory lead from the maker's document; flag meanings signed where used | Q7           |
| S41–S49 green against recorded messages and on site                                                                | —            |

| Shadow, then live                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shadow for the period the laboratory lead signs (D-LAB4-16 recommends two weeks or 200 specimens, whichever is later)                                                     |
| Exit to live: zero unexplained differences; the shadow comparison signed by the laboratory lead (S50)                                                                     |
| Exit from live: no interfaced result released without a technologist; none through a QC hold without an override; zero lost or doubled in the drop and kill tests on site |

### b.4 `labNationalExchange` (only past GATE N)

| Entry criteria (per system: IRRDS and ResTrack, A-LIS, the LDR)                                           | Owner action |
| --------------------------------------------------------------------------------------------------------- | ------------ |
| The letter to NHLDS sent from the hospital, and its answer recorded                                       | Q5           |
| A written specification, a signed data-sharing agreement, a test environment and a named contact (GATE N) | Q5           |
| GATE S for the connection                                                                                 | —            |

| Exit criteria                                                                                            |
| -------------------------------------------------------------------------------------------------------- |
| At an A-LIS site: no result typed twice over a two-week trial (NX-3)                                     |
| For IRRDS and ResTrack: CPHL barcode as join key; ResTrack events map to RF-3; results file only by MA-1 |
| For the LDR: exactly what the specification and agreement say                                            |

Until GATE N: "Not connected" with Appendix A's reason, and the paper path (NX-6).

---

## (c) User-guide outline (Step 12)

**1. Sending specimens out** (technologist, `lab.refer`)

- What To refer shows: why each specimen is here and where it usually goes.
- Choosing a destination: why some are greyed out.
- Scanning their form numbers and ticking the packing list.
- Sealing and printing the manifest; why it has no names; reprints say "Copy".
- Handing over to the rider: what to record.
- Splitting one tube for two destinations (aliquots).
- A high-risk specimen: the outbreak referral, and who to tell.

**2. Tracking referrals** (technologist, laboratory lead)

- Reading Now and Expected; what "Not stated" means.
- Recording an update from the rider's book or a phone call.
- Overdue: what to do and who to call.
- Rejected by the reference lab: telling the doctor and recollecting.
- Cancelled by the doctor after sending.
- Marking a specimen lost.
- What the doctor sees on the order.

**3. Results back** (technologist, `lab.refer.result`)

- Opening the referral and typing the identity from the paper; what a mismatch does.
- Units and ranges as printed; "No range printed"; an unknown unit.
- Scanning the report.
- The second-person check, and "Entered by one person".
- A critical value on a referred result.
- A corrected report.
- VL dashboard, LabRDS and LabXpert printouts.
- HMIS 10.4 from records.

**4. Reconciliation** (`lab.match.resolve`)

- Why a result waits here: each reason in words.
- Reading the comparison: Same, Differs, Cannot compare.
- Asking the reference lab first.
- Filing after confirming: what counts as confirmation; the second person.
- Not ours: sending it back.
- Dead letters and retries on Connections; opening the raw message with a reason.

**5. Analysers** (laboratory lead, `lab.analyser.manage`; only where Step 10 is built)

- What the bridge is and where it runs.
- Pairing a bridge; revoking one.
- Signing the code and unit mapping from the maker's document.
- The shadow run and signing it.
- Releasing interfaced results; editing a value with a reason.
- "Not heard since": going back to typing.

**6. Partners and data protection** (laboratory lead, data protection lead)

- Adding a partner, its tests, codes and stated turnaround, from its own document.
- Signing a packing checklist.
- The legal record: basis, agreement, processor terms, PDPO registration, breach contact.
- The field list: what is never sent.
- Partners abroad: safeguards or the patient's consent.
- When a review date passes.

---

## (d) ADR drafts (0312–0329 claimed in `docs/NUMBERS.md`; numbers proposed)

**0312 Referrals belong to the original order; the status model is FHIR R4 Task.** A referral is a row on the
original order line and specimen, created only from To refer, one per specimen per destination, with aliquots as
child specimens. Its state is derived from append-only events in event-time order and mapped to `Task.status` by the
RF-3 table, so paper, partners and national systems share one model. Overdue is computed from the partner's signed
stated turnaround and never stored; with none stated, never overdue.

**0313 Manifests carry no patient names.** A manifest belongs to one partner and one transport and lists lab
numbers, their identifiers, specimen, containers, test and collected time only. Its number prints as Code 128.
Sealed manifests never change; every print is audited and reprints say "Copy". A high-risk specimen never joins one.
GATE A records whether restricted tests print as the partner's code only (HZ-4-30).

**0314 Results back: provenance on the report, the reference lab's units and ranges, scans, a second check.** A
returned result files through `writeReportVersion` on the original order, filling the existing
`diagnostic_reports.performer`, `performer_lab_name` and `entry_mode` and adding provenance, rather than a parallel
result store (STOP 0 items 2 and 3). Units must exist in the registry; ranges are the reference lab's as printed and
flag only against themselves; this hospital's critical limits still apply in its unit. A scan is required; a second
person checks when one is on duty, otherwise the result carries "Entered by one person" and a next-shift check.

**0315 The exchange module: append-only store, store before acknowledge, outbox, de-duplication.** Every message in
or out, whatever the channel, lives in `exchange_messages`; it is committed before any acknowledgement, which means
"held", not "filed". Duplicates by sender id and content hash are acknowledged and not processed. The outbox retries
with operational back-off and ends in dead letters that are never purged. Filing is idempotent by message hash and
component. The module is generic (`lib/exchange/**`) and connections are adapters behind one interface.

**0316 The matching rule and the reconciliation queue.** A partner result files only when its identifier maps to
exactly one open referral and name with date of birth, or the hospital number, agrees; an analyser result only when
its sample id maps to exactly one received specimen with a mapped code, matching unit and an unreleased component.
Everything else waits with one reason, values hidden. MedSync never creates a patient, order or specimen from a
message and never picks a candidate. Manual filing needs a confirmation type, a second person and a reason.

**0317 The analyser bridge: build or reuse, drivers from makers' documents, shadow run.** Records D-LAB4-14 after the
GATE A evaluation of the OpenELIS Analyzer Bridge (MPL-2.0) against AB-1 to AB-13. The bridge is a separate
deployable that connects outbound only, stores before ACK, and posts preliminary results. Driver profiles and
mappings come only from the maker's document. Live follows a shadow run with zero unexplained differences, signed by
the laboratory lead. Today this ADR also records that no maker's document is in hand, so no bridge code exists.

**0318 Machine identities authenticate with a signed JWT.** Vercel terminates TLS and documents no client-certificate
verification (checked 17 OCT 2026), so mutual TLS to the app would need a proxy in front of it. Every machine
(bridge or partner) therefore authenticates with SMART Backend Services: a per-sender key pair, the public key held
server-side, a signed JWT with a short lifetime and a single-use `jti`, `system/` scopes for its own inbound endpoint
and configuration, no refresh tokens, revocation read on every call. The database side is one definer function under
a dedicated role. Mutual TLS stays an option only on the bridge's LAN side or if the app is ever self-hosted. Cron
callers move off the non-constant-time Bearer compare in the same change.

**0319 Partners' legal records and field lists under the DPPA, and the data protection lead.** Each partner has a
legal record (basis under s.7(2), agreement and review date, processor terms under s.21, cross-border under s.19,
the hospital's PDPO registration under s.29, breach contact under s.23) and a field list, both versioned and signed
by the designated data protection lead, a new per-hospital designation. Diagnosis, phone and address are never on a
field list. Electronic sending is refused without a complete record, and abroad without safeguards or consent.

**0320 National connections are built only past GATE N.** No IRRDS, ResTrack, A-LIS or LDR code exists until NHLDS or
MoH gives a written specification, a signed data-sharing agreement, a test environment and a named contact. No
scraping, no endpoints from other projects' configuration. Until then the paper form, the hub rider and typed entry
with the printout attached are the path, and Connections says so. A test keeps the gate.

**0321 A Code 128 encoder in the repo, with no dependency.** No barcode library exists and Law 15 forbids adding one
without stopping. Code 128 is a fixed table and a check character, so a small pure encoder rendering SVG bars is
written in `lib/lab/` with tests and proven on the site's scanners. Lab numbers keep their `L` and eight digits
format (STOP 0 item 1); labels may use the encoder later.

**0322 The `lab_` prefix for the lab's tables; `exchange_` stays generic.** `referrals` and `partners` would collide
in meaning with the patient referrals that already exist (`encounter_orders.kind referral`, `referred_out`), so the
lab's tables are `lab_referrals`, `lab_partners`, `lab_manifests` and so on. The exchange tables stay `exchange_*`
because pharmacy, radiology and the national HIE will reuse them (E-LAB4-01).

**0323 Report scans: a private hospital-scoped bucket, with no virus scanning yet.** A new `lab-report-scans` bucket
with paths `{hospitalId}/{referralId}/{uuid}` and no client policies; uploads by a server-minted signed URL with a
server re-check of size and type; reads by short signed URLs after an RLS-checked read, audited. No virus scanning
exists on the branch; this is recorded as a residual risk (HZ-4-36), not solved.

**0324 FHIR output is checked structurally, not by a full R4 validator.** A validator is a new dependency. Instead a
small structural check of the five resources we emit (required elements, cardinality, the value sets we use) lives
beside `lib/emr/fhir.ts`, which gains `Task` and a `transaction` Bundle. Inbound messages that parse under the
partner's profile are accepted and flagged when not base-conformant. The ADR says plainly that this is not R4
conformance.

**0325 HMIS 10.4 from records.** Number referred, average turnaround and pending come from referrals, with the
referral ids as each cell's sources, when `labReferral` was on for the whole month; otherwise the Phase 3 manual
cells stay. All three cells were manual before (STOP 0 item 9, wider than HM-6 said). Turnaround follows the
Division of Health Information's definition; any alternative is shown labelled.

**0326 Live events for referrals and exchange come from the new event tables.** LV-1's `referred` event was never
sent (STOP 0 item 6). Rather than widen the Phase 2 trigger, the new event tables broadcast `referral_updated`,
`match_waiting` and `message_dead` on `lab:{hospitalId}`, ids and counts only, no PHI.

0327–0329 spare.

---

## For the GATE A author: decisions this plan leaves open

1. Step 9: gap report only, or an adapter built against the simulator and left disabled (Q6 and Step 9 disagree).
2. Whether the "rule IDs without a test: 0" metric excludes rules of gap steps (AB-\*, MA-2 lane, NX-2 to NX-6).
3. `labReferral` requiring `LAB_HIGH_RISK` (HZ-4-40); `labAnalyserBridge` requiring `LAB_QC_HOLD` (HZ-4-11).
4. Escalation for the queue, dead letters and open one-person checks (HZ-4-24, 29, 33): inform only, or notify the
   laboratory lead past an operational age.
5. Restricted tests on the printed manifest: test name or partner code only (HZ-4-30).
6. The checker's "scan shows report {number}" tick (HZ-4-26).
7. The wording when a printed unit cannot be converted for the critical check (HZ-4-07).
8. Whether the clinical question is ever sent electronically (HZ-4-20).
9. The database role and definer function for service identities, and per-request JWT assertions versus a token
   endpoint (ADR 0318).
