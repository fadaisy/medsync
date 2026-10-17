# Lab Phase 4: GATE A proposal

Step 1 of `docs/lab/phase-4/PROMPT-LAB-PHASE-4.md`. Documents only. Written 17 OCT 2026 on
`feat/lab-connect-outward`, after STOP 0 (`STOP-REPORTS.md`). **Fadhul signed the decisions in §2 as recommended on 17 OCT 2026** (§11). The parts that stand on their own are in sibling files and are part of this proposal:

| File                             | Holds                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `gate-a-proposal.md` (this file) | Differences, decisions, schema diff, state machines, flows, matching, FHIR, screens, copy, sign-off packs |
| `bridge-and-security.md`         | D-LAB4-14 build or reuse (the OpenELIS Analyzer Bridge evaluated), D-LAB4-15 and the GATE S design        |
| `hazard-log.md`                  | Appendix B completed: cause, effect, control, the test that proves it, residual risk                      |
| `test-and-rollout-plan.md`       | Test plan per step, RLS probe matrix, rollout per flag, user-guide outline, ADR drafts                    |

Every patient, partner, form number, barcode, code, unit, range and turnaround in the examples below is a
**FIXTURE**, marked as such. None is a real or signed value.

---

## 1. Where this proposal differs from the prompt (and why)

The repo wins over the prompt (§1.1). Each difference comes from STOP 0.

| #   | Prompt                                                                                                                                   | Proposal                                                                                                                                                                                                                              | Why                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | Tables `partners`, `referrals`, `manifests`, …                                                                                           | `lab_partners`, `lab_referrals`, `lab_manifests`, … ; the exchange stays generic: `exchange_*`                                                                                                                                        | Patient referrals already exist (orders `kind referral`, `disposition referred_out`, intakes)                                                                                        |
| P2  | A `source` enum and `provenance` on each result component                                                                                | **Source is derived from two columns the report already has**: `performer` × `entry_mode`. Provenance is one jsonb on `diagnostic_reports`                                                                                            | One store per fact (Law 2). typed = in_house + direct; interfaced = in_house + interface; referred on paper = external + transcribed; referred electronically = external + interface |
| P3  | `partner_range_snapshot` on the component                                                                                                | The printed range goes where every range already goes: `lab_result_snapshots` (`range_low`, `range_high`, `flag_computed`), plus `range_source` (`hospital` \| `performing_lab`) and `printed` (unit, range and flag text as printed) | Law 8 keeps one snapshot per value; the doctor's view already reads it                                                                                                               |
| P4  | Partner tests, packing, legal record and field list as their own versioned tables                                                        | **Kinds in `lab_signed_configs`** (the signing engine every lab signature uses), keyed by partner; `lab_partners` holds identity, contacts and transport only                                                                         | One signing path: fresh second factor, D-LAB1-12, versions, audit. Phase 3 put HMIS mapping there the same way                                                                       |
| P5  | `qc_material_lots` (MA-8)                                                                                                                | `lab_stock_lots` of `control` items                                                                                                                                                                                                   | No such table                                                                                                                                                                        |
| P6  | Mutual TLS first (D-LAB4-15)                                                                                                             | **Signed JWT client assertion** (SMART Backend Services) for every machine                                                                                                                                                            | Vercel documents no client-certificate verification; mTLS needs a proxy we do not run                                                                                                |
| P7  | `partner_connections`, `analyser_bridges`, `analyser_links`, driver profiles, code maps, flag meanings, shadow comparisons in this slice | **Only `exchange_senders`** (the service identity of a partner or bridge) is built now. The analyser tables are written at Step 10 if the maker's document arrives                                                                    | Step 10 has no input (STOP 0). Tables nobody can fill are not built (Law 1, Engine-first, and YAGNI). Analysers (5.8) reads `devices` and says what is missing                       |
| P8  | `dp.lead` as a permission                                                                                                                | A **designation** (`hospital_designations`, role `data_protection_lead`; also `ipc_lead`) set by the hospital admin                                                                                                                   | It is a named person, like Phase 3's In-Charge; a permission map is per cadre                                                                                                        |
| P9  | A barcode library implied                                                                                                                | A pure Code 128 encoder in `lib/lab/code128.ts` (subset B, checksum, SVG bars), no dependency                                                                                                                                         | None exists; Law 15                                                                                                                                                                  |
| P10 | Validation against base R4 (FX-7)                                                                                                        | A structural check of the five resources we send (required elements, cardinality, the value sets we use), in the repo                                                                                                                 | No validator exists; adding one is a dependency. It is recorded as "not a full R4 validator"                                                                                         |
| P11 | Live events `referral_updated`, `match_waiting`, `message_dead`                                                                          | Broadcast by triggers on `lab_referral_events`, `lab_match_items` and `exchange_outbox`, `{event, at}` only (no PHI, no ids of patients)                                                                                              | LV-1's trigger never sent even `referred`                                                                                                                                            |
| P12 | Canvas provenance block with a 3 px left border                                                                                          | Sky tint with a full 1 px sky hairline, no left bar                                                                                                                                                                                   | DESIGN-medsync.md bans left-edge accent bars                                                                                                                                         |
| P13 | "Second person on duty" presence window                                                                                                  | "Active" = a user with `lab.result.enter` in this hospital whose last lab write or sign-in is within the window (operational, default proposed 30 min, set by the lab lead)                                                           | No presence tracking exists; writes and sign-ins are recorded                                                                                                                        |

---

## 2. Decisions (signed by Fadhul as recommended, 17 OCT 2026, through the session's GATE A questions)

The prompt's decisions (§14) with the proposal's adjustments, then the decisions STOP 0 adds (A-\*).

| #         | Decision                                    | Recommendation                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-LAB4-01 | Scope                                       | Referrals and results back; the exchange core; a partner adapter against the simulator only (no partner in hand); analyser and national connections as gap reports (no inputs). Microbiology, blood bank, histopathology, billing: separate prompts                             |
| D-LAB4-02 | Where a referred result lives               | On the original order and specimen, through `writeReportVersion`; never a new order (RB-1)                                                                                                                                                                                      |
| D-LAB4-03 | Referral status model                       | RF-3 states mapped to FHIR R4 `Task.status`                                                                                                                                                                                                                                     |
| D-LAB4-04 | Overdue                                     | From the partner's signed stated turnaround for the test; none → "Not stated", never overdue; labelled the partner's figure                                                                                                                                                     |
| D-LAB4-05 | Manifest content                            | Lab numbers, partner identifiers, specimen, containers, test, collected time; no names or clinical details; Code 128 manifest number                                                                                                                                            |
| D-LAB4-06 | Lost                                        | A person with `lab.refer` marks lost with the last known event and a call note; a nonconformity opens; the doctor decides on recollection                                                                                                                                       |
| D-LAB4-07 | High-risk specimens                         | Never on a routine manifest; outbreak referral with who was informed; wording signed by the IPC lead                                                                                                                                                                            |
| D-LAB4-08 | Paper results                               | From the referral, as printed, scan required, second-person check when one is active; else "Entered by one person" and a next-shift check task                                                                                                                                  |
| D-LAB4-09 | Ranges and flags (CSO)                      | The reference lab's printed or sent range; ours never applied; no range printed → no flag; critical limits still apply in our unit                                                                                                                                              |
| D-LAB4-10 | Units                                       | As printed, must exist in the unit registry; conversion only through the registry; both shown                                                                                                                                                                                   |
| D-LAB4-11 | Electronic results                          | Land as "Back, to file"; a lab user files them                                                                                                                                                                                                                                  |
| D-LAB4-12 | Matching rule (CSO)                         | MA-1 and MA-2 exactly; everything else waits; never create, never pick; values hidden until a decision; manual filing with confirmation, second person and reason                                                                                                               |
| D-LAB4-13 | Message store                               | Append-only; store before acknowledge; de-duplicate by sender id and content hash; dead letters never purged                                                                                                                                                                    |
| D-LAB4-14 | Bridge: build or reuse                      | See `bridge-and-security.md` §1. Decided now, built only at Step 10                                                                                                                                                                                                             |
| D-LAB4-15 | Machine authentication                      | **Changed (P6):** signed JWT client assertion for every machine (bridge and partner), ≤ 5-minute tokens, no refresh, `system/` scopes; pairing by one-time code. mTLS only if a proxy is ever put in front                                                                      |
| D-LAB4-16 | Shadow run                                  | Two weeks or 200 specimens, whichever is later; zero unexplained differences; lab lead signs                                                                                                                                                                                    |
| D-LAB4-17 | First analyser                              | The first whose maker's document is in hand (none today)                                                                                                                                                                                                                        |
| D-LAB4-18 | Order download                              | Off                                                                                                                                                                                                                                                                             |
| D-LAB4-19 | Legal basis                                 | DPPA s.7(2)(d) for referral; s.7(2)(b)(i) for national reporting; s.9 reviewed by counsel; agreements and processor terms for electronic partners; paper to public reference labs needs no new agreement                                                                        |
| D-LAB4-20 | Review date passed                          | Inform and notify; electronic sending stops 30 days after the review date unless renewed (operational, set by the data protection lead)                                                                                                                                         |
| D-LAB4-21 | Field lists                                 | Signed per partner; diagnosis, phone and address can never be on one; clinical question opt-in                                                                                                                                                                                  |
| D-LAB4-22 | Cross-border                                | Refused unless safeguards are recorded or the referral carries the patient's recorded consent                                                                                                                                                                                   |
| D-LAB4-23 | National connections                        | Only past GATE N; letter at Step 0; no scraping, no unofficial endpoints                                                                                                                                                                                                        |
| D-LAB4-24 | A-LIS sites                                 | MedSync sends orders and takes results once specified; `labReferral` and Phase 3 flags stay off there                                                                                                                                                                           |
| D-LAB4-25 | HMIS 10.4                                   | From records when `labReferral` was on all month (all three cells, P-H15); turnaround definition confirmed with the Division of Health Information                                                                                                                              |
| D-LAB4-26 | Rollout order                               | `labReferral` → `labExchange` → `labAnalyserBridge` → `labNationalExchange`                                                                                                                                                                                                     |
| E-LAB4-01 | Engine                                      | `lib/exchange/**` generic, reused later by pharmacy, radiology and the national HIE                                                                                                                                                                                             |
| E-LAB4-02 | Adapters                                    | One interface for every connection; mappings versioned and signed as data                                                                                                                                                                                                       |
| E-LAB4-03 | The bridge                                  | A separate deployable; encrypted durable store pruned only after delivery confirmation plus a retention window set at GATE S                                                                                                                                                    |
| A1        | Table names                                 | `lab_` prefix for lab tables; `exchange_` for the generic exchange (P1)                                                                                                                                                                                                         |
| A2        | Result source                               | Derived from `performer` × `entry_mode`; provenance jsonb and `referral_id` on the report (P2)                                                                                                                                                                                  |
| A3        | The printed range                           | In `lab_result_snapshots` with `range_source` and `printed` (P3)                                                                                                                                                                                                                |
| A4        | Partner configuration                       | Six new `lab_signed_configs` kinds (P4, §3.1)                                                                                                                                                                                                                                   |
| A5        | Analyser tables                             | Not built until Step 10 has its input (P7)                                                                                                                                                                                                                                      |
| A6        | Data protection lead and IPC lead           | Designations, set by the hospital admin (P8)                                                                                                                                                                                                                                    |
| A7        | Barcodes                                    | Pure Code 128 encoder, no dependency (P9)                                                                                                                                                                                                                                       |
| A8        | FHIR validation                             | Structural check in the repo, recorded as not a full validator (P10)                                                                                                                                                                                                            |
| A9        | Report scans                                | A private `lab-report-scans` bucket, no client policies; uploads through a server-minted signed URL then a server re-check (size, type, hash); reads through 5-minute signed URLs after an RLS-checked read, audited. **No virus scanning exists**: recorded as a residual risk |
| A10       | Outbox worker                               | `/api/cron/exchange-outbox` every minute by pg_cron (the 0106 pattern), claiming rows with a conditional UPDATE; never in a request path                                                                                                                                        |
| A11       | Live events                                 | P11                                                                                                                                                                                                                                                                             |
| A12       | Presence window                             | P13                                                                                                                                                                                                                                                                             |
| A13       | Copy                                        | `content/lab-phase-4.ts`, `LAB4_COPY_STATUS` draft; flags blocked in production while draft (the Phase 2/3 mechanism)                                                                                                                                                           |
| A14       | Step 9 with no partner                      | The prompt is split (Q6: build against the simulator, disabled; Step 9: gap report). The FHIR adapter (EX-10, FX-2, FX-3) is built **with Step 8**, tested against the simulator, and stays disabled; Step 9 itself is the gap report                                           |
| A15       | "Rule IDs without a test: 0"                | Counts the rules of built steps. Rules of gap-report steps (AB-_, NX-_, the MA-2 analyser paths beyond the pure engine) are listed separately as "not built"                                                                                                                    |
| A16       | Flag dependencies                           | `labReferral` needs `LAB_ONE_MENU`, `LAB_HIGH_RISK` and `LAB_UNITS_RANGES` on, else it is off (RF-7 and RB-3 depend on them); `labExchange` needs `labReferral`. `labAnalyserBridge` and `LAB_QC_HOLD`: decided at Step 10                                                      |
| A17       | Escalation                                  | Counts in the navigation always; the lab lead is notified when a match item waits past an operational time (proposed 24 h), at once for a dead letter, and when a one-person check is still open at the end of the next shift                                                   |
| A18       | Restricted tests on the printed manifest    | The sheet prints the partner's code for a restricted test, never the test name (the test name is on the request form inside the package)                                                                                                                                        |
| A19       | The second checker and the scan             | The checker ticks "The scan shows report {number}" before the check counts (HZ-4-26)                                                                                                                                                                                            |
| A20       | A printed unit that cannot be converted     | New draft string: "{Unit} cannot be converted to this hospital's unit, so the critical check did not run. Read the value against the report and call the ward if it is dangerous." The result still releases (Law 11)                                                           |
| A21       | Clinical question sent electronically       | Opt-in per partner on the signed field list (PT-3); off by default; the field is labelled "Do not write the diagnosis"                                                                                                                                                          |
| B1        | D-LAB4-14                                   | Option A in `bridge-and-security.md`: the OpenELIS Analyzer Bridge 3.4.1 unchanged, pinned by digest, with a small MedSync companion on the same PC that signs in by JWT and forwards. Build our own only if a maker's document shows an analyser it cannot drive               |
| B2        | JWT algorithms                              | ES384 and RS384 (the SMART pair); ES256 only if a partner needs it                                                                                                                                                                                                              |
| B3        | Key fingerprint check at pairing            | Yes: the lab lead compares the fingerprint the device shows with the one MedSync shows before the sender goes active                                                                                                                                                            |
| B4        | Bridge PC disk encryption, values at GATE S | Full-disk encryption required; TPM-only or TPM + PIN, code length, expiry, failure limit, skew, heartbeat, rotation and retention are set at GATE S                                                                                                                             |
| B5        | `jose`                                      | Not added; about 60 lines on `node:crypto` (no new dependency)                                                                                                                                                                                                                  |

---

## 3. Schema diff (migrations 0150–0153; additive; GATED, owner-applied)

Every event table is append-only by `block_modify_append_only()` (owner path included), audited by
`audit_log_changes()`, FORCE RLS, writes revoked from `anon` and `authenticated`, SELECT granted to
`medsync_clinical_reader` with a policy. The pattern is 0112's loop.

### 3.1 0150 — partners, designations, signed kinds, nonconformity sources

```sql
CREATE TABLE public.lab_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  kind text NOT NULL CHECK (kind IN ('national_reference','public_lab','private_lab','abroad','outbreak','hub')),
  contacts jsonb NOT NULL DEFAULT '[]',            -- [{role, name, phone, email}] (staff of the partner, not patients)
  transport jsonb NOT NULL DEFAULT '[]',           -- [{code, words}] e.g. their courier, hub rider, our driver
  results_return jsonb NOT NULL DEFAULT '[]',      -- [{channel: paper|portal_print|sms|electronic, words}]
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, name)
);
CREATE TABLE public.hospital_designations (        -- data protection lead, IPC lead (P8)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL, role text NOT NULL CHECK (role IN ('data_protection_lead','ipc_lead')),
  user_id uuid NOT NULL, starts_on date NOT NULL, ends_on date,
  set_by uuid NOT NULL, set_at timestamptz NOT NULL DEFAULT now()
);
-- lab_signed_configs.kind gains (each payload Zod-validated in lib/lab/signed-config.ts; partner_id in payload):
--   partner_tests     {partnerId, tests:[{testCode, theirCode, loinc?, turnaround?{value, unit: hours|days|working_days},
--                      requiredIds:[{key, words, symbologies[]}], requirements, source{doc, date}}]}   lead signs
--   partner_packing   {partnerId, category, items:[{key, words}], source}                              lead signs
--   partner_legal     {partnerId, basis: s7_2_a|s7_2_b_i|s7_2_d|s7_2_e, agreement?{ref, signedOn, reviewOn},
--                      processorTerms, crossBorder, safeguards?{ref}|perPatientConsent, pdpo{ref, renewOn},
--                      breachContact}                                                                 dp lead signs
--   partner_fields    {partnerId, fields:[...allow-list...], clinicalQuestion: boolean}               dp lead signs
--   referral_wording  {highRisk: text, procedureRef}                                                  IPC lead signs
--   referral_ops      {presenceMinutes, stopSendingDaysAfterReview}   (operational)                    lead signs
-- The two-slot check (lead + CSO) is satisfied by a role slot for dp/IPC kinds (Phase 3 precedent: hmis_mapping's
-- focal slot). partner_fields can never hold diagnosis, phone or address: the Zod allow-list has no such key.
ALTER TABLE public.lab_nonconformities DROP CONSTRAINT <source check>;  -- widened with 'referral','manifest'
```

### 3.2 0151 — referrals, manifests, aliquots, live events

```sql
ALTER TABLE public.specimens ADD COLUMN parent_specimen_id uuid REFERENCES public.specimens(id);  -- RF-2

CREATE TABLE public.lab_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL, number text NOT NULL,             -- RF-YYYY-NNNN, per hospital
  specimen_id uuid NOT NULL REFERENCES public.specimens(id),
  order_ids uuid[] NOT NULL CHECK (cardinality(order_ids) >= 1),-- the order lines (encounter_orders) it covers
  partner_id uuid NOT NULL REFERENCES public.lab_partners(id),
  routine boolean NOT NULL,                                    -- false = outbreak referral (RF-7)
  external_ids jsonb NOT NULL DEFAULT '{}',                    -- {key: value} the partner requires (scanned)
  packing jsonb NOT NULL DEFAULT '{}',                         -- {itemKey: checkedBy/at}
  partner_tests_config_id uuid NOT NULL,                       -- the signed partner_tests version in force
  consent_ref text,                                            -- s.19, abroad partners only
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), client_key text NOT NULL,
  -- cached projection of the events (RF-4); recomputed by the writer in the same transaction:
  state text NOT NULL, state_at timestamptz NOT NULL, sent_at timestamptz, completed_at timestamptz,
  UNIQUE (hospital_id, number), UNIQUE (specimen_id, partner_id), UNIQUE (hospital_id, client_key)
);
CREATE TABLE public.lab_referral_events (                      -- append-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL,
  referral_id uuid NOT NULL REFERENCES public.lab_referrals(id),
  kind text NOT NULL,     -- created|packed|handed_over|at_hub|received_by_lab|accepted|rejected|in_progress|
                          -- on_hold|completed|failed|lost|cancel_requested|cancelled|note|call
  event_at timestamptz NOT NULL, seq bigint GENERATED ALWAYS AS IDENTITY,
  source text NOT NULL CHECK (source IN ('person','partner_message','system')),
  actor_user_id uuid, document text,   -- rider_log|phone_call|signed_manifest|their_portal|… (person source)
  message_id uuid,                     -- exchange_messages.id (partner_message source)
  reason_code text, note text, applied boolean NOT NULL,       -- EX-7: false = stored, shown, not applied
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lab_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, number text NOT NULL, -- MF-YYYY-NNNN
  partner_id uuid NOT NULL, transport text NOT NULL, packages int,
  state text NOT NULL CHECK (state IN ('open','sealed','handed_over','received','discrepancy')),
  sealed_at timestamptz, handed_to text, handed_at timestamptz,
  received jsonb,                    -- {how: signed_copy|phone|message, by, at, condition, count}
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (hospital_id, number)
);
CREATE TABLE public.lab_manifest_items (manifest_id uuid, referral_id uuid UNIQUE, position int, PRIMARY KEY (manifest_id, referral_id));
CREATE TABLE public.lab_manifest_prints (                      -- append-only (MF-4)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifest_id uuid NOT NULL, copy boolean NOT NULL,
  printed_by uuid NOT NULL, printed_at timestamptz NOT NULL DEFAULT now());
-- lab_manifests: state changes only by the writer function; a trigger refuses item changes once sealed (MF-3).
-- Live: AFTER INSERT on lab_referral_events → realtime.send({event:'referral_updated', at}, 'lab:'||hospital_id).
```

### 3.3 0152 — results back

```sql
ALTER TABLE public.diagnostic_reports
  ADD COLUMN referral_id uuid REFERENCES public.lab_referrals(id),
  ADD COLUMN provenance jsonb;   -- {partner, theirReport, reportedAt, authorisedBy, enteredBy, checkedBy|checkTaskId,
                                 --  oneEntrant, messageId, cancelledAfterSending, filedAfterMismatch{method, by, second}}
  -- CHECK: referral_id IS NOT NULL ⇒ performer = 'external'.
ALTER TABLE public.lab_result_snapshots
  ADD COLUMN range_source text NOT NULL DEFAULT 'hospital' CHECK (range_source IN ('hospital','performing_lab')),
  ADD COLUMN printed jsonb,       -- {value, unit, range, flagText} exactly as printed or sent (RB-3)
  ADD COLUMN interfaced jsonb;    -- {value, unit, flags, ranges} as the analyser sent; edit reason (AB-10; Step 10)
CREATE TABLE public.lab_result_attachments (                    -- append-only (RB-6, RB-9: old scans kept)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, referral_id uuid NOT NULL,
  report_id uuid, path text NOT NULL, sha256 text NOT NULL, bytes int NOT NULL, mime text NOT NULL,
  uploaded_by uuid NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.lab_transcription_checks (                  -- append-only (RB-7)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, report_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('checked_at_entry','task_opened','checked_later','differs_amended')),
  checker_user_id uuid, at timestamptz NOT NULL DEFAULT now(), note text);
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('lab-report-scans','lab-report-scans', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png']);
-- No storage policy for anon or authenticated: only the server (service role) reads or writes (A9).
```

### 3.4 0153 — the exchange (Step 8)

```sql
CREATE TABLE public.exchange_senders (            -- a machine identity: svc.partner:{id} or svc.bridge:{id}
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('partner','bridge')), partner_id uuid,
  name text NOT NULL, state text NOT NULL CHECK (state IN ('pairing','active','revoked')),
  jwks jsonb,                                     -- public keys only; MedSync never holds a machine's private key
  scopes text[] NOT NULL,                         -- e.g. {system/exchange.inbound.write, system/exchange.config.read}
  zone text NOT NULL DEFAULT 'Africa/Kampala',    -- EX-8
  pairing_hash text, pairing_expires_at timestamptz, pairing_failures int NOT NULL DEFAULT 0,
  enabled_by uuid, enabled_at timestamptz, last_heard_at timestamptz, revoked_at timestamptz);
CREATE TABLE public.exchange_messages (           -- append-only (EX-1)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, sender_id uuid,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  channel text NOT NULL CHECK (channel IN ('fhir','hl7v2','astm','file','manual_note')),
  content_type text NOT NULL, payload_ciphertext text, payload_path text, sha256 text NOT NULL,
  external_id text, about text NOT NULL,          -- PHI-free summary: "Result, form RL-55031"
  received_at timestamptz NOT NULL DEFAULT now(), zone_assumed text, sender_time timestamptz,
  UNIQUE (hospital_id, sender_id, external_id), UNIQUE (hospital_id, sender_id, sha256));
CREATE TABLE public.exchange_events (             -- append-only (EX-4, EX-5): every state change of a message
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, hospital_id uuid NOT NULL, message_id uuid NOT NULL,
  state text NOT NULL,  -- received|duplicate|parsed|matched|filed|waiting_match|unreadable|
                        -- pending|sending|delivered|retrying|dead|retried_by_person|set_aside|raw_viewed
  detail jsonb, actor_user_id uuid, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.exchange_outbox (             -- projection of the latest outbound state (EX-4)
  message_id uuid PRIMARY KEY, hospital_id uuid NOT NULL, sender_id uuid NOT NULL, state text NOT NULL,
  attempts int NOT NULL DEFAULT 0, next_at timestamptz, last_error text, claimed_until timestamptz);
CREATE TABLE public.exchange_jti (jti text PRIMARY KEY, sender_id uuid NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE public.exchange_tokens (             -- opaque access tokens from the token endpoint (≤ 5 min, no refresh)
  token_hash text PRIMARY KEY, sender_id uuid NOT NULL, scopes text[] NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL);
-- Only the sha256 of a token is stored. Every request re-reads the sender's state, so revoking takes effect at once.
CREATE TABLE public.lab_match_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, message_id uuid NOT NULL,
  component_key text NOT NULL, reason text CHECK (reason IN ('not_found','not_received',
   'demographics_disagree','ambiguous','not_ordered','already_released','unit_differs','code_unmapped',
   'partner_not_enabled')),
  candidate_referral_id uuid, candidate_specimen_id uuid, comparison jsonb NOT NULL, -- Same/Differs/Cannot, no values
  state text NOT NULL CHECK (state IN ('waiting','filed','not_ours','kept_unordered','set_aside')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (message_id, component_key));
CREATE TABLE public.lab_match_resolutions (       -- append-only (MA-6, MA-7)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, item_id uuid NOT NULL,
  action text NOT NULL, method text, spoke_to text, second_user_id uuid, reason text NOT NULL,
  actor_user_id uuid NOT NULL, at timestamptz NOT NULL DEFAULT now());
-- Filing idempotency (EX-6): every component of every inbound result gets ONE lab_match_items row
-- (UNIQUE message_id, component_key). Filed by itself → reason NULL, state 'filed'. Re-processing the same message
-- finds the row and returns the same report; a duplicate message never gets here (EX-3).
```

The payload is encrypted with `lib/encryption.ts` (AES-256-GCM, strings). A payload above 256 KB goes to the
`lab-report-scans` bucket under `{hospitalId}/exchange/{sha256}` with the hash in the row.

---

## 4. Permissions, designations and identities

| Permission            | Who (proposed default in `data/lab/permission-map.v2.json` successor, signed by the CSO) |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `lab.refer`           | Lab technologists and technicians; the lab head                                          |
| `lab.refer.result`    | Holders of `lab.result.enter`                                                            |
| `lab.match.resolve`   | Lab technologists with `lab.result.release`; the lab head                                |
| `lab.exchange.manage` | The lab head (headship)                                                                  |
| `lab.analyser.manage` | The lab head (headship); unused until Step 10                                            |
| Data protection lead  | The person designated (`hospital_designations`), set by the hospital admin               |
| IPC lead              | The person designated, set by the hospital admin                                         |

Machines: an `exchange_senders` row is a service identity. Its token carries `sub = sender id`,
`hospital = its hospital`, scopes from the row. The inbound route inserts through a SECURITY DEFINER function
that takes the verified sender id, never a client-supplied hospital. A machine reads nothing but its own sender
row (config) through a second definer function. No machine role touches patient, order, result or message rows.

---

## 5. State machines and flows

### 5.1 Referral (RF-3)

```
              createReferral                  addToManifest+seal        recordHandover
   (To refer) ───────────────▶ draft ────────────────────────▶ packed ───────────────▶ handed_over
                                 │ cancel (before handover)       │ cancel                 │
                                 ▼                                ▼                        ▼
                             cancelled ◀──────────────────── cancelled           at_hub ─▶ received_by_lab
                                                                                              │
                                     ┌───────────── rejected (terminal; Recollect = new referral)
                                     │                        │
                                 accepted ─▶ in_progress ◀─▶ on_hold
                                                  │
                                         completed | failed (terminal)
     lost: from any non-terminal state after handed_over, by a person (RF-10)
     cancel after handover: cancel_requested (a note or a sent cancellation); the destination decides (RF-8)
```

| From \ to       | packed | handed_over | at_hub | received_by_lab | accepted | rejected | in_progress | on_hold | completed | failed | lost | cancelled |
| --------------- | :----: | :---------: | :----: | :-------------: | :------: | :------: | :---------: | :-----: | :-------: | :----: | :--: | :-------: |
| draft           |   ✓    |             |        |                 |          |          |             |         |           |        |      |     ✓     |
| packed          |        |      ✓      |        |                 |          |          |             |         |           |        |      |     ✓     |
| handed_over     |        |             |   ✓    |        ✓        |    ✓     |    ✓     |      ✓      |         |     ✓     |   ✓    |  ✓   |    ✓¹     |
| at_hub          |        |             |        |        ✓        |    ✓     |    ✓     |      ✓      |         |     ✓     |   ✓    |  ✓   |    ✓¹     |
| received_by_lab |        |             |        |                 |    ✓     |    ✓     |      ✓      |    ✓    |     ✓     |   ✓    |  ✓   |    ✓¹     |
| accepted        |        |             |        |                 |          |          |      ✓      |    ✓    |     ✓     |   ✓    |  ✓   |    ✓¹     |
| in_progress     |        |             |        |                 |          |          |             |    ✓    |     ✓     |   ✓    |  ✓   |    ✓¹     |
| on_hold         |        |             |        |                 |          |          |      ✓      |         |     ✓     |   ✓    |  ✓   |    ✓¹     |

¹ Only when the destination confirms (a partner message, or a person recording their call). Skipping forward is
allowed (paper rarely reports every stage); going back is not. Terminal: completed, failed, lost, cancelled,
rejected. Each edge has one test (Step 3).

**Worked examples (FIXTURES):**

1. **Lost.** RF-2026-0294 (sickle cell, to "Reference lab A (fixture)") was handed over Mon 28 SEP 10:05, recorded
   at the hub 29 SEP 11:20 from the rider's log. Stated turnaround 7 days → expected 5 OCT 10:05. On 9 OCT the lab
   calls the hub; nobody has it. LT-A marks lost: last known "at hub, 29 SEP", call note "Hub coordinator, 9 OCT
   09:40, not seen since 29 SEP". A nonconformity NC-2026-0xx opens (source `referral`); the doctor gets "Lost"
   (Appendix A) and decides on recollection.
2. **Rejected.** RF-2026-0305 comes back on paper "Specimen haemolysed". LT-B records `rejected`, reason code
   `haemolysed` (Phase 3 rejection codes). The doctor is told; To refer shows **Recollect** when a new specimen for
   that order is received; HMIS counts the referral once (HM-17).
3. **Cancelled after handover.** The doctor cancels the lipid order after the courier left. The referral gets
   `cancel_requested` (note: "Phoned Reference lab A, 13 OCT 15:10, asked to stop"). The result still arrives: it
   files on the original order with "Cancelled by the doctor after sending" in provenance.
4. **A late status out of order (EX-7).** RF-2026-0307 is `completed` (event_at 14 OCT 09:00, seq 41). A partner
   message dated 13 OCT 18:00 says `in-progress`. It is stored as an event with `applied = false`, shown greyed in
   the timeline ("arrived late, not applied"); the referral stays completed.

### 5.2 Manifest (MF-3)

`open → sealed → handed_over → received | discrepancy`. Sealed refuses item changes (trigger); a missed specimen
goes on a new manifest. Handed over moves every referral on it to `handed_over` in the same transaction. Received
records condition and count; any leaking, broken or missing item → `discrepancy`, a nonconformity (source
`manifest`) and an event on each affected referral; the doctor of an affected referral is told.

### 5.3 Inbound message (EX-2, EX-5), over HTTPS

```
 partner/bridge ── POST /api/exchange/inbound/{hospital}/{sender} + Bearer (≤5-min JWT) ──▶ route
   0. (earlier) POST /api/exchange/token with a signed JWT client assertion: kid → sender jwks, alg allowlist,
      aud, exp, jti unused → insert jti → an opaque token (≤ 5 min) whose hash is stored     401 if not
   1. verify the Bearer: hash found, not expired, scope inbound.write, sender active,
      URL's hospital and sender match the token's                                          401/403 if not
   2. Zod envelope; size cap                                                              400 if not
   3. BEGIN; insert exchange_messages (+ duplicate check on external id and sha256);
      insert exchange_events 'received' (or 'duplicate'); COMMIT                          500 if fails → sender retries
   4. respond 202 {messageId, duplicate}      ← "we hold it", not "it is filed"
   5. after the response: process (parse → match → file or wait). A crash here loses nothing:
      the worker picks up every message whose last event is 'received' (S29).
```

HL7 v2 and ASTM never reach the server directly: the bridge (Step 10) stores each frame or message before its
own ACK or `MSA|AA`, then posts the stored message over the same route.

### 5.3a On the bridge: ASTM and HL7 (AB-3; built only at Step 10)

```
 ASTM (LIS01 / E1381)                                  HL7 v2 over MLLP
 analyser ─ENQ─▶ bridge                                analyser ─0x0B msg 0x1C 0x0D─▶ bridge
 bridge ─ACK─▶ (opens a session; nothing kept yet)     bridge: parse MSH; on failure send AE/AR
 analyser ─STX FN text ETX C1C2 CR LF─▶ bridge         bridge: COMMIT the whole message to its store
 bridge: checksum? no → NAK (resend, same FN)          bridge ─MSA|AA (enhanced: CA then AA)─▶ analyser
         yes → COMMIT frame to the store → ACK         bridge outbox ─HTTPS POST (§5.3)─▶ MedSync
 analyser ─EOT─▶ bridge: transmission complete;
   without EOT it stays "incomplete" and is never sent
 bridge outbox ─HTTPS POST (§5.3)─▶ MedSync
```

An identical retransmitted frame or message is acknowledged and not stored twice (content hash, AB-5). The ACK
always means "the bridge holds it". Timeouts and the failure limit come from the driver profile written from the
maker's document.

### 5.4 Outbox (EX-4)

`pending → sending → delivered`, or `retrying` (next_at = now + min(cap, base × 2^attempts) × (1 ± jitter)) →
`dead` after the attempt limit. Base, multiplier, cap, jitter and limit are **operational** (proposed defaults
from the OpenELIS bridge: 5 s, ×2, 10 min, 0.2, 150), set by the lab head. A person may retry or set aside with a
reason. Dead is never purged.

---

## 6. Matching (MA-1, MA-2), one worked example per reason (FIXTURES)

Open referral RF-2026-0312: specimen L00000622, their form RL-55120, patient "Fixture Twelve", born 02 FEB 1990,
hospital number MS-2026-00034.

| Reason                  | The message carries                                                 | Why it waits                                                       |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| (files by itself)       | RL-55120, "TWELVE, Fixture", 1990-02-02                             | One open referral; name (normalised order) and date of birth agree |
| `not_found`             | RL-99999                                                            | No open referral has that number                                   |
| `demographics_disagree` | RL-55120, "Fixture Twenty", 1990-02-02                              | Number maps, name differs, no hospital number                      |
| `ambiguous`             | RL-55120, and a second open referral also has RL-55120 (data error) | Two candidates; never pick                                         |
| `partner_not_enabled`   | Any result from a sender whose partner connection is not enabled    | PT-4                                                               |
| `already_released`      | Analyser: L00000622, HGB, the HGB component already released        | Amendment path only                                                |
| `not_received`          | Analyser: sample L00000630, collected but not yet received          | MA-9 "Receive the specimen, then file"                             |
| `not_ordered`           | Analyser: L00000622 with a code mapped to a test not on its order   | Keep as unordered or set aside                                     |
| `unit_differs`          | Analyser: HGB in g/L, mapping expects g/dL                          | Never converted silently                                           |
| `code_unmapped`         | Analyser: code "XYZ" with no signed mapping                         | Open the mapping                                                   |

Normalisation for names: Unicode NFKC, case-folded, punctuation and repeated spaces removed, tokens sorted (so
"TWELVE, Fixture" = "Fixture Twelve"). Near misses that must **not** match: one letter different, a missing
token, swapped date day and month, a different year. No phonetic or fuzzy matching.

---

## 7. FHIR (FX-\*), example out and in (FIXTURES)

**Out** (FX-1): a `transaction` Bundle of `Task` (intent order, status requested, `basedOn`/`focus` the
ServiceRequest, `for` the Patient, `owner` the partner Organization, `input` the Specimen, `identifier` our
referral number), `ServiceRequest` (code from the signed `partner_tests` mapping; LOINC only where both hold it),
`Specimen` (our lab number and their form number as identifiers, type, collection time, `parent` for an aliquot)
and `Patient` with **only** the fields on the signed field list. The structural check (A8) runs before anything
is stored as outbound. Example (FIXTURE; trimmed; the full files are written at Step 3 and run through the structural check there):

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:task-1",
      "request": { "method": "POST", "url": "Task" },
      "resource": {
        "resourceType": "Task",
        "status": "requested",
        "intent": "order",
        "identifier": [
          {
            "system": "https://medsync.health/fhir/sid/lab-referral/{hospitalId}",
            "value": "RF-2026-0312"
          }
        ],
        "basedOn": [{ "reference": "urn:uuid:sr-1" }],
        "focus": { "reference": "urn:uuid:sr-1" },
        "for": { "reference": "urn:uuid:pt-1" },
        "owner": { "display": "Reference lab A (fixture)" },
        "input": [
          { "type": { "text": "Specimen" }, "valueReference": { "reference": "urn:uuid:sp-1" } }
        ]
      }
    },
    {
      "fullUrl": "urn:uuid:sr-1",
      "request": { "method": "POST", "url": "ServiceRequest" },
      "resource": {
        "resourceType": "ServiceRequest",
        "status": "active",
        "intent": "order",
        "subject": { "reference": "urn:uuid:pt-1" },
        "code": {
          "coding": [{ "system": "urn:partner:{partnerId}:tests", "code": "FIXTURE-LIPID" }]
        },
        "specimen": [{ "reference": "urn:uuid:sp-1" }]
      }
    },
    {
      "fullUrl": "urn:uuid:sp-1",
      "request": { "method": "POST", "url": "Specimen" },
      "resource": {
        "resourceType": "Specimen",
        "identifier": [
          {
            "system": "https://medsync.health/fhir/sid/lab-number/{hospitalId}",
            "value": "L00000622"
          },
          { "system": "urn:partner:{partnerId}:form", "value": "RL-55120" }
        ],
        "type": { "text": "Serum" },
        "collection": { "collectedDateTime": "2026-10-13T08:41:00+03:00" },
        "subject": { "reference": "urn:uuid:pt-1" }
      }
    },
    {
      "fullUrl": "urn:uuid:pt-1",
      "request": { "method": "POST", "url": "Patient" },
      "resource": {
        "resourceType": "Patient",
        "identifier": [
          { "system": "https://medsync.health/fhir/sid/mrn/{hospitalId}", "value": "MS-2026-00034" }
        ],
        "name": [{ "text": "Fixture Twelve" }],
        "birthDate": "1990-02-02"
      }
    }
  ]
}
```

The Patient carries only what the signed field list allows (here: hospital number, name, date of birth). No
diagnosis, phone or address can appear: the builder has no input for them.

**In** (FX-2, FX-3): `Task` status updates map by the RF-3 table; `DiagnosticReport` + `Observation`s: value,
unit (UCUM code and text), `referenceRange` as sent, performer, issued. A non-conformant but profiled message
(H5 style) parses with a "not base-conformant" flag. Example in (FIXTURE; trimmed):

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    {
      "resource": {
        "resourceType": "Task",
        "status": "completed",
        "identifier": [
          {
            "system": "https://medsync.health/fhir/sid/lab-referral/{hospitalId}",
            "value": "RF-2026-0312"
          }
        ],
        "output": [
          { "type": { "text": "Result" }, "valueReference": { "reference": "DiagnosticReport/r1" } }
        ]
      }
    },
    {
      "resource": {
        "resourceType": "DiagnosticReport",
        "id": "r1",
        "status": "final",
        "identifier": [{ "system": "urn:partner:{partnerId}:report", "value": "RPT-77310" }],
        "specimen": [
          { "identifier": { "system": "urn:partner:{partnerId}:form", "value": "RL-55120" } }
        ],
        "issued": "2026-10-14T16:05:00+03:00",
        "result": [{ "reference": "Observation/o1" }]
      }
    },
    {
      "resource": {
        "resourceType": "Observation",
        "id": "o1",
        "status": "final",
        "code": {
          "coding": [{ "system": "urn:partner:{partnerId}:tests", "code": "FIXTURE-CHOL" }]
        },
        "valueQuantity": {
          "value": 4.2,
          "unit": "mmol/L",
          "system": "http://unitsofmeasure.org",
          "code": "mmol/L"
        },
        "referenceRange": [{ "text": "FIXTURE range as sent" }]
      }
    }
  ]
}
```

It matches by MA-1 on the form number plus name and date of birth or hospital number, carried in the bundle's
Patient when the partner sends one; with neither, it waits as `demographics_disagree` ("Cannot compare").

---

## 8. Screens (annotated from the canvas; the prompt and DESIGN-medsync.md win)

| Screen                   | Artboard | Route                             | Notes                                                                                                                                                                                                                                    |
| ------------------------ | -------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| To refer + send panel    | 1        | `/lab/refer` (extended)           | Segments with counts; select boxes; high-risk rows not selectable; amber `lb-hr` note; send panel per §5.1 of the prompt; Add to manifest disabled with the Appendix A reason                                                            |
| Manifest (print)         | 2        | `/lab/refer/manifests/[id]/print` | A4 portrait, black on white, ≥ 12 px, Code 128 SVG; reprint "Copy"                                                                                                                                                                       |
| Referrals                | 3        | `/lab/referrals`                  | Five tiles (each opens its rows; "No data" not 0); Now chips per the prompt's table; the selected referral's panel is a right column on wide screens and stacks below on phones (not a pop-up); its actions open centred `EditorDialog`s |
| Result back on paper     | 4        | `/lab/referrals/[id]/result`      | Identity and match line; printed values, units, ranges; flag against theirs; scan; checker; Release                                                                                                                                      |
| Doctor's view            | 5        | doctor results + order line       | Referred tag in "Done at"; provenance block (sky tint, hairline, no left bar); Open the original report; "Sent out, waiting"                                                                                                             |
| Connections and messages | 6        | `/lab/exchange`                   | Tiles; connections with state sentences; messages table; dead-letter dialog                                                                                                                                                              |
| Waiting for a match      | 7        | `/lab/exchange/matches`           | Rule note; table; comparison with values hidden; actions                                                                                                                                                                                 |
| Analysers                | 8        | `/lab/exchange/analysers`         | This slice: each `devices` analyser with "Typed by hand · Waiting for {maker}'s interface document"; no pairing until Step 10                                                                                                            |
| Analyser result entry    | 9        | —                                 | Not built (Step 10 gap)                                                                                                                                                                                                                  |
| Partners                 | 10       | `/lab/exchange/partners`          | Register, tests and turnaround, field list, legal record; signatures                                                                                                                                                                     |

Nav (`lib/lab/nav.ts`): To refer (exists), **Referrals**; group **Exchange**: Connections, Waiting for a match,
Analysers, Partners. Each behind its flag and permission. Colour: amber with icon and word for overdue, rejected,
lost, retrying, needs a person, waiting for a match; dashed neutral for packed and cancelled; neutral with a check
for connected, delivered, matched, result back; sky tint for referred provenance; **no red, no green**.

---

## 9. Sign-off packs (templates only; pre-filled only from current practice and sources; no values proposed)

| Pack                         | Signed by                    | Pre-filled from                                                                                                                                                                                    | Left blank for the signer                                                          |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Partner tests                | Lab lead                     | Nothing yet (Q3 not in hand)                                                                                                                                                                       | Every code, turnaround, identifier, requirement, source                            |
| Packing checklist            | Lab lead                     | Item **headings** from the WHO 2025–2026 transport guidance (H11): triple packaging; UN3373 Category B mark; forms between the second layer and the outer box; temperature as the destination asks | Which items apply per destination and category; the destination's own instructions |
| Legal record                 | Data protection lead         | The DPPA sections (H12) as the list of choices                                                                                                                                                     | Basis, agreement, dates, PDPO reference, breach contact                            |
| Field list                   | Data protection lead         | The allow-list of fields MedSync can send                                                                                                                                                          | Which fields, clinical question yes or no                                          |
| High-risk wording            | IPC lead (CSO countersigns)  | Appendix A text                                                                                                                                                                                    | Site procedure reference, who packs, who carries, who is informed                  |
| HMIS 10.4                    | Lab lead + HMIS focal person | HM-14 definitions                                                                                                                                                                                  | The Division of Health Information's turnaround definition (Q14)                   |
| Analyser mapping, shadow run | Lab lead                     | — (Step 10 not built)                                                                                                                                                                              | —                                                                                  |

---

## 10. Appendix A copy (all `draft` in `content/lab-phase-4.ts`, word for word; status per string)

Every string of prompt Appendix A, unchanged, status **draft**. The CSO signs those a clinician reads (order line
×3, rejected, lost, cancelled, provenance ×3, filed after mismatch, no range printed, unknown unit); the IPC lead
signs "High-risk referral"; the rest are lab-facing and signed by the CSO with the batch. Strings the build adds
(empty states, dialog titles, errors) are added to the same file as `draft` and listed at STOP 7.

---

## 11. Signature

| Item                                           | Signed by      | Date        | How                                                                                              |
| ---------------------------------------------- | -------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| §2 decisions D-LAB4-01 … 26, E-LAB4-01 … 03    | Fadhul (owner) | 17 OCT 2026 | GATE A question 1: "Sign as recommended"                                                         |
| D-LAB4-09 and D-LAB4-12 (CSO)                  | Fadhul (CSO)   | 17 OCT 2026 | GATE A question 2: "Sign both"                                                                   |
| A1–A21 (adjustments from STOP 0)               | Fadhul (owner) | 17 OCT 2026 | GATE A question 3: "Accept all"                                                                  |
| B1–B5, `bridge-and-security.md` (D-LAB4-14/15) | Fadhul (owner) | 17 OCT 2026 | GATE A question 4: "Adopt OpenELIS + companion"; the GATE S checklist itself is signed at GATE S |
| Hazard log                                     | not yet        |             | Signed by the CSO at Step 12, closed with tests                                                  |
| Appendix A copy                                | not yet        |             | `LAB4_COPY_STATUS` stays draft until the CSO (and the IPC lead for the high-risk line) sign      |
