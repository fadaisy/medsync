# Lab Phase 4: STOP reports

## STOP 0: Discovery and baseline (17 Oct 2026)

Nothing in the product changed at this step. Branch `feat/lab-connect-outward`, cut from `main` at 446a0cc9 (Lab
Phase 3 and its signed copy merged, PRs #236 and #237). The owner (Fadhul, CSO) told the session to go through every
step, so the real-world inputs this step cannot get from the repo (the site's referral book, the rider's schedule,
the maker's interface document, the PDPO registration, the outbreak procedure, the letter's answer) are recorded
as **owner actions** instead of stopping. Each one becomes data the lab enters or signs later in the product;
nothing is guessed in its place. Migrations 0150–0169 and ADRs 0312–0329 are claimed in `docs/NUMBERS.md`.

The canvas (10 artboards) was read. The PGlite lane was re-linked (`node_modules/@electric-sql`, ADR 0133) and the
Phase 3 RLS suite passes on it (29 of 29).

### The ten things later steps most need to know

1. **A lab number is `L` and eight digits** (`lab_labels.label_no`, default `'L' || lpad(seq, 8, '0')`,
   `0109_lab_one_menu.sql:19`), not `L-000…` (H24 corrected). It prints as mono text today
   (`components/emr/orders/specimen-label.tsx:53`); **no Code 128 encoder or barcode library exists**. Scanning is a
   keyboard-wedge scanner (ADR 0257 §3). The manifest barcode needs a small pure Code 128 encoder (no dependency).
2. **The record already has the slots for a result done elsewhere.** `diagnostic_reports.performer`
   (`in_house|external`), `performer_lab_name` and `entry_mode` (`direct|transcribed|interface`, "interface
   reserved") exist (`db/schema/emr.ts:623-682`); `encounter_orders.performer` allows `referral`
   (`0071:393-407`). Phase 4 fills them and adds provenance, not a parallel result store.
3. **Release goes through one function.** `writeReportVersion` (`lib/emr/write/results.ts:367`, not exported) is
   reached by `enterResults`, `releaseResults`, `amendResults` and `withdrawPreliminary`; the QC gate is `qcGate`
   (:203, called :426) and the lots-in-use snapshot goes to `lab_result_snapshots`. `performer` is derived from the
   order (:576). Referred and interfaced results must go through this function, extended, never beside it.
4. **To refer is a computed list with no table and no action** (`app/lab/refer/page.tsx:23-106`, rows from
   `loadLabWorklist` filtered to `referred`/`down_referred`). Its own comment says send-out is Phase 4.
5. **The hub's referral fields are free text.** `diagnostic_offerings.referred_to` (≤120 chars) and `stated_tat`
   (≤40 chars, "operational, never a clinical target") (`0080_hospital_services_hub.sql:190-191`). No partner id, no
   turnaround value or unit. RF-5 needs a structured, signed turnaround: it lives in the partner register
   (`lab_partner_tests`), and the hub keeps availability (Law 2).
6. **The live channel has no `referred` event.** LV-1 in the Phase 2 prompt lists `referred` and
   `flagged-high-risk`, but `lab_live_broadcast()` (`0109:183-218`) emits only collected, received, rejected,
   receipt_undone, resulted and released, and `specimen_events.kind` allows only three kinds (H14 partly
   corrected). Phase 4 adds the broadcast on its own event tables.
7. **No machine can authenticate today.** No API key, HMAC, client certificate or third-party JWT exists; crons use
   a shared Bearer compared with `!==` (not constant time). `proxy.ts` gates pages only. **Vercel terminates TLS at its
   edge and documents no client-certificate verification for incoming requests** (checked 17 Oct 2026: its
   infrastructure and encryption pages; an open community request for it), so mutual TLS to the app would need a
   proxy in front of Vercel. D-LAB4-15's alternative (SMART Backend Services, a signed JWT) works without one.
8. **No storage bucket belongs to the lab or to a hospital.** The four buckets are owner-folder scoped
   (`0016`, `0034`, `0056`); `lib/encryption.ts` works on strings only; no virus scanning exists (deferred in
   `docs/phase-1-onboarding-closeout.md:131`). Report scans need a new private, hospital-scoped bucket.
9. **HMIS 10.4 is entirely hand-entered today** (`manualKeys`, `lib/lab/hmis-store.ts:504-507`), wider than HM-6
   said (volume referred was to come from records). A cell carries `sources: string[]` and a manual cell
   `manual: true`; there is no `source` field. HM-14 adds records-based cells with the referral ids as sources.
10. **There is no data protection lead.** `dp.lead` exists nowhere in code; no designation table, no permission.
    `lib/legal.ts` has a `pdpoRegistered` flag for sign-up only. A designation like `hmis_designations` is needed.

### Q1 Phase 2 and Phase 3

Both merged (PRs #229/#230 and #236/#237; `LAB2_COPY_STATUS` and `LAB3_COPY_STATUS` signed). What this slice uses:

| Piece                         | Where                                                                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability                  | `availabilityFor` (`lib/lab/one-menu.ts:33-75`): in_house, referred, down_referred, not_offered, not_linked, unknown; `turnaround`, `referredTo` from the hub                                                                 |
| Availability on the order     | `encounter_orders.availability_snapshot` (0109:57; written `lib/emr/write/orders.ts:395-402`)                                                                                                                                 |
| To refer                      | `app/lab/refer/page.tsx`; nav `lib/lab/nav.ts:144-151` (`oneMenu` + `lab.view`)                                                                                                                                               |
| High-risk mark                | `lab_high_risk_events` per **encounter** (0109:108-122), read by `highRiskFor` (`lib/lab/collection-store.ts:184`)                                                                                                            |
| Analyser profiles             | `analyser_profiles` (0107:129; `device_id` 0113:27), `lib/lab/profiles.ts`                                                                                                                                                    |
| Machines                      | `devices` (0071:114, widened 0110, 0113): state not_verified, in_use, retired, down, blocked                                                                                                                                  |
| Live channel                  | `lab:{hospitalId}`, `lab_live_broadcast()` (0109:183), `private.may_hear_lab` (0109:220)                                                                                                                                      |
| QC status and hold            | `qcGate` (`results.ts:203`), `qc_held text[]` on the report, override `lab.qc.override` (:241)                                                                                                                                |
| Lots in use                   | `lotsAtRelease` (`lib/lab/stock-store.ts:817`) into `lab_result_snapshots.lots`                                                                                                                                               |
| Nonconformities               | `openAutomaticNc` (`lib/lab/nc-store.ts:50`); source CHECK (0114:63-64) has no referral source                                                                                                                                |
| Rejection codes               | `REJECTION_REASONS` (`lib/emr/write/specimens.ts:75`), words `REJECTION_REASON_TEXT` (`lib/emr/orders.ts:216`)                                                                                                                |
| HMIS 10.4                     | `count105` (`lib/lab/hmis105.ts:205`), `manualKeys` (`hmis-store.ts:504`), `saveManualCells` (:520)                                                                                                                           |
| Units, ranges, criticals      | `ucum_units`, `lab_component_measures`, `toCanonical` (`lib/units/conversions.ts:79`); `resolveRange` (`lib/lab/ranges.ts:92`); `evaluateReport` (`lib/lab/limits.ts:257`), `createAlertOnRelease` (`criticals/store.ts:501`) |
| Amendments, correction alerts | `amendResults` (`lib/emr/actions/results.ts:153`) → `correctAlerts` (`criticals/store.ts:1119`)                                                                                                                               |
| Restricted classes            | `test_catalogue.restricted_class`; report `sensitivity='restricted'`; `RestrictedMark`                                                                                                                                        |
| Signed configuration          | `lab_signed_configs` (kinds CHECK 0112:65-68), `signConfig` (`lib/lab/catalogue-v2.ts:277`), `secondFactorFresh()`                                                                                                            |
| Control-material lots         | **no `qc_material_lots`**: controls are `lab_stock_items` kind `control`, lots in `lab_stock_lots`                                                                                                                            |

Q1 passes. Step 1 may start.

### Q2 H1–H24

The external claims (H1–H12, H16–H23) are carried from `LAB-PHASE-4-RESEARCH.md` (compiled 13 Oct 2026, four days
ago) with their H/M/L marks; they were not re-fetched at this step. They are re-checked at the step that uses them
(H16–H20 at Step 10, H1–H4 at Step 11, H11 when a packing checklist is drafted).

| #       | Verdict                                | Note                                                                                                                                                                                                                                                                                                    |
| ------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1–H4   | Carried (H/M)                          | No public spec for IRRDS, ResTrack, A-LIS or the LDR. Step 11 is gap reports unless Q5 brings a specification.                                                                                                                                                                                          |
| H5, H6  | Carried (H for code, L for production) | Barcode as join key is a design precedent only; no endpoint from that repo is used (Law 9).                                                                                                                                                                                                             |
| H7–H12  | Carried                                | Paper and print paths stay first-class.                                                                                                                                                                                                                                                                 |
| H13     | **Confirmed, with limits**             | `lib/emr/fhir.ts` (706 lines, R4) has `toFhirServiceRequest` :461, `toFhirSpecimen` :500, `toFhirDiagnosticReport` :537, `exportBundle` :634 (type `collection`). Export tests only (ADR 0138), no endpoint; 20 tests. **No Task, no transaction Bundle, no validator** (no FHIR schema or dependency). |
| H14     | **Partly corrected**                   | `availabilityFor` returns `referred` and `down_referred` with the hub's stated turnaround: yes. The live event `referred`: **no** (LV-1 lists it; the trigger never sends it).                                                                                                                          |
| H15     | **Corrected**                          | HM-6 said volume from records, turnaround and pending by hand; the code makes **all** 10.4 cells manual.                                                                                                                                                                                                |
| H16–H20 | Carried                                | Step 10 needs the maker's document (Q7); none is in hand.                                                                                                                                                                                                                                               |
| H21–H23 | Carried                                | Used for the status model, profiles and barcodes.                                                                                                                                                                                                                                                       |
| H24     | **Corrected**                          | Lab numbers are `L00000001` (no hyphen) and print as text, not Code 128.                                                                                                                                                                                                                                |

### Q3, Q4, Q6, Q7, Q8, Q11, Q12, Q14: the site's practice (owner actions)

None of these can be read from the repo, and nothing is invented in their place. They are owner actions, each
needed before a named later step goes live, not before it is built:

| Q   | What is needed                                                                                                                                    | Needed before                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Q3  | 90 days of the referral book: destinations, tests, weekly volume, forms (photos of blanks), transport, how results return, results never returned | The partner sign-off packs (Appendix C); `labReferral` on           |
| Q4  | The hub rider's real schedule and who signs at handover                                                                                           | The manifest sign-off; `labReferral` on                             |
| Q6  | Whether any reference lab offers an electronic interface, its document, test environment, agreement                                               | Step 9 (else gap report)                                            |
| Q7  | The first analyser's exact model, firmware, ports, network point, **the maker's LIS document**                                                    | Step 10 (else gap report)                                           |
| Q8  | Where a bridge would run: power, UPS, network, outbound internet, who holds the hardware                                                          | Step 10                                                             |
| Q11 | The hospital's PDPO registration (number, purposes, renewal), the data protection lead, existing agreements, any partner abroad                   | The legal records; any electronic sending                           |
| Q12 | Who packs and carries VHF specimens, the IPC lead, the district surveillance focal person, the outbreak procedure (or that none is written)       | The IPC lead's signature on the high-risk wording; `labReferral` on |
| Q14 | The 10.4 columns on the verified form and the Division of Health Information's turnaround definition                                              | `LAB_HMIS` using records for 10.4 (HM-15)                           |

### Q5 The letter to NHLDS

Drafted for the hospital at `docs/lab/phase-4/letter-to-nhlds.md` (Appendix E, with the blanks the hospital
fills). **Not sent**: it goes from the hospital, on its letterhead, signed by its own officer. Date sent and any
answer are recorded there when they happen. It does not block Steps 1–10; it decides Step 11.

### Q9 `lib/emr/fhir.ts`

See H13. FX-1 needs `Task` and a `transaction` Bundle (new mappers in the same file); FX-7 needs validation against
base R4. No validator exists and adding one is a new dependency (Law 15): GATE A proposes a small structural check
of the five resources we emit (required elements, cardinality, value sets we use) written in the repo, and records
that it is not a full R4 validator.

### Q10 Storage

Four private buckets, all owner-folder scoped; none hospital-scoped; no virus scanning; `serverActions.bodySizeLimit`
is 10 MB (`next.config.ts:11`). The upload pattern to copy is the onboarding one: a server-minted signed upload URL
to a server-chosen path, then a server re-check of size and type before linking
(`app/onboarding/_actions/documents.ts:26-78`). GATE A proposes a private `lab-report-scans` bucket with paths
`{hospitalId}/{referralId}/{uuid}`, no client policies (service role only), reads through short signed URLs minted
after an RLS-checked read, and records "no virus scanning" as a hazard control gap.

### Q13 Jobs and machine endpoints

pg_cron + pg_net exists (0106) and drives `/api/cron/lab-escalations` every minute with a Vault secret; Vercel crons
run daily only. The outbox worker follows the same pattern (`/api/cron/exchange-outbox`, every minute, claim rows
with a conditional UPDATE as `dispatch-reminders` does). No route accepts a machine today (see item 7 above).

### Q15 Playwright, axe, fake clock

**Flagged: Playwright is not installed** (no dependency, no config). `axe-core` is (jsdom over built HTML,
`tests/a11y/static-pages.test.ts`). Phase 3 met the same gap and ran axe-core inside a local screenshot harness
(CDP) on 44 page states; this slice does the same rather than stopping or adding a dependency. Fake clock:
`vi.useFakeTimers`/`setSystemTime` in 7 files; lab engines take `now` as an argument, which this slice keeps.

### Prompt against repo: the differences

| #   | Prompt says                                                            | Repo says                                                                                                      | Proposed at GATE A                                                                               |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Lab numbers `L-000…` printed as Code 128 (H24)                         | `L00000001`, printed as text                                                                                   | Keep the format; add a pure Code 128 encoder for manifests (and later labels)                    |
| 2   | MA-8 matches Phase 3 `qc_material_lots`                                | No such table; control lots are `lab_stock_lots` of `control` items                                            | MA-8 matches `lab_stock_lots` of control items registered on that analyser                       |
| 3   | Tables `partners`, `referrals`, `manifests`                            | Patient referrals exist (`encounter_orders.kind referral`, `disposition referred_out`, intakes)                | `lab_` prefix for the lab's tables; `exchange_*` stays generic (E-LAB4-01)                       |
| 4   | Result components get `source`, `provenance`, `partner_range_snapshot` | Components are `clinical_observations`; the report already has `performer`, `performer_lab_name`, `entry_mode` | Provenance on the report (`diagnostic_reports`), per-value range in `lab_result_snapshots`       |
| 5   | Live events `referral_updated`, `match_waiting`, `message_dead`        | LV-1 never sent even `referred`                                                                                | Broadcast from the new event tables, no PHI                                                      |
| 6   | D-LAB4-15 mTLS first                                                   | Vercel cannot present client certificates to functions                                                         | Signed JWT (SMART Backend Services) for every machine; mTLS only bridge-side if ever self-hosted |
| 7   | HM-6 left volume referred from records                                 | All 10.4 cells are manual                                                                                      | HM-14 replaces all three when `labReferral` was on all month                                     |
| 8   | `specimens.parent_specimen_id`                                         | `specimens` is append-only by trigger; adding a nullable column is safe                                        | Add the column (additive)                                                                        |
| 9   | Nonconformity on lost or discrepancy                                   | NC source CHECK has no referral source                                                                         | Widen the CHECK with `referral` and `manifest` (new migration)                                   |
| 10  | Canvas `.prov` has a 3 px left border                                  | DESIGN-medsync.md bans left-edge accent bars                                                                   | Provenance block in sky tint with a full hairline border, no left bar                            |
| 11  | OM-2 lists `outside_hours`                                             | Not implemented; `not_linked` added                                                                            | Out of scope; recorded                                                                           |
| 12  | Doctor's order line shows "Sent to {destination}"                      | `orderStatusText` has no referred state; shown at `encounter-orders-view.tsx:71`                               | A referral overlay on `statusText` from the referral projection                                  |

### Inputs in hand for the conditional steps

| Step | Needs                                                         | In hand                    | Outcome now                                                    |
| ---- | ------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| 9    | A willing partner, its interface document, a signed agreement | None                       | Gap report; adapter built against the simulator only, disabled |
| 10   | The maker's LIS document for the analyser on site             | None                       | Gap report; no bridge code                                     |
| 11   | NHLDS/MoH specification, agreement, test environment, contact | None (letter not yet sent) | Gap report per system; no code                                 |

### Baseline

- **Failing tests** (`tests/lab/phase-4/baseline.test.ts`, `it.fails`, all three reproduce):
  - (a) a specimen that leaves To refer has no record (no referral table or events);
  - (b) a returned result cannot be filed on the original order with referral provenance;
  - (c) no path keeps the performing laboratory's printed range, so a referred result would be flagged against ours.
- **Screenshots** of To refer, the doctor's order view and results, and the hub's referral fields: taken with the
  harness at Step 4 before the first screen changes (the harness is rebuilt then; Phase 3's was deleted on 17 Oct).

**STOP 0 ends here.** Next: Step 1, the GATE A proposal.

## STOP 1: GATE A proposal (17 Oct 2026)

Documents only. Drafted, critiqued against the Step 1 checklist (two gaps found and fixed: the ASTM and HL7
store-before-acknowledge sequences, and the example Bundles in and out), revised once.

| Part of Step 1                                                                | Where                                                                                  |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Annotated screens                                                             | `gate-a-proposal.md` §8                                                                |
| Referral and manifest state machines, worked examples                         | §5.1 (lost, rejected, cancelled after handover, late status), §5.2                     |
| Message store, outbox, inbound; store before acknowledge for HTTPS, HL7, ASTM | §5.3, §5.3a, §5.4                                                                      |
| Matching rule, a worked example per reason code                               | §6                                                                                     |
| FHIR mapping, example Bundle out and in                                       | §7 (structural check runs on them at Step 3)                                           |
| Bridge decision (D-LAB4-14)                                                   | `bridge-and-security.md` §1: adopt the OpenELIS bridge unchanged + a MedSync companion |
| Security design for GATE S                                                    | `bridge-and-security.md` §2–3 (16-item checklist)                                      |
| Schema diff, RLS probe plan, service identities                               | §3 (0150–0153), §4; `test-and-rollout-plan.md` a.4                                     |
| Sign-off packs                                                                | §9 (templates; no values)                                                              |
| Appendix A strings and status                                                 | §10 (all draft; one string added, A20)                                                 |
| Hazard log                                                                    | `hazard-log.md`: 40 hazards (25 seeded + 15 found)                                     |
| Test plan, rollout, user-guide outline, ADR drafts                            | `test-and-rollout-plan.md` (ADRs 0312–0326)                                            |
| Decision table and signature block                                            | §2 (26 D, 3 E, 21 A, 5 B), §11                                                         |

**Waiting for Fadhul's signature on §2.** Nothing is built before it.

**Signed 17 OCT 2026** by Fadhul: §2 D-LAB4-01…26 and E-LAB4-01…03 as recommended; D-LAB4-09 and D-LAB4-12 as CSO;
A1–A21 accepted; B1–B5 (adopt the OpenELIS bridge with a MedSync companion). Recorded in `gate-a-proposal.md` §11.
Step 2 starts.

## STOP 2: Data layer (17 Oct 2026)

Four GATED migrations, **not applied** (the owner applies them, in order, from this branch's folder):

| Migration                   | What it adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0150_lab_partners.sql`     | `lab_partners`; `hospital_designations` (data protection lead, IPC lead) and `private.designated()`; six signed-config kinds (partner tests, packing, legal, field list, referral wording, referral settings) with their signers; the legal record and field list hidden from clinicians (restrictive policy); nonconformity sources `referral`, `manifest`                                                                                                                                                                                                                                                                                  |
| `0151_lab_referrals.sql`    | `specimens.parent_specimen_id`; `lab_referrals` (one per specimen per destination); `lab_referral_events` (append-only, `applied` for late statuses); `lab_manifests` (forward-only) with items (refused once sealed, refused for an outbreak referral or another partner) and prints (append-only); the `referral_updated` live event; `private.lab_referral_counts` for the hospital admin                                                                                                                                                                                                                                                 |
| `0152_lab_results_back.sql` | `diagnostic_reports.referral_id` and `provenance` (a referred report must be external, on an order, with provenance); `lab_result_snapshots.range_source`, `printed`, `interfaced`; `lab_result_attachments` and `lab_transcription_checks` (append-only); private bucket `lab-report-scans` (10 MB, pdf/jpeg/png, no client policy)                                                                                                                                                                                                                                                                                                         |
| `0153_exchange.sql`         | `exchange_senders` (machine identities; public keys only), `exchange_tokens` (hash only, ≤ 5 min by CHECK), `exchange_jti`; `exchange_messages` and `exchange_events` (append-only; de-duplicated by external id and by content); `exchange_outbox`; `lab_match_items` (one per component, a waiting item must carry its reason) and `lab_match_resolutions` (filing after a mismatch needs a method, a different second person and, for a call, who was spoken to); `private.exchange_store_inbound` (store before acknowledge, hospital from the sender) and `private.exchange_sender_config`; live events `match_waiting`, `message_dead` |

Code: Drizzle tables (`db/schema/lab-exchange.ts` and three columns added elsewhere; parity test 298 of 298),
flags `labReferralLiveFor` and `labExchangeLiveFor` (`lib/lab/feature.ts`), four permissions (`lib/lab/access.ts`)
in a **draft** permission map 3.0.0 (`data/lab/permission-map.v3.json`, for the CSO to sign; until then no cadre
holds the new permissions, while `lab.exchange.manage` comes with headship), and the copy file
`content/lab-phase-4.ts` (`LAB4_COPY_STATUS` draft).

**RLS probe table** (`tests/emr-db/lab-phase4-data.test.ts`, 13 tests, all pass): 17 new tables × 10 actors
(lab staff, lead, data protection lead, IPC lead, hospital admin, treating clinician, a clinician without access,
another hospital, superadmin without break-glass, anonymous).

| Reads                                   | Lab, lead | DP lead | IPC lead | Admin | Treating clinician | Other clinician, other hospital, superadmin, anon |
| --------------------------------------- | :-------: | :-----: | :------: | :---: | :----------------: | :-----------------------------------------------: |
| `lab_partners`                          |    all    |   all   |    —     |  all  |         —          |                         —                         |
| `hospital_designations`                 |    all    |   own   |   own    |  all  |         —          |                         —                         |
| `lab_referrals`, events, scans          |    all    |    —    |    —     |   —   |  their patients'   |                         —                         |
| manifests, items, prints, checks        |    all    |    —    |    —     |   —   |         —          |                         —                         |
| `exchange_*` (no payload), match tables |    all    |    —    |    —     |   —   |         —          |                         —                         |
| `exchange_tokens`, `exchange_jti`       |     —     |    —    |    —     |   —   |         —          |                         —                         |

Also proven: no client INSERT, UPDATE or DELETE on any of the 17; UPDATE and DELETE refused on the service-role
path for the eight append-only tables; no person's role can select the payload, the pairing hash, the public keys
column, tokens or the replay cache; no client can call the two machine functions; a revoked sender cannot store;
a duplicate (same external id, or same content) returns the first message and records a `duplicate` event; an
outbreak referral cannot join a manifest; a sealed manifest cannot reopen or change; one referral per specimen
per destination; the legal record hidden from a clinician; counts only for the admin.

**Fixed on the way:** `tests/lab/feature.test.ts` CF-3 still asserted the Phase 3 copy was a draft (it was signed
on 16 Oct); it now asserts production honours the flags, and the draft-blocks-production rule is proven for
Phase 4 (`tests/lab/phase-4/flags.test.ts`).

Checks: typecheck clean; lab unit tests 515 (512 pass, 3 baseline `it.fails` as designed); PGlite lab-phase3 29,
lab-phase4 13, parity 298.

## STOP 3: Engines (17 Oct 2026)

Pure engines, no I/O and no screen. Written directly in this session: the three engine subagents stopped on a
model error at launch (and again on resume) after the MedSync mod's tools appeared in the session; nothing they
started was kept. **275 engine tests** (plus 3 flags, 3 baseline `it.fails`), all pass. Typecheck and lint clean;
lab, EMR, design and FHIR suites 3,929 pass.

| File                          | Rules                               | Tests (file)                       |
| ----------------------------- | ----------------------------------- | ---------------------------------- |
| `lib/lab/referral.ts`         | RF-1..RF-10, RF-3 table, EX-7       | `referral.test.ts` 188 (169 edges) |
| `lib/lab/manifest.ts`         | MF-1..MF-4, RF-6, A18               | `manifest.test.ts` 8               |
| `lib/lab/code128.ts`          | MF-2, A7                            | `code128.test.ts` 6                |
| `lib/lab/referral-results.ts` | RB-2..RB-10, D-LAB4-09/10, A19, A20 | `referral-results.test.ts` 16      |
| `lib/exchange/normalise.ts`   | gate-a §6 normalisation             | `match.test.ts` (4 of 25)          |
| `lib/exchange/match.ts`       | MA-1..MA-9                          | `match.test.ts` 25                 |
| `lib/exchange/outbox.ts`      | EX-3, EX-4, EX-5, EX-8              | `outbox.test.ts` 8                 |
| `lib/exchange/adapter.ts`     | EX-10, FX-2, FX-3, FX-7 (in)        | `fhir-referral.test.ts` 10         |
| `lib/emr/fhir.ts` (added)     | FX-1, FX-4..FX-7 (out)              | `fhir-referral.test.ts`            |
| `lib/exchange/partners.ts`    | PT-1..PT-6, D-LAB4-19..22, A21      | `partners.test.ts` 10              |
| `lib/lab/hmis105.ts` (added)  | HM-14, HM-16, HM-17                 | `hmis104.test.ts` 4                |
| `lib/lab/signed-config.ts`    | the six kinds and their signers     | `partners.test.ts`                 |

**Rule coverage.** Every rule of §6.1–6.9 has a test except these, which are proven where they happen (the write
path, not a pure function) and are scheduled: RB-1 (files on the original order) and RF-11 (sending never
changes the order) at Step 7 and Step 5 on the PGlite lane; EX-1, EX-2 store before acknowledge and EX-3 on the
database: done at STOP 2 (`lab-phase4-data.test.ts`); EX-6 idempotent filing and EX-9 the raw view at Step 8;
MF-4 audited prints at Step 5; RF-12 restricted classes at Steps 5–6 (the manifest half, A18, is tested here);
HM-15 needs the Division of Health Information's definition (owner action Q14). Analyser rules beyond the pure
MA-2/MA-8 engine (AB-_) and national rules (NX-_) are not built (A15).

**HM-14 fixture review.** `tests/lab/phase-4/fixtures/hmis104-expected.json` holds the hand count for a synthetic
October (5 referred, average 3.83 days, 2 pending), with the reasoning per referral in its note. The laboratory
lead reviews it against the test file; until then it is "prepared by Claude".

**Decisions made in the engines (within the signed decisions):**

1. **EX-7 reads "arrival order".** Events are taken in the order they reached MedSync (the database sequence); each
   applies only if its event time is later than the last one applied. A status that arrives after a later one
   never moves the referral back (§5.1 example 4).
2. **HM-16 is a signed declaration, not a guess.** The repo keeps no history of when a flag was switched on, so
   the laboratory lead states the first month referral tracking was complete (`referral_ops.hmis104RecordsFrom`);
   10.4 comes from records from that month.
3. **A printed range that cannot say.** A value reported as "<1.5" against a printed 1.0–2.0 gets no flag (it may
   be low or normal); "<0.5" is low.

**For the CSO (raised, not applied):** MA-1 as signed files a result when name and date of birth agree **or** the
hospital number agrees. So a result whose name and date of birth agree but whose hospital number plainly differs
still files. That could be two patients with the same name and date of birth. The engine follows the signed rule
exactly; a stricter variant (a differing hospital number always waits) is a one-line change if you want it.

## STOP 4–7: Partners, send-out, tracking, results back (17 Oct 2026)

Built as one slice behind `labReferral` (each step's screens depend on the previous step's store). Committed in
two parts: the store layer (`6b710211`), then the screens.

### What is built

| Step | Screens (route)                                                                                                                                                                          | Store / actions                                                                                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4    | Partners (`/lab/exchange/partners`, artboard 10); **referral governance desk** (`/referral-governance`)                                                                                  | `savePartner`; partner tests, packing and settings drafts and signatures (lab lead); legal record, field list, high-risk wording (designated leads); designations (hospital admin)                                                                                             |
| 5    | To refer with the send panel (`/lab/refer`, artboard 1); manifest print (`/lab/refer/manifests/[id]/print`, artboard 2)                                                                  | `addToManifest` (RF-1, RF-2, RF-6, RF-7, PT-5, D-LAB4-22 server-side), seal, print (copies), handover, receipt (discrepancy → nonconformity), outbreak referral, aliquot                                                                                                       |
| 6    | Referrals (`/lab/referrals`, artboard 3); the doctor's order line and "Sent out, waiting" (artboard 5)                                                                                   | updates with who said so (EX-7), call notes, cancel (RF-8), lost (RF-10 → nonconformity)                                                                                                                                                                                       |
| 7    | Result back on paper (`/lab/referrals/[id]/result`, artboard 4); the doctor's provenance block and "Open the original report"; Waiting for a match (`/lab/exchange/matches`, artboard 7) | identity check (RB-2 → reconciliation item), scan upload (signed URL, server re-check and hash), release through `enterReferredResult` on the original order, snapshots, check task, critical flow (RB-5), HMIS 10.4 from records (HM-14..HM-17), match decisions (MA-6, MA-7) |

### Scenario results (PGlite lane, `tests/emr-db/lab-referral.test.ts`, 14 pass; engines in `tests/lab/phase-4`)

| S   | Result                      | Where proven                                                                                                                                                                                                                                                           |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Pass                        | Partner tests signed by the lab lead; unmapped test "Map before sending" (`partners.test.ts`, the send panel)                                                                                                                                                          |
| S2  | Pass                        | Field list has no diagnosis, phone or address key; legal record and field list signed only by the designated data protection lead (lane)                                                                                                                               |
| S3  | Pass                        | Abroad refused without consent; allowed with it (lane, `partners.test.ts`)                                                                                                                                                                                             |
| S4  | **Partly**                  | Review date passed shows amber on Partners and the desk, and electronic sending stops after the operational days (`partners.test.ts`). **"Both leads notified" is not built**: MedSync has no generic notification to a named person (STOP 0 recon); recorded as a gap |
| S5  | Pass                        | Add to manifest refused with the Appendix A reason until every identifier and packing item is done; seals; prints (lane)                                                                                                                                               |
| S6  | Pass                        | No patient field can reach the sheet (type-level test); Code 128 number; reprint "Copy" (lane, `manifest.test.ts`)                                                                                                                                                     |
| S7  | Pass                        | Handover moves every referral to handed over with the rider's name; a handover dated before the seal is refused; the doctor's order line reads "Sent to …" (overlay in `loadEncounterOrders`)                                                                          |
| S8  | Pass                        | Aliquot with its own `L` number and parent; two referrals (lane)                                                                                                                                                                                                       |
| S9  | Pass                        | High-risk refused on a routine manifest (store and the database trigger); outbreak referral needs who was told; shows "Handed to the outbreak team"                                                                                                                    |
| S10 | Pass                        | A restricted test prints as the partner's code and "Restricted", never its name (A18). On screen the lab sees the Restricted mark (Phase 1 Law 12 as built)                                                                                                            |
| S11 | Pass                        | Broken tube → discrepancy and a nonconformity (lane)                                                                                                                                                                                                                   |
| S12 | Pass                        | 2 days from Monday 10:00 → Wednesday 10:00; Thursday 11:00 "Overdue 1 day" (`referral.test.ts`); amber on Referrals and the doctor's line                                                                                                                              |
| S13 | Pass                        | No stated turnaround → "Not stated", never overdue                                                                                                                                                                                                                     |
| S14 | Pass                        | Each update records the person and the document (lane)                                                                                                                                                                                                                 |
| S15 | Pass                        | A status dated earlier than the last applied is kept, shown "arrived late, not applied", not applied (lane, engine)                                                                                                                                                    |
| S16 | Pass                        | Rejected needs a reason code; terminal; Recollect needs a new specimen (engine); the doctor's line reads Appendix A "Rejected by reference lab"                                                                                                                        |
| S17 | Pass                        | Cancel after handover is a request; a result that still comes back carries "Cancelled by the doctor after sending"                                                                                                                                                     |
| S18 | Pass                        | Lost needs a call note and a specimen that left; nonconformity opened (lane)                                                                                                                                                                                           |
| S19 | Pass (screen)               | Every tile is a link to its rows; an empty month shows "No data"                                                                                                                                                                                                       |
| S20 | Pass                        | On the original order, performer external, transcribed, trust 4 with a checker; snapshot in our unit by the registry with the printed value, unit and range kept; no new order (lane)                                                                                  |
| S21 | Pass                        | A different name keeps a reconciliation item (values never stored in it), nothing filed (lane)                                                                                                                                                                         |
| S22 | Pass                        | Unknown unit blocks release with the Appendix A words (lane)                                                                                                                                                                                                           |
| S23 | Pass                        | No printed range: no flag, "No range printed" (lane)                                                                                                                                                                                                                   |
| S24 | **Wired, not lane-tested**  | The snapshot holds the value in our unit and `alertAfterRelease` runs Phase 1's critical flow on release; a lane test needs signed critical limits in the fixture (added at Step 12)                                                                                   |
| S25 | Pass                        | Alone → "Entered by one person", trust 3, a check task; the next shift's check (another person, scan confirmed) closes it (lane)                                                                                                                                       |
| S26 | **Path exists, not tested** | A corrected report goes through `amendResults`; the referral and provenance carry forward on the new version; scans are append-only. Step 12 adds the test                                                                                                             |
| S27 | Pass (same path)            | A dashboard printout is a paper result from a partner whose results come back "portal_print", with the printout as the scan                                                                                                                                            |
| S28 | Pass                        | 10.4 counted from records from the declared month; hand-entered 10.4 cells retired then (lane)                                                                                                                                                                         |

### Decisions made while building (within GATE A)

1. **A referral is created at Add to manifest**, not before: the RF-6 check and the referral are one server
   transaction, so no half-sent referral exists.
2. **To refer keeps a tube until it leaves**: once handed over it is tracked under Referrals.
3. **The governance desk** (`/referral-governance`): the data protection and IPC leads are rarely lab staff, so
   they sign at their own desk (as Phase 3's In-Charge does at `/hmis`), gated by AAL2 and the designation.
4. **The doctor's order line and "Sent out, waiting"** read referral ids through the clinician's own RLS and the
   partner's name on the server's connection: the partner register is not a clinician's row (§7 RLS table).
5. **Waiting for a match is shown with `labReferral`**, not only `labExchange`: paper mismatches land there too.
6. **"File after confirming" on a paper mismatch** records the confirmation (method, who was spoken to, a second
   lab person); the entry then goes ahead and the doctor sees "Filed by hand after a mismatch".
7. **HM-16** comes from the lab lead's signed `referral_ops.hmis104RecordsFrom`, because the repo keeps no flag
   history.

### Gaps (stated, not hidden)

- No notification to named people (the lab lead, the DP lead, the doctor on lost or rejected): the information is
  on their screens; push and SMS need a notification module MedSync does not have.
- Screenshots against artboards 1–5, 7 and 10, the manifest print at 100 % and the timed trials (ten specimens to
  a sealed manifest; a five-component paper result) are done with the harness at Step 12; the timed trials need
  real lab users (owner action).
- The analyser half of the matches page (Receive then file, mapping) arrives with Step 10, which is a gap report.

Checks: typecheck clean; lint clean on every new file; lab, design and EMR suites pass (5,195), PGlite lanes
(referral 14, Phase 4 data 13, HMIS 10, parity 298) pass.

## STOP 8: Exchange core and reconciliation (17 Oct 2026)

### What is built

- **Machine identity** (`lib/exchange/jwt.ts`): SMART Backend Services client assertions, ES384 or RS384 only, on
  `node:crypto` with no new dependency. The token is opaque, lasts 300 s and only its SHA-256 is stored. Each jti
  is used once (`exchange_jti`). Pairing uses a one-time code (only its hash is stored) that expires in 30 minutes
  and locks after 10 wrong codes. The lab lead then types the key fingerprint the machine shows (B3). Enabling
  needs a fresh second factor. A partner also needs its signed legal record (PT-4). Revoking deletes the tokens and
  takes effect on the next request.
- **Inbound** (`/api/exchange/token`, `/api/exchange/inbound/[hospital]/[sender]`, `/api/exchange/pair`, and the
  bridge config and heartbeat): the message is stored before it is acknowledged (`private.exchange_store_inbound`,
  202 with `{messageId, duplicate}`) and processed after the response (`after()`). The cron sweeps anything left
  at `received`. Duplicates are recorded and never processed twice. Unreadable messages are kept and marked.
- **Processing** (`lib/exchange/store.ts`): a Task status appends a `partner_message` referral event under EX-7 (an
  out-of-order status is stored but not applied). A result goes through MA-1 exactly as signed. Matched → **back to
  file** for a lab user (RB-10, D-LAB4-11), who files it on the original order as an external, interfaced report,
  idempotently (one match item per component). Anything else → Waiting for a match, with no values.
- **Outbox** (`drainOutbox`): claims rows with a conditional update, backs off with jitter, sets a message dead
  at the limit, and lets a person retry it or set it aside with a reason. Nothing is purged. The cron drains with
  an "unavailable" transport until a partner endpoint exists (Step 9).
- **Connections** `/lab/exchange` (§5.6): tiles (delivered today in and out, retrying with the oldest, needs a
  person, waiting for a match). The connections list shows each sender, each partner not connected, and the three
  national lines (CPHL/NHLDS and the LDR not connected, A-LIS not used here). Results back to file come with File
  on the order. Messages show Not delivered (the default) or All today, with dead-letter actions. The raw message
  opens only with a reason that is recorded.
- **Analysers** `/lab/exchange/analysers` (§5.8): bridges with their health (AB-13 "Not heard since"); each
  analyser on the equipment register reads "Waiting for {model}'s interface document · Typed by hand" (Step 10 is
  a gap report).

### Scenario results (PGlite lane, `tests/emr-db/lab-exchange.test.ts`, 13 pass, against a partner simulator)

| #       | Result           | Evidence                                                                                                                                                                 |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens  | Pass             | Right assertion → 43-char token, TTL ≤ 300 s; wrong audience, jti replay, `alg: none`, 1-hour expiry, a stranger's key → `invalid_client`                                |
| Pairing | Pass             | Ten wrong codes, then the right one → `locked`                                                                                                                           |
| S15     | Pass             | Status dated earlier than the last applied is stored with `applied=false`; the referral stays `in_progress`                                                              |
| S29     | Pass             | Stored and acknowledged, "crash" before processing; the sweep processes it once; a second sweep finds nothing                                                            |
| S30     | Pass             | The same message three times (same and different external ids): one message, one `matched`, two `duplicate`                                                              |
| S31     | Pass             | Partner down → `retrying` with a later `next_at`; at the limit → `dead`; partner up → `delivered`                                                                        |
| S32     | Pass             | A different name → `demographics_disagree`; the item holds no name, date or value                                                                                        |
| S33     | Pass             | One form number on two open referrals → `ambiguous`; nothing picked                                                                                                      |
| S34     | Pass             | Wrong-patient and unknown-number messages create no patient, order or specimen                                                                                           |
| S35     | Pass             | Raw view needs a reason and writes `raw_viewed` with the reader; logger and console spies hold no name or date                                                           |
| S36     | Pass             | Revoked: the held token fails, a new assertion is refused, stored messages remain                                                                                        |
| S37/S38 | Pass (simulator) | A status moves the referral; a matching result waits as back-to-file; filing twice gives one report, performer external, entry interface, provenance with the message id |
| EX-5    | Pass             | A malformed body is stored and marked `unreadable`                                                                                                                       |

### Gaps (stated, not hidden)

- **No real partner.** S37 and S38 pass against the simulator only. Step 9 is a gap report: the outbound
  transport is "unavailable" and no partner endpoint is configured.
- **HL7 v2** inbound is not built: the simulator speaks FHIR R4. HL7 arrives with the analyser bridge (Step 10, a
  gap) or a partner that needs it.
- **Ask the partner** and **Fix the mapping** on a dead letter are a person's actions outside MedSync; the page
  records Retry or Set aside with a reason.
- **Clock skew note** (EX-8): sender times are stored as given with the zone assumed and the parsed UTC; the note
  on Connections waits for a real sender's clock.

Checks: typecheck clean; lint clean; lab, design and EMR suites pass (3,922 + PGlite-only files skipped in that
run); PGlite lanes exchange 13, referral 14 and Phase 4 data 13 pass.

## STOP 9–11: Conditional steps (17 Oct 2026)

None of the conditions holds (STOP 0, "Inputs in hand"). Each step is a gap report, and no code is added for it.

| Step | Report            | Condition missing                                                | Built and waiting                                                          |
| ---- | ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 9    | `partner-gap.md`  | A partner's interface document, test environment, agreement (Q6) | The FHIR adapter and exchange core; S37 and S38 against the simulator only |
| 10   | `analyser-gap.md` | The maker's LIS document for the model on site (Q7, Q8)          | Bridge-facing endpoints; Analysers page reads "Waiting for …"              |
| 11   | `national-gap.md` | All four GATE N items for any system; letter not yet sent (Q5)   | Connections shows each national line "Not connected"                       |

Paper and typed entry remain the path for every partner, analyser and national system.
