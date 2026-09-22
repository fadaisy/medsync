# MedSync — PRD: Symptom Catalog & Emergency Pathway

### Update to the existing booking system (patient workspace, book-or-queue, scheduling engine)

| Field             | Value                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doc ID            | MS-PRD-SYM-001                                                                                                                                                                                                                        |
| Status            | **Implemented behind flags** (ADR 0098, 2026-09-22) — clinical content **CSO sign-off pending** (Gate CS); see §15                                                                                                                    |
| Owner             | Fadhul (founder-engineer, CSO)                                                                                                                                                                                                        |
| Surfaces          | Patient mobile (Expo) — primary; patient web (Next.js) — secondary; receptionist workspace (hospital receiving side)                                                                                                                  |
| Depends on        | Scheduling engine ✅, book-or-queue ✅, entry points + unified intake (`awaiting_triage` seam) ✅, triage engine v2 ✅, receptionist workspace ✅, persistent emergency affordance ✅ (stub target), hospital setup/facility model ✅ |
| Does NOT wait for | Notifications engine (Tier 3, not built) — designed around it; see §8.6                                                                                                                                                               |
| Roadmap position  | Tier 2 rail upgrade (patient front door). Does not jump the Tier 3 queue: it writes into existing engines and adds two small engines of its own (catalog + pre-arrival), both built engine-first.                                     |

---

## 0. One-paragraph summary

Patients booking on MedSync today describe why they are coming in free text or not at all. This update adds a **plain-language symptom catalog** in front of booking. The patient taps what they feel (in words a layperson uses, with icons), the catalog sorts the selection into one of three deterministic tiers — **Emergency (go now)**, **Urgent (be seen today)**, **Routine (book)** — and hands the structured symptoms to the booking or queue flow, and later to triage. Any emergency-tier selection interrupts booking and opens the **Emergency Pathway**: one tap to call the right emergency number for where the patient is, and two taps to **pre-alert a MedSync hospital** ("I am coming, this is what is wrong, about 20 minutes, by boda"). The hospital sees the incoming patient on its reception board in real time, acknowledges, and on arrival converts the alert into an intake record already flagged for priority triage. The catalog is not a diagnosis tool and never tells anyone they are fine.

---

## 1. Problem and context

1. **Booking has no clinical signal.** Appointments arrive without structured reason-for-visit, so the scheduling engine cannot prioritise, reception cannot route to the right service line, and triage starts from zero.
2. **Dangerous presentations enter the booking funnel.** A patient with chest pain or a child who cannot drink should never be offered "next Tuesday at 10:00". Without a catalog, the app cannot tell the difference.
3. **Ugandans largely do not know how to summon emergency help.** A Twaweza _Sauti za Wananchi_ survey found that about 95% of Ugandans did not know the medical emergency number; many rely on boda bodas, private vehicles or calling a health worker they know. The Ministry of Health's Department of Emergency Medical Services announced a dedicated ambulance short code, **912**, secured through UCC; as of late 2025 the DGHS stated it would be introduced by year-end. General emergency remains **112 (mobile) / 999**, routed through the Uganda Police National Emergency Call Centre. MedSync can close part of this knowledge gap by putting the correct number, for the patient's location, one tap away at the moment it is needed.
4. **Hospitals receive emergencies cold.** Most patients self-transport. A pre-arrival notice (who, what, when, how) lets the emergency unit prepare a bed, a clinician, oxygen or an isolation space before the patient walks in. This is the civilian equivalent of an ambulance pre-alert, and it is achievable with software alone.

**MedSync-specific correlation.** The concept note's premise (the monitoring gap) produces exactly these patients: the diabetic at home with vomiting and drowsiness, the hypertensive with a new one-sided weakness. The catalog carries a dedicated "Blood pressure & sugar" category so MedSync's core NCD population is recognised first.

---

## 2. Goals and non-goals

### Goals

- G1. A lay person finds any catalogued symptom in **≤ 3 taps and at most one short scroll** on a 360×640 phone (measurable; §7.3).
- G2. Every emergency-tier symptom routes to the Emergency Pathway; **no emergency-tier selection can end in a routine booking** without the patient explicitly stating the danger sign is not present now (logged).
- G3. From any screen, a patient reaches a tel: call to the correct emergency number in **≤ 2 taps**.
- G4. A MedSync hospital can be pre-alerted in **≤ 2 taps after opening the emergency sheet** (all fields pre-filled with safe defaults).
- G5. Structured symptoms (catalog item keys + qualifiers + catalog version) attach to every appointment/queue entry and to the intake record, ready for triage v2 and the clinical reasoning engine.
- G6. Works offline for everything except sending data: catalog, tiering and calling are fully offline.

### Non-goals (explicit)

- No diagnosis, no differential, no "likely condition" output to patients. Service-line hints ("Eye clinic") are navigation, not diagnosis.
- No reassurance. The app never says "this is not serious" or "you can wait".
- No dosing, no drug names, no drug first aid (standing law). Non-drug first-aid micro-cards are behind a CSO flag, off by default (§5.6).
- MedSync does not dispatch ambulances and never implies it does. It connects the patient to those who do.
- No free-text AI classification. Free text is passed to humans only.
- No numeric vital-sign thresholds on the patient catalog (those belong to the monitoring engine's clinician-defined thresholds, Tier 3).

---

## 3. Users and scenarios

| Actor                     | Scenario                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registered patient (self) | Has had a cough and fever for 3 days; taps Fever & infection → "Fever with shivering, body pains" (Urgent) → offered same-day slot or queue, and advised to get a malaria test today.                |
| Parent / caregiver        | Child (2 months–5 years) "not able to drink or breastfeed" → immediate Emergency interrupt with IMCI-derived wording.                                                                                |
| Pregnant patient          | Pregnancy toggle on; "severe headache with blurred vision" → Emergency.                                                                                                                              |
| Bystander, not logged in  | Taps the persistent Emergency pill on the public site; calls 112; optionally pre-alerts nearest MedSync hospital with a callback number (unverified flag).                                           |
| MedSync NCD patient       | "Sugar very high with vomiting, deep fast breathing or drowsiness" → Emergency; pre-alert to their own facility pre-selected.                                                                        |
| Receptionist (hospital)   | Sees "Incoming emergency — ETA 15–30 min — by boda — chest pain spreading to arm — adult male" card; acknowledges; on arrival taps "Arrived" → intake created, `awaiting_triage`, priority flag set. |

---

## 4. Where this sits in the system (interlinkages)

```
Patient app ──► [Symptom Catalog (content pkg, offline)] ──► classify() ──► tier
      │                                                         │
      │  Routine/Urgent ──► book-or-queue ──► scheduling engine (appointment.presenting_symptoms)
      │                                               │
      │                                               └─► on arrival ─► intake record ─► triage v2
      │
      └─ Emergency / persistent pill ──► Emergency sheet ──► tel: (emergency_contacts ref-data)
                                            │
                                            └─► pre-arrival engine ──► receptionist incoming board (realtime)
                                                                          │ ack → patient status
                                                                          └ arrived → intake (entry_point = self_presentation_prealerted)
                                                                                      awaiting_triage, priority flag
```

| Existing component                             | What this update does to it                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Persistent emergency affordance (standing law) | Its target changes from a stub to the Emergency sheet. Placement and visibility unchanged; must remain on every screen, logged in or not.                                                                                      |
| Book-or-queue (patient workspace)              | Gains a pre-step: symptom catalog. Skippable for **follow-ups/reviews only** ("I'm coming for a review"), never for new problems.                                                                                              |
| Scheduling engine                              | `appointments` gains `presenting_symptoms` (structured) + `symptom_tier`; Urgent tier requests a same-day slot using the existing urgent-slot path (the same path monitoring alerts will use).                                 |
| Entry points taxonomy / unified intake         | New entry-point sub-type `self_presentation_prealerted`; pre-arrival carries chief complaint + red flags into the intake record.                                                                                               |
| Triage engine v2                               | Receives catalog items mapped to its discriminators (each item carries `triage_discriminator_ref`). **Triage remains the authority**; the catalog tier is patient-facing advice only and never overrides a clinician's triage. |
| Clinical reasoning engine (differential packs) | Each item carries an optional `reasoning_token_ref`. Two known token gaps are catalogued here in lay form: morning stiffness > 30 min (joint pain pack) and stimulant/drug use (palpitations pack).                            |
| Receptionist workspace                         | Gains an "Incoming" panel (pre-arrival board).                                                                                                                                                                                 |
| Hospital setup                                 | Facility gains `emergency_capability`, `pre_alert_enabled`, emergency-entrance directions, and optional facility ambulance number.                                                                                             |
| Notifications engine (not built)               | Not required. In-app realtime delivers to the hospital; the patient's own phone SMS is the offline fallback; an outbox row is written for the future engine but nothing claims SMS was sent.                                   |

---

## 5. Clinical safety design

### 5.1 Principles

1. **Bias to over-triage.** Under-triage is the safety failure; over-triage is a cost. Every ambiguous rule resolves upward.
2. **Monotonicity invariant.** Adding a symptom or a qualifier can never lower the tier. Enforced by property tests.
3. **Deterministic and transparent.** Tiering is a pure function over a versioned, CSO-signed rule set. The patient sees why: "Because you chose: _Fit / convulsion_".
4. **Advice, not triage.** The catalog tier is patient guidance. Hospital triage v2 always re-assesses.
5. **Never reassure.** Routine outcomes still show: "If it gets worse or you notice any danger sign, tap Emergency."
6. **Versioned provenance.** Every submission stamps `catalog_version` and the rule trace, so any advice given can be reconstructed and audited.

### 5.2 Tiers (aligned to the WHO/ICRC/MSF Interagency Integrated Triage Tool red/yellow/green logic)

| Tier          | Patient-facing label | Action                                                               | Colour                                                     |
| ------------- | -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| E — Emergency | "Get help now"       | Emergency Pathway interrupt                                          | Red `#DC2626` (the only place red appears in this feature) |
| U — Urgent    | "Be seen today"      | Same-day slot or join queue today; emergency fallback always visible | Amber (clinical-signal trio, permitted)                    |
| R — Routine   | "Book a visit"       | Standard booking with service-line hint                              | Neutral/teal (no status colour)                            |

### 5.3 Escalation rules (deterministic, versioned)

- R1. Any selected item with tier E → E.
- R2. Any qualifier marked `escalates_to: E` answered positively → E (e.g. Headache → "sudden, worst ever").
- R3. Audience modifiers: fever in a baby under 2 months → E; fever in pregnancy with "too weak to get out of bed" → E; any IMCI general danger sign in a child → E.
- R4. Fever + any unusual bleeding (gums, nose, skin, urine, vomit) → E **and** `isolation_flag = true` on the pre-alert (VHF/EVD awareness: the hospital prepares isolation before arrival; IPC-critical in Uganda).
- R5. Otherwise the maximum item tier.
- R6. Free text never changes the tier.
- R7. Rules are data (in the content package), not code branches; the engine interprets them.

### 5.4 Emergency interrupt behaviour

- Selecting an E item immediately opens the Emergency sheet (does not wait for "Continue").
- To return to booking the patient must choose **"This is not happening now"** (e.g. the fit was last year). This is logged as `emergency_declined` with the item key. Patients are never blocked from booking, but the default and visual weight are on getting help.

### 5.5 Special routes

- **Self-harm / suicidal thoughts**: a dedicated, calm screen (not red, no alarm sounds): "You don't have to go through this alone." Shows crisis contacts (reference data, verification pending, §Appendix B) and the emergency call; offers to pre-alert a facility with mental-health services. No questionnaires.
- **Sexual violence**: calm screen; explains care is time-sensitive (within 72 hours matters), offers the nearest facility and a same-day slot; no detail collection in-app.

### 5.6 First-aid micro-cards (flagged, off by default)

Non-drug, WHO Basic Emergency Care-consistent one-liners (e.g. "Press firmly on bleeding with a clean cloth", "Lie the person on their side if they are breathing but not awake", "Note the time the weakness started"). Ship only after CSO sign-off (`FEATURE_FIRST_AID_CARDS`). The "note the time" card is valuable for stroke care and should be prioritised for sign-off.

### 5.7 Sign-off gate (Gate CS)

The catalog JSON, rule set, first-aid cards and emergency contacts each need a signed CSO artifact before `status: signed`. Unsigned content runs only in dev/staging, visibly watermarked "Unsigned clinical content".

---

## 6. The symptom catalog

### 6.1 Information architecture

- **Audience selector (top, one row):** `Me` · `A child` · `Someone else`. Child → age band (`under 2 months` · `2 months–5 years` · `5–12 years`). Adult/other → `Pregnant or gave birth in the last 6 weeks?` toggle (shown only when relevant: sex-at-birth female or unknown).
- **Danger-sign strip:** audience-specific top danger signs, always visible on landing (adult, child and pregnancy variants).
- **Category grid (12 slots, 3×4 on mobile):**
  1. Breathing & chest
  2. Head, brain & nerves
  3. Belly & digestion
  4. Fever & infection
  5. Injuries, cuts & burns
  6. Blood pressure & sugar
  7. Eyes, ears, nose & throat
  8. Urine, private parts & pregnancy
  9. Bones, joints & muscles
  10. Skin
  11. Mood, sleep & mind
  12. Child illness (replaces "Skin" slot position when audience = child; Skin moves into search) / "Something else" (search + free text)
- **Search:** instant, offline, over labels + lay synonyms (including common Ugandan English: "fits", "pressure" for hypertension, "sugar" for diabetes, "flu" for cold; Luganda/Swahili synonyms in v1.1).
- **Category sheet:** bottom sheet (mobile) / right pane (web) listing ≤ 8 items; E items first with a red left rule and the word "Emergency" (colour never the sole cue).
- **Selection tray:** sticky bottom bar: "2 selected · Continue". Tapping expands to review/remove.
- **Qualifiers:** at most 2 per item, single-tap chips, only where they change the tier or the service line (onset, severity).

### 6.2 Catalog item schema (content package)

```ts
type CatalogItem = {
  key: string; // stable, e.g. "SYM.CHEST.PAIN_SPREADING"
  category: CategoryKey;
  audience: ("adult" | "child_u2m" | "child_2m_5y" | "child_5_12" | "pregnant" | "all")[];
  tier: "E" | "U" | "R";
  labelKey: string; // i18n key; English ≤ 9 words, reading age ~11
  helperKey?: string; // one short line of plain explanation
  icon: IconKey; // from MedSync icon set; never a body-horror image
  synonyms: string[]; // lay search terms
  qualifiers?: Qualifier[]; // max 2
  serviceLineHint?: ServiceLineKey;
  triageDiscriminatorRef?: string; // triage v2 discriminator id
  reasoningTokenRef?: string; // clinical reasoning token id
  flags?: ("isolation" | "crisis_route" | "sv_route" | "stroke_time")[];
  sourceRefs: SourceKey[]; // Appendix C keys; required for every E and U item
};
type Qualifier = {
  key: string;
  promptKey: string;
  options: { key: string; labelKey: string; escalatesTo?: "E" | "U" }[];
};
```

### 6.3 Lay-language content rules

1. Describe what the person **feels or sees**, never the disease ("Can't catch your breath", not "Dyspnoea").
2. One idea per item; ≤ 9 words in the label; one helper line max.
3. Verbs of time and severity where they matter: "sudden", "won't stop", "getting worse".
4. No medical jargon unless it is the common word Ugandans use ("pressure", "sugar", "fits", "malaria test").
5. No numbers except durations and ages. "Meter says HI" is allowed as a lay cue.
6. Everything translatable: no string concatenation, no idioms that do not translate.

The v0.1 draft content is in **Appendix A** (≈ 90 items).

---

## 7. UX specification

### 7.1 Design system constraints (standing)

- Clinical surface: permanently light theme.
- Red `#DC2626` only on: Emergency pill, emergency-tier markers, Emergency sheet primary actions, hospital Incoming card. Invariant test extended to this allowlist.
- Amber only for Urgent tier; teal-600 for primary non-emergency actions; monochrome elsewhere.
- Neue Haas Grotesk; 4px grid; tap targets ≥ 48×48 dp; body text ≥ 16px; supports OS font scaling to 200% without clipping (layout reflows; this is where one scroll is permitted).
- Icons always paired with words (low-literacy support); never icon-only.

### 7.2 Screens — patient

**S1 Landing "What's wrong?"** (mobile, 360×640 reference)

| Zone                                                                                               | Height budget |
| -------------------------------------------------------------------------------------------------- | ------------- |
| App bar: back · title · **Emergency pill** (red, persistent)                                       | 56            |
| Audience selector (segmented)                                                                      | 44            |
| Search field                                                                                       | 48            |
| Danger-sign strip: 4 most critical for audience as 2×2 compact tiles + "All danger signs (n)" link | 132           |
| Category grid 3×4 (icon + 2-line label, 84px rows)                                                 | 336 + gaps    |
| Selection tray (hidden until first selection)                                                      | 64            |

Total ≈ 640–660 → fits entirely on 360×740 and larger; at most one short scroll on 360×640. **No nested scroll regions. No horizontal carousels** (hidden items are a safety risk).

**S2 Category sheet** — bottom sheet at 88% height; ≤ 8 items in one column; each row 56px; E items first. Multi-select. No inner scroll at default font size.

**S3 Qualifier chips** — inline expansion under the selected row (not a new screen); ≤ 2 questions.

**S4 Review & outcome** — shows selections, tier, "Because you chose…" reason, and the next action:

- U: "Be seen today" → earliest same-day slot at preferred/nearest facility **or** "Join today's queue" (book-or-queue) + Emergency fallback line.
- R: service-line hint + booking calendar (existing UI) + optional "Anything else to tell the clinic?" (encrypted free text, 500 chars).

**Desktop web** — two-pane: left (audience, search, danger signs, categories), right (items / review). Nothing modal except the Emergency sheet. Keyboard fully operable; `/` focuses search.

### 7.3 Navigation budget (acceptance-tested)

- Any catalog item: ≤ 3 taps from S1 (category → item → continue) or search (type → tap).
- Emergency call: ≤ 2 taps from any screen (pill → call).
- Pre-alert: ≤ 2 taps from Emergency sheet (Tell a hospital → Send) using defaults.
- Automated check: Playwright/E2E counts interactions; screenshot matrix 360×640, 360×740, 390×844, 768×1024, 1280×800.

### 7.4 States

Empty, searching, no results ("We couldn't find that. Pick the closest area, or describe it in your words." + danger-sign reminder), offline (banner; all catalog functions work), sending, sent, failed (retry + SMS fallback), unsigned-content watermark (non-prod).

### 7.5 Accessibility and language

WCAG 2.2 AA; screen-reader labels include the tier word; reduced-motion respected (no pulsing red for reduced-motion users; the pill pulses once on load otherwise); haptic on emergency interrupt (mobile). i18n keys from day one; v1 English; v1.1 Luganda + Swahili (needs translation + clinical back-translation review under Gate CS).

### 7.6 Offline

Catalog JSON is bundled in both clients (versioned) and refreshed when online. Classification is local. Facility list for "nearest" is cached (non-PHI). Calling uses the cellular network (tel:). Only submissions and pre-alerts need data; failed sends queue and retry, and the SMS fallback is offered.

---

## 8. Emergency Pathway

### 8.1 Entry

(a) Persistent Emergency pill (every screen, logged in or not, web and mobile); (b) emergency interrupt from the catalog; (c) future: monitoring-engine alert (Tier 3) will deep-link here.

### 8.2 E1 Emergency sheet (full screen, no scroll)

1. Header: "Get help now". One line: "If the person is not breathing or can't be woken, call now."
2. **Primary call button**: the top-priority verified number for the patient's district (national default **112**). Secondary numbers (up to 3): 999; 912 once verified live; KCCA toll-free for Kampala; facility ambulance if the preselected hospital registered one. All `tel:` links; one tap each.
3. **"Tell a hospital I'm coming"** (secondary button: white fill, red text and border) → E2.
4. Optional "What's happening?" (only if entered via the pill, not the catalog): 8 icon tiles of top danger signs, skippable; improves the pre-alert.
5. First-aid card slot (flagged, §5.6).

### 8.3 E2 Pre-alert (defaults make it two taps)

| Field                                | Default                                                                                                                                     | Notes                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hospital                             | Nearest MedSync facility with `emergency_capability = 24h` and `pre_alert_enabled`; for linked patients, their own facility if within range | Top 3 shown with distance; non-MedSync facilities listed as "Call only" with phone number. Nearest is computed **on device** from the cached facility list; location never leaves the phone unless §8.3 last row is chosen. |
| Who                                  | Me (logged in) / Someone else (age band, sex, pregnant)                                                                                     |                                                                                                                                                                                                                             |
| What                                 | Items from catalog or E1 tiles; else "Not sure"                                                                                             |                                                                                                                                                                                                                             |
| When it started                      | "Just now"                                                                                                                                  | Stroke flag prompts "When were they last normal?"                                                                                                                                                                           |
| Getting there by                     | Boda / Car / Taxi / Ambulance / Walking                                                                                                     |                                                                                                                                                                                                                             |
| Arriving in                          | "15–30 min"                                                                                                                                 | Bands, not fake precision                                                                                                                                                                                                   |
| Callback number                      | Account phone / entered                                                                                                                     |                                                                                                                                                                                                                             |
| Share my location with this hospital | Off                                                                                                                                         | Only for facilities that run their own ambulance; explicit, one-time                                                                                                                                                        |

### 8.4 E3 Status

`Sent` → `Seen by hospital` (ack) → `Ready for you` (optional second state when staff mark prepared). Shows: emergency entrance directions and landmark (from hospital setup), hospital phone, "Cancel — I'm no longer coming", "We've arrived". **Ack timeout** (default 5 min, Gate): "We couldn't confirm the hospital saw this. Please call them:" + number, and the SMS fallback.

### 8.5 Hospital side — Incoming board (receptionist workspace; also visible to triage/ED roles at that facility)

- Realtime card: red "Incoming emergency", ETA band, transport, subject descriptor, danger signs in lay + clinical label (from `triageDiscriminatorRef`), `isolation_flag` banner ("Prepare isolation — fever with bleeding"), `stroke_time` if given, callback (tap to call), verified/unverified badge.
- Actions: **Acknowledge**, **Ready**, **Call**, **Arrived** (creates intake: entry point `self_presentation_prealerted`, status `awaiting_triage`, chief complaint pre-filled, priority flag), **Not arriving / Hoax** (feeds abuse control).
- Audible chime (configurable), persistent badge until acknowledged; unacknowledged > 2 min escalates visually to all on-duty board viewers at that facility. Cross-role escalation by SMS/push waits for the notifications engine.

### 8.6 Delivery without the notifications engine (engine-first compliance)

- Primary channel: the pre-arrival row itself, delivered by realtime subscription (Supabase Realtime with RLS, or SSE/polling if the repo is on the local-first Prisma stack). This is a real engine, not a stub.
- Offline patient fallback: `sms:` deep link pre-filled with a compact message to the facility's registered emergency SMS number (if configured) — uses the patient's own SIM, no Africa's Talking cost, no data needed.
- Future channel: an outbox row `pre_arrival.facility_sms` with status `awaiting_notifications_engine`. The UI never claims an SMS was sent.

### 8.7 Abuse and misuse controls

- Authenticated pre-alerts: `verified = true`.
- Unauthenticated: allowed (safety floor — a bystander must be able to act) with callback number required, rate limit 3/hour/device and 5/day/phone, `verified = false` badge. No OTP in the emergency path (friction kills).
- Hospitals mark hoaxes; repeated hoaxes from a device/phone hash → silent downgrade to call-only for 24h (never block calling).

---

## 9. Data and backend

### 9.1 Content package (single source of truth)

`packages/clinical-content/symptom-catalog/` → `catalog.v0.1.json`, `rules.v0.1.json`, `schema.ts` (Zod), `classify.ts` (pure), `checksum`. Imported by web and mobile; seeded into the DB for referential integrity and audit. Build fails if the JSON fails schema validation or an E/U item lacks `sourceRefs`.

### 9.2 Tables (names indicative; follow repo conventions)

| Table                      | Purpose                   | Key columns                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `symptom_catalog_versions` | Provenance                | version, status (draft/signed/retired), checksum, signed_by, signed_at, signoff_artifact_ref                                                                                                                                                                                                                                                                           |
| `symptom_catalog_items`    | Mirror for FK/audit       | key, version_id, tier, category, audience[], refs                                                                                                                                                                                                                                                                                                                      |
| `symptom_submissions`      | What the patient reported | id, patient_id?, reporter_user_id?, audience, age_band, pregnant, items[], qualifiers jsonb, computed_tier, rule_trace jsonb, catalog_version, free_text_enc?, outcome (booked/queued/emergency/emergency_declined/abandoned), appointment_id?, pre_arrival_id?                                                                                                        |
| `emergency_pre_arrivals`   | Pre-alert engine          | id, facility_id, submission_id?, patient_id?, subject_descriptor jsonb, red_flags[], isolation_flag, onset_at?, last_known_well_at?, transport_mode, eta_band, callback_phone_enc, location_enc?, status (sent/seen/ready/arrived/cancelled/expired/not_arriving/hoax), verified, acknowledged_by/at, arrived_intake_id?, reporter_token_hash, device_hash, expires_at |
| `emergency_contacts`       | Reference data            | scope (national/district/facility), district_id?, facility_id?, label, number, kind (general/ambulance/crisis/sv), priority, verification_status, verified_by/at, active                                                                                                                                                                                               |
| `facilities` (alter)       | Capability                | emergency_capability (none/daytime/24h), pre_alert_enabled, emergency_entrance_directions, emergency_sms_number?, ambulance_number?                                                                                                                                                                                                                                    |
| `appointments` (alter)     | Linkage                   | presenting_symptoms jsonb, symptom_tier, symptom_submission_id                                                                                                                                                                                                                                                                                                         |

### 9.3 Access (RLS on every table)

- Submissions: patient reads own; reporter reads own; facility staff (reception/triage/clinical at that facility) read only submissions linked to their facility's appointments or pre-arrivals; superadmin: no PHI (break-glass only).
- Pre-arrivals: insert only via server function (validation + rate limit + audit); facility board roles read/update their facility's rows; unauthenticated reporter reads/cancels own row via one-time capability token (hash stored).
- Emergency contacts: public read of `active AND verified`; write by superadmin with **four-eyes** (safety-critical reference data) and by hospital admin for own facility rows.
- Catalog tables: public read of signed versions; write by seed/migration only.

### 9.4 Server functions (Edge Function pattern: Zod + auth + role + PII-safe logging + audit)

`submitSymptoms`, `createPreArrival`, `updatePreArrivalStatus` (hospital), `cancelPreArrival` (reporter), `markArrived` (creates intake via the existing intake service, not a parallel path), `listEmergencyContacts(district)`.

### 9.5 Jobs

- Expire pre-arrivals not arrived after 6 h → `expired`.
- Null `location_enc` 72 h after creation (keep district).
- Nightly integrity: every submission's `catalog_version` exists and is signed (prod).

### 9.6 Audit

Append-only rows for: submission created, emergency interrupt shown, emergency declined, call tapped (number id only), pre-alert created, every status change, catalog/contacts sign-off and edits.

---

## 10. Privacy and DPPA 2019

- Data minimisation: nearest-facility computation on device; location sent only on explicit one-time choice; free text optional and encrypted (AES-256-GCM via `lib/encryption.ts`).
- Lawful basis for unauthenticated emergency pre-alerts (a bystander submitting data about another person) to be confirmed by counsel; working assumption is the vital-interest / medical-purpose ground. Flagged to the legal workstream.
- No epidemiological reuse of emergency data without the separate, independently declinable consent (standing law).
- Retention: pre-arrival PHI retained with the resulting intake record under clinical retention rules; non-arrived pre-alerts purged of PHI after 30 days (Gate).

---

## 11. Success metrics

| Metric                                                     | Target (pilot)                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| Median taps to reach selected symptom                      | ≤ 3                                                         |
| Search zero-result rate                                    | < 5% (each miss logged anonymously as a catalog-gap signal) |
| Emergency-tier selections that result in call or pre-alert | > 80%                                                       |
| Pre-alert ack rate / median time to ack                    | > 90% / < 3 min                                             |
| Pre-alerted patients who arrive                            | tracked (baseline)                                          |
| Over-triage: app tier E vs hospital triage Red/Orange      | tracked; feeds the local validation workstream              |
| Under-triage: app R/U but hospital triage Red              | **target 0; every case reviewed by CSO**                    |
| Booking completion after catalog added                     | ≥ baseline − 5% (catalog must not hurt conversion)          |

---

## 12. Risks

| Risk                                           | Mitigation                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Under-triage by the catalog                    | Over-triage bias, monotonicity tests, CSO review of every under-triage case, "never reassure" copy                            |
| 912 or other numbers wrong or not live         | Numbers are reference data with verification status; only `verified` numbers display in prod; quarterly re-verification task  |
| Hospital does not watch the board              | Ack timeout fallback to call; facility onboarding requires a named board owner per shift before `pre_alert_enabled`           |
| Hoax pre-alerts                                | Rate limits, unverified badge, hoax marking, device/phone hash downgrade                                                      |
| Catalog grows and breaks the one-screen budget | Hard caps in schema (≤ 8 items per category, ≤ 2 qualifiers); CI screenshot matrix                                            |
| Mobile clinical-write Gate CG not yet signed   | Ship mobile submissions and pre-alerts behind flags, off until CG is signed; calling ships immediately (not a clinical write) |
| Literacy and language                          | Icons + words, reading age ~11, Luganda/Swahili in v1.1 with back-translation                                                 |

---

## 13. Gate A decisions for Fadhul

1. Emergency numbers and order per district; confirm 912 live status before enabling.
2. Crisis and sexual-violence contacts (Appendix B candidates need verification).
3. Allow unauthenticated pre-alerts (recommended: yes, rate-limited, unverified badge).
4. Ack timeout (recommended 5 min) and board escalation threshold (recommended 2 min).
5. First-aid micro-cards: sign off the "note the time" and "bleeding pressure" cards first, or hold all.
6. Catalog v0.1 content and rules (Appendix A): sign as-is, amend, or restrict to adult + child + pregnancy danger signs for pilot.
7. Pilot languages (recommended: English at launch, Luganda next).
8. Retention for non-arrived pre-alerts (recommended 30 days).

---

## 14. Acceptance criteria (summary; the build prompt carries the full test list)

- All E items (and rule-escalated combinations) open the Emergency sheet; golden-case table passes 100%.
- Monotonicity property test passes (≥ 10,000 generated cases).
- Navigation budget met on the screenshot matrix; no nested scroll; no horizontal carousel.
- Emergency pill present on every route (route-walk test), logged in and out.
- RLS probes: cross-facility read of pre-arrivals denied; superadmin PHI read denied; unauthenticated token scope limited to own row.
- Red token appears only in allowlisted components (invariant test).
- Offline: catalog, tiering, and tel: work with network disabled.
- axe: 0 serious/critical violations; Lighthouse accessibility ≥ 95 (web).
- Pre-alert → ack → arrived → intake `awaiting_triage` end-to-end test green.

---

## 15. Build status and handover (2026-09-22)

Built per [ADR 0098](../adr/0098-symptom-catalog-and-emergency-pathway.md) (rulings, Gate A decisions, build record,
flags matrix) on `feat/booking-app`; recon in `docs/recon/RECON-SYMPTOM-CATALOG.md`. Production behaviour is
unchanged until the gates below are met: every flag defaults off, the catalog renders only a `signed` version, the
Emergency sheet shows `verified` contacts only and falls back to the hospital's registered phone.

| Gate                 | Owner       | What to do                                                                                                                                                                                                          |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gate A** item 1    | Fadhul      | Dial 112 / 999 / 912 / KCCA 0800 299 000 and verify each per `docs/runbooks/emergency-contacts-verification.md`; source the three `to_source` rows.                                                                 |
| **Gate A** items 2–8 | —           | Decided on the standing instruction — table in ADR 0098. Revisit any by a new ADR.                                                                                                                                  |
| **Gate CS**          | CSO         | Read Appendix A as encoded (`_shared/symptom-catalog/catalog.v0.1.json`, checksum `fnv1a64:44b95a8410501112`); sign via `/admin/emergency` or `npm run db:seed-symptom-catalog -- --sign <ref> --signed-by <uuid>`. |
| **Gate CG**          | Fadhul      | After CS and one verified national contact: set `FEATURE_SYMPTOM_CATALOG=1`, `FEATURE_PRE_ALERT=1` in Vercel production; `EXPO_PUBLIC_FEATURE_*` in the EAS production profile.                                     |
| Facility onboarding  | Hosp. admin | `docs/runbooks/pre-alert-facility-onboarding.md` — capability, board owner, directions, numbers, coordinates.                                                                                                       |

**§14 acceptance, as met:** golden cases and 10,000-case monotonicity (`tests/symptom-catalog/classify.test.ts`);
navigation budget, route walk, pill-on-every-route and the S1 height budget as source-level Vitest checks (no
screenshot matrix, no Lighthouse — ADR 0098 ruling 11); RLS probes as written against 0066
(`tests/emergency/rls-as-written.test.ts`); red allowlist (`tests/design/red-reserved.test.ts`); offline `tel:` and
cached contacts on the phone; axe on the statically rendered public pages (E1 is server-rendered and walked by
`tests/emergency/web-pathway.test.ts` instead); pre-alert → ack → arrived → `awaiting_triage` pinned at the source
(`tests/emergency/pre-arrival-functions.test.ts`), live DB run left to the owner.

**Known gap:** no four-eyes action has a second-approval executor yet, so contact verification self-executes only
while one real superadmin exists (runbook, ADR 0098 build record).

---

## Appendix A — Catalog v0.1 draft content (CSO sign-off pending)

Tier: **E** Emergency · **U** Urgent today · **R** Routine. Sources keyed to Appendix C. Labels are English drafts in lay language.

### A.0 Danger-sign strip (landing)

| Audience                      | Four shown on landing                                                                                                                    | Source                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Adult                         | Can't breathe properly · Chest pain spreading or with sweating · Face drooping / one side weak / speech trouble · Fit, or can't be woken | IITT, AHA/ASA                               |
| Child 2m–5y                   | Can't drink or breastfeed · Vomits everything · Fits · Very sleepy, hard to wake                                                         | WHO IMCI                                    |
| Child < 2m                    | Not feeding · Fever or feels cold · Fits · Fast breathing or chest pulling in                                                            | WHO IMCI young infant                       |
| Pregnant / recently delivered | Bleeding from the vagina · Fits · Severe headache with blurred vision · Fever and too weak to get out of bed                             | WHO counselling for maternal & newborn care |

### A.1 Breathing & chest

| Tier | Lay label                                                                                      | Qualifiers / notes                                  | Src        |
| ---- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------- |
| E    | Struggling to breathe or can't finish a sentence                                               |                                                     | IITT       |
| E    | Lips or tongue turning blue or grey                                                            |                                                     | IITT       |
| E    | Chest pain lasting more than a few minutes, or spreading to arm, jaw or back, or with sweating |                                                     | AHA        |
| E    | Coughing up a lot of blood                                                                     |                                                     | IITT       |
| U    | Wheezing or tight chest not settling with your usual inhaler                                   | Q: "Can you speak normally?" No → E                 | IITT, GINA |
| U    | New breathlessness when walking or lying flat                                                  | Q: legs swelling? (service hint: cardiology)        | ESC HF     |
| U    | Cough with fever and fast breathing                                                            |                                                     | IMCI/IITT  |
| R    | Cough for more than 2 weeks                                                                    | helper: "You may need a TB test" (priority routine) | WHO TB     |
| R    | Cold, runny or blocked nose                                                                    |                                                     | —          |

### A.2 Head, brain & nerves

| Tier | Lay label                                                       | Qualifiers / notes                                     | Src            |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------ | -------------- |
| E    | Face drooping, arm or leg weak on one side, or trouble speaking | flag `stroke_time`; asks "When were they last normal?" | AHA/ASA FAST   |
| E    | Fit or convulsion, now or just happened                         |                                                        | IITT           |
| E    | Can't be woken, or suddenly very confused                       |                                                        | IITT           |
| E    | Sudden, very severe headache, the worst ever                    |                                                        | ASA            |
| E    | Headache with fever and stiff neck                              |                                                        | WHO meningitis |
| E    | Fainted and not fully recovering, or fainted with chest pain    |                                                        | ESC syncope    |
| U    | Headache with fever                                             | helper: "Get a malaria test today"                     | UCG            |
| U    | Weakness or numbness getting worse over days                    |                                                        | —              |
| R    | Headaches that keep coming back                                 | Q: sudden/worst ever → E                               | —              |
| R    | Dizzy or light-headed                                           | Q: with chest pain or fainting → E                     | —              |
| R    | Burning, tingling or numb feet                                  | service hint: diabetes/NCD                             | ADA            |

### A.3 Belly & digestion

| Tier | Lay label                                                      | Qualifiers / notes        | Src           |
| ---- | -------------------------------------------------------------- | ------------------------- | ------------- |
| E    | Vomiting blood, or black sticky stool                          |                           | IITT          |
| E    | Very severe belly pain, can't stand straight                   |                           | IITT          |
| U    | Vomiting everything, can't keep water down                     | child audience → E (IMCI) | IMCI          |
| U    | Many watery stools with weakness, very thirsty or little urine |                           | WHO diarrhoea |
| U    | Yellow eyes or skin                                            |                           | —             |
| U    | Belly pain with fever                                          |                           | —             |
| U    | Blood in stool                                                 |                           | —             |
| R    | Burning in the stomach or chest after eating                   |                           | —             |
| R    | Hard stool or change in bowel habit                            |                           | —             |

### A.4 Fever & infection

| Tier | Lay label                                                      | Qualifiers / notes                 | Src                |
| ---- | -------------------------------------------------------------- | ---------------------------------- | ------------------ |
| E    | Fever with unusual bleeding (gums, nose, skin, urine or vomit) | flag `isolation`; rule R4          | WHO VHF / MoH      |
| E    | Fever with confusion, very sleepy or fits                      |                                    | WHO severe malaria |
| U    | Fever with shivering and body pains                            | helper: "Get a malaria test today" | UCG                |
| U    | Fever lasting more than 2 days                                 |                                    | UCG                |
| U    | Red, hot, swollen skin that is spreading                       |                                    | —                  |
| R    | Mild fever with cold symptoms                                  |                                    | —                  |

### A.5 Injuries, cuts & burns

| Tier | Lay label                                                                       | Qualifiers / notes                          | Src                   |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------- | --------------------- |
| E    | Bleeding that won't stop when pressed                                           |                                             | IITT/BEC              |
| E    | Serious accident: road crash, fall from height, stab or gunshot                 |                                             | IITT high-risk trauma |
| E    | Head injury with vomiting, drowsiness or a fit                                  |                                             | NICE head injury      |
| E    | Large burn, or burn to face, hands, genitals, or from electricity or chemicals  |                                             | WHO burns             |
| E    | Snake bite                                                                      |                                             | WHO snakebite         |
| E    | Swallowed poison, chemicals, or too many pills                                  |                                             | IITT                  |
| E    | Swelling of lips, tongue or throat, or rash with trouble breathing              |                                             | WAO anaphylaxis       |
| U    | Dog or other animal bite                                                        | helper: "You may need rabies vaccine today" | WHO rabies            |
| U    | Deep cut that may need stitches                                                 |                                             | —                     |
| U    | Wound that is red, hot, swollen or smells, or a foot wound if you have diabetes | service hint: diabetic foot                 | IWGDF                 |
| R    | Small cut, scrape or bruise                                                     |                                             | —                     |

### A.6 Blood pressure & sugar

| Tier | Lay label                                                                              | Qualifiers / notes              | Src               |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------- | ----------------- |
| E    | High sugar (or meter says HI) with vomiting, deep fast breathing or drowsiness         |                                 | ADA/IDF DKA       |
| E    | Low sugar signs (shaking, sweating, confused) that are not improving, or can't swallow |                                 | ADA hypoglycaemia |
| E    | High blood pressure with chest pain, weakness, severe headache or blurred vision       |                                 | ESH/ISH           |
| U    | Sugar readings high for several days                                                   |                                 | ADA               |
| U    | Blood pressure readings high again and again                                           |                                 | ISH               |
| U    | Legs swelling and passing much less urine                                              | service hint: renal             | KDIGO             |
| U    | Ran out of insulin                                                                     |                                 | —                 |
| R    | Side effects from my medicines                                                         |                                 | —                 |
| R    | Ran out of my regular medicines (not insulin)                                          | links to e-pharmacy later       | —                 |
| R    | Routine check or review                                                                | skips catalog for review visits | —                 |

### A.7 Eyes, ears, nose & throat

| Tier | Lay label                                                      | Qualifiers / notes                                  | Src             |
| ---- | -------------------------------------------------------------- | --------------------------------------------------- | --------------- |
| E    | Sudden loss of sight in one or both eyes                       |                                                     | AAO             |
| E    | Chemical splashed in the eye                                   |                                                     | WHO BEC         |
| E    | Throat so swollen you can't swallow saliva, or noisy breathing |                                                     | IITT            |
| U    | Painful red eye, or injury to the eye                          |                                                     | AAO             |
| U    | Ear pain with fever or discharge                               |                                                     | —               |
| R    | Vision slowly getting blurry                                   | helper: "Especially important if you have diabetes" | ADA retinopathy |
| R    | Sore throat, blocked ears or nose                              |                                                     | —               |

### A.8 Urine, private parts & pregnancy

| Tier | Lay label                                                          | Audience / notes                | Src     |
| ---- | ------------------------------------------------------------------ | ------------------------------- | ------- |
| E    | Bleeding from the vagina while pregnant                            | pregnant                        | WHO MNH |
| E    | Fits while pregnant or after birth                                 | pregnant                        | WHO MNH |
| E    | Severe headache with blurred vision while pregnant                 | pregnant                        | WHO MNH |
| E    | Fever and too weak to get out of bed (pregnant or just gave birth) | pregnant                        | WHO MNH |
| E    | Severe belly pain while pregnant                                   | pregnant                        | WHO MNH |
| E    | Fast or difficult breathing while pregnant                         | pregnant                        | WHO MNH |
| E    | Baby moving less than usual or not at all                          | pregnant; over-triage by design | RCOG    |
| E    | Heavy vaginal bleeding, soaking pads, feeling faint                | all female                      | —       |
| U    | Water broke before labour is due                                   | pregnant                        | WHO     |
| U    | Swelling of face, hands or legs while pregnant                     | pregnant                        | WHO MNH |
| U    | Can't pass urine at all                                            |                                 | —       |
| U    | Burning urine with fever or back pain                              |                                 | —       |
| U    | Blood in urine                                                     |                                 | —       |
| U    | Sexual violence (care within 72 hours matters)                     | flag `sv_route`                 | WHO/UCG |
| R    | Burning when passing urine, no fever                               |                                 | —       |
| R    | Unusual discharge or itching                                       |                                 | —       |
| R    | Family planning                                                    |                                 | —       |

### A.9 Bones, joints & muscles

| Tier | Lay label                                                           | Qualifiers / notes                           | Src      |
| ---- | ------------------------------------------------------------------- | -------------------------------------------- | -------- |
| E    | Bone showing, or limb bent out of shape or cold                     |                                              | IITT     |
| E    | Back pain with new leg weakness or loss of bladder or bowel control |                                              | NICE     |
| U    | One joint hot, swollen and very painful, with fever                 | ref: joint-pain pack (septic arthritis)      | EULAR    |
| U    | One calf painful and swollen                                        |                                              | NICE VTE |
| R    | Joints stiff for more than 30 minutes in the morning                | token gap filled: `TOK.MORNING_STIFFNESS_30` | EULAR    |
| R    | Joint pain or swelling                                              |                                              | —        |
| R    | Back pain, muscle pain                                              |                                              | —        |

### A.10 Skin

| Tier | Lay label                                                  | Qualifiers / notes | Src |
| ---- | ---------------------------------------------------------- | ------------------ | --- |
| E    | Skin peeling or blistering widely, with sore mouth or eyes |                    | —   |
| U    | Rash with fever                                            |                    | —   |
| R    | Itchy rash                                                 |                    | —   |
| R    | Spots, pimples, dry skin                                   |                    | —   |

### A.11 Mood, sleep & mind

| Tier | Lay label                                                  | Qualifiers / notes                                          | Src       |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| E    | Thinking of ending your life or harming yourself           | flag `crisis_route`; calm screen, not red                   | WHO mhGAP |
| E    | Someone behaving dangerously or hearing voices and at risk |                                                             | mhGAP     |
| R    | Feeling low, worried, or not coping                        |                                                             | mhGAP     |
| R    | Trouble sleeping                                           |                                                             | —         |
| R    | Worried about alcohol or drug use                          | reasoning token: stimulant/drug use (palpitations pack gap) | —         |
| R    | Heart racing or pounding                                   | Q: with chest pain or fainting → E                          | ESC       |

### A.12 Child illness (audience = child)

| Tier | Lay label                                                   | Age band  | Src               |
| ---- | ----------------------------------------------------------- | --------- | ----------------- |
| E    | Not able to drink or breastfeed                             | all child | IMCI              |
| E    | Vomits everything                                           | all child | IMCI              |
| E    | Fits during this illness                                    | all child | IMCI              |
| E    | Very sleepy, floppy, or hard to wake                        | all child | IMCI              |
| E    | Breathing fast or chest pulling in when breathing           | all child | IMCI              |
| E    | Baby under 2 months: fever, feels cold, or not feeding well | < 2m      | IMCI young infant |
| U    | Very pale palms                                             | all child | IMCI              |
| U    | Diarrhoea with sunken eyes or drinking eagerly              | all child | IMCI              |
| U    | Fever (needs a malaria test today)                          | all child | IMCI/UCG          |
| U    | Swelling of both feet, or very thin                         | all child | IMCI              |
| R    | Cough or cold without fast breathing                        | all child | IMCI              |
| R    | Rash, ear problem, or not growing well                      | all child | IMCI              |

---

## Appendix B — Emergency contacts reference data (verification required before prod)

| Label                               | Number                                              | Scope             | Kind      | Status                                            | Basis                                     |
| ----------------------------------- | --------------------------------------------------- | ----------------- | --------- | ------------------------------------------------- | ----------------------------------------- |
| General emergency (mobile)          | 112                                                 | National          | general   | Likely live — verify                              | Uganda Police NECC; gov.ug emergency page |
| General emergency                   | 999                                                 | National          | general   | Likely live — verify                              | as above                                  |
| MoH ambulance short code            | 912                                                 | National          | ambulance | **Unverified — announced, launch status unknown** | MoH DGHS statement Nov 2025               |
| KCCA city ambulance (toll-free)     | 0800 299 000                                        | Kampala districts | ambulance | Verify                                            | KCCA announcement                         |
| Uganda Red Cross highway ambulances | TBC                                                 | National highways | ambulance | To source                                         | URCS                                      |
| Facility ambulance                  | per facility                                        | Facility          | ambulance | Hospital admin enters; four-eyes verify           | Hospital setup                            |
| Crisis / mental health              | TBC (Butabika NRH switchboard as interim candidate) | National          | crisis    | To source and verify                              | gov.ug listing                            |
| Sexual violence support             | TBC                                                 | National          | sv        | To source and verify                              | —                                         |

Rule: only `verified` numbers render in production. Every number shows its label ("Police emergency line", "Ambulance"), never a bare digit string.

---

## Appendix C — Sources (verify currency at sign-off)

- **IITT** — WHO/ICRC/MSF Interagency Integrated Triage Tool (reference card and guidance), who.int/emergencycare; validation: Mitchell et al., Lancet Reg Health West Pac 2021 (PMC8358156); low-resource triage review PMC11865852. IITT is already used in Ugandan decision-support work (OASES app, Kalongo; NCT07257705).
- **WHO BEC** — WHO/ICRC Basic Emergency Care: approach to the acutely ill and injured.
- **IMCI** — WHO Integrated Management of Childhood Illness, general danger signs (NCBI Bookshelf NBK143736).
- **WHO MNH** — WHO Counselling for Maternal and Newborn Health Care, danger signs in pregnancy (NCBI Bookshelf NBK304178).
- **AHA/ASA** — heart attack and stroke warning signs (heart.org; stroke.org).
- **UCG** — Uganda Clinical Guidelines (current edition) — malaria testing, emergency care chapters.
- **mhGAP** — WHO mhGAP Intervention Guide.
- Others as keyed: GINA, ESC (HF, syncope), ADA/IDF, ESH/ISH, KDIGO, IWGDF, EULAR, NICE (head injury, VTE, back pain), WAO, AAO, RCOG, WHO (TB, burns, snakebite, rabies, VHF).
- **Uganda EMS context** — Twaweza _Sauti za Wananchi_ EMS awareness brief (reported by The Independent, Nov 2024); MoH DGHS on 912 (Nile Post / New Vision via allAfrica, 25 Nov 2025); Uganda national web portal emergency services page; KCCA ambulance launch.
