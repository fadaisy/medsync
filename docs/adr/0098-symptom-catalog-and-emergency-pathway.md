# ADR 0098 — The symptom catalog and the Emergency Pathway: from descriptive words to advisory tiers

**Status:** Accepted — product-owner and CSO decision (PRD MS-PRD-SYM-001, 2026-09-21); **PROVISIONAL** in the same
sense as ADR 0095: the clinical content ships `draft`, production renders only `signed` content (Gate CS), and
mobile clinical writes ship flagged off (Gate CG). Until the owner signs, production behaves exactly as it does today
plus the Emergency sheet.

**Builds on** [ADR 0095](0095-symptoms-at-booking-staff-card-custom-blocks.md), [ADR 0096](0096-symptoms-before-booking.md),
[ADR 0084](0084-book-or-queue-two-doors-relabelled.md), [ADR 0085](0085-marketplace-presentation-on-the-phone.md) §5,
[ADR 0088](0088-gate-c-booking-flow.md), [ADR 0032](0032-reception-non-clinical-boundary.md), [ADR 0038](0038-triage-worklist-name-reveal.md).
**Supersedes in part:** ADR 0084 §3 ("it does not route, ask, or write") and §4 ("no router"); ADR 0088's
"no clinical question anywhere in a booking path"; ADR 0095 ruling 1 ("never ranked, routed, scored or coloured") and
ruling 2's five-column read; ADR 0096 §2 (the eight quick picks), §3 (a generic duration for every symptom) and §5
("nothing reads the picks before the booking is filed"); PRD `docs/booking-app-prd.md` §2.1 row 5, §2.5, §5.4
bullets 2–5 and §7.2 rule 1 as amended by ADR 0095 — each gets a second amendment note. The rest of every one of those
records stands: no diagnosis, no reassurance, no drug names, doses or numeric thresholds in patient copy, free text
never read by an engine, Appendix A reasons unchanged, the interstitial unchanged.

## Context

The owner (who is also the CSO) wrote PRD MS-PRD-SYM-001: a lay-language symptom catalog as a pre-step to booking,
a deterministic three-tier classifier (Emergency / Urgent / Routine), an Emergency Pathway (one tap to a verified
number, two taps to pre-alert a hospital), and a hospital Incoming board. Recon (`docs/recon/RECON-SYMPTOM-CATALOG.md`)
found that the repo's regulatory posture — ADR 0084 §3's MDCG/MHRA line and the clinical-firewall test — forbids
precisely this, and that several things the PRD assumes do not exist: coordinates on hospitals, an emergency-contacts
table, a patient-callable same-day path, a reasoning-token catalog, realtime, browser E2E tooling.

## Decision

### Rulings

1. **(owner + CSO) Symptom input may produce advisory tiering.** The classifier is a pure function over a
   versioned content package; its output is advice to the patient, never a triage record; hospital triage v2
   re-assesses every arrival. Bias to over-triage; monotonicity (adding a symptom or a positive qualifier never lowers
   the tier) is a tested invariant; free text never changes the tier. The regulatory claim narrows from "asks no
   clinical question" to "signposts a next step from a signed, deterministic rule set, with no diagnosis and no
   reassurance". PRD §2.1's own test is met and accepted by the CSO.
2. **(build) Gate CS governs what production shows.** Content ships `status: draft`. Production renders only a
   `signed` catalog version; with none signed, production keeps the ADR 0095/0096 descriptive picker and shortlist
   exactly as shipped, and shows the Emergency sheet using `verified` contacts only. Non-production renders the draft
   catalog under a visible "Unsigned clinical content" watermark. `SYMPTOMS_NOTE` therefore stays true wherever it
   renders: it sits under the descriptive picker, which never routes; the tiered catalog carries its own sentence.
3. **(build) One wire shape, versioned.** `appointments.symptoms` elements stay `{code, label}` with `duration`
   now optional and an optional `qualifiers` list; `normaliseSymptoms` keeps entries without a duration. The tier
   lives on the submission and on the appointment (`symptom_tier`), never on an element, so no staff card can
   colour a list by it (ADR 0095 ruling 1's "no colour derived from the list" stands for the descriptive line; the
   Incoming board's badge comes from the pre-arrival's own red flags and tier).
4. **(build) The content package lives in `supabase/functions/_shared/symptom-catalog/`** (zero-import, the fourth
   such module): `types.ts`, `catalog.v0.1.json` (the signed artifact), `catalog.v0.1.ts` (generated from the JSON
   by `scripts/gen-symptom-catalog.mjs`, checksum embedded — a test fails when they drift), `classify.ts`,
   `contacts.seed.json`, `i18n/en.json`. Appendix A is encoded as written; `triageDiscriminatorRef` maps to
   `lib/triage/discriminators.ts` codes where a clean match exists and is null otherwise; `reasoningTokenRef` is null
   throughout because no token catalog exists (ADR 0081 removed it) — the two "gap" items are catalogued with the
   token ids the PRD names as forward references.
5. **(build) Engines.** Migration 0066 (GATED) adds `patient_symptom_catalog_versions`, `patient_symptom_catalog_items`,
   `symptom_submissions`, `emergency_pre_arrivals`, `emergency_contacts`, `pre_arrival_outbox`; alters `hospitals`
   (`emergency_capability`, `pre_alert_enabled`, `board_owner_note`, `emergency_entrance_directions`,
   `emergency_sms_number`, `ambulance_number`, `latitude`, `longitude`), `appointments` (`symptom_tier`,
   `symptom_submission_id`), `patient_intakes` (`pre_arrival_id`, `symptom_submission_id`); inserts entry type
   `self_presentation_prealerted`; adds the audit actions and target kinds; publishes `emergency_pre_arrivals` to
   Realtime. RLS on every table; PHI (`free_text_enc`, `callback_phone_enc`, `location_enc`) encrypted with the
   shared AES-256-GCM helpers; hashes salted via `blindIndex`.
6. **(build) A patient-callable same-day path.** `pt-request-same-day` finds the earliest slot today at the
   patient's hospital (the urgent-slot search extracted from `system-propose-urgent-appointment` into
   `_shared/urgent-slot.ts`, bounded to `endOfLocalDay`) and books through the one core with `priority: "urgent"`,
   `reason: "new_concern"` (`origin='patient'` + `urgent_review` stays CHECK-forbidden), `symptom_tier: "U"`. No slot →
   the client offers today's queue (`pt-declare-intake`, which now links the submission and derives `priority_hint`
   from the tier).
7. **(owner via PRD) The persistent affordance becomes a red pill that opens the Emergency sheet**, on every route,
   signed in or out, web and phone. On web the in-flow amber block leaves the patient layout (as ADR 0085 did on the
   phone); the pill lives in the root layout and links to `/emergency` (E1, a public, statically renderable page —
   one tap from anywhere, two to a call). On the phone the red tab is the pill on tab screens, the disc on pushed
   screens, and the pre-auth screens gain the disc; the tab screen is E1. `tests/design/red-reserved.test.ts`'s
   allowlist grows by exactly the PRD's list.
8. **(build) Numbers.** `emergency_contacts` seeds Appendix B with its verification statuses; production renders
   `verified` only. Because nothing national is verified at ship, the sheet's primary call falls back to the
   hospital's registered `emergency_phone` (superadmin-set, ADR 0084 §3's only trusted number) and the crisis/SV
   routes show the same until their contacts are sourced. `sa-verify-emergency-contact` requires four-eyes.
9. **(build) Nearest facility without coordinates.** `hospitals.latitude/longitude` are nullable and empty today;
   the on-device ordering is: the patient's own facility, then pre-alert-enabled facilities by distance where both
   sides have coordinates, else by name. Precise location leaves the device only on the explicit per-alert toggle.
   `expo-location` and `expo-haptics` (first-party Expo modules, Expo Go compatible) are added for this PRD's
   requirements; nothing else is installed.
10. **(build) Booked arrivals and pre-alerts never create a second intake.** `ha-pre-arrival-arrived` calls the
    intake service extracted from `ha-register-intake` into `_shared/intake.ts`; a pre-alert whose patient already
    holds a live intake today links to it instead.
11. **(build) Tooling floor honoured, deviations recorded.** No Playwright, Lighthouse or fast-check: the navigation
    budget, route walk, S1 height budget and red allowlist are source-level Vitest checks; monotonicity runs 10,000
    seeded-PRNG cases; screenshot matrices are not produced (no browser automation in the floor); axe runs on the
    statically rendered public pages as today.
12. **(build) Flags.** `FEATURE_SYMPTOM_CATALOG`, `FEATURE_PRE_ALERT`, `FEATURE_FIRST_AID_CARDS` are server env
    booleans (`lib/emergency/feature.ts`, the `lib/encounter/feature.ts` pattern) passed to clients as props, and
    `EXPO_PUBLIC_FEATURE_*` per `eas.json` profile on the phone — all off in production. Calling is never flagged.

### Gate A decisions taken on the owner's standing instruction ("use your recommendations")

| PRD §13 item                         | Decision                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1 Emergency numbers, 912             | Seeded per Appendix B, `unverified`; prod shows none of them until verified; hospital phone is the fallback. |
| 2 Crisis / SV contacts               | Not seeded (no number to seed); routes show the hospital phone and the national general line once verified.  |
| 3 Unauthenticated pre-alerts         | Yes — callback required, 3/h/device, 5/day/phone, `verified=false` badge.                                    |
| 4 Ack timeout / escalation           | 5 min / 2 min.                                                                                               |
| 5 First-aid cards                    | The two named cards ship `draft` behind `FEATURE_FIRST_AID_CARDS` (off).                                     |
| 6 Catalog v0.1                       | Encoded as written, `draft`.                                                                                 |
| 7 Languages                          | English.                                                                                                     |
| 8 Retention (non-arrived pre-alerts) | 30 days, then PHI purged by the sweeper.                                                                     |

## Consequences

- The clinical firewall test is rewritten to the amended rule (ADR 0098 §Rulings 1–3): what it now enforces is no
  diagnosis, no reassurance, no drug/dose/threshold copy, free text inert to every engine, triage reading only
  discriminator refs, monotonicity, content caps, the red allowlist, and that staff surfaces never sort the
  descriptive line.
- Audit volume grows: submissions, interrupts, declines, call taps (contact id only), pre-alert status changes.
- The sweeper runs on the daily Hobby cadence; the status screen's ack timeout is client-side and does not depend on it.
- Two catalogues coexist deliberately: the clinician `symptom_catalog` (clerkship) and the patient package. They
  never share a table.

## Alternatives considered

- **Keep booking clinically silent and build only the Emergency Pathway.** Rejected by the PRD.
- **Reuse the clinician `symptom_catalog` with a `tier` column.** Rejected: it is CSO-governed clerkship reference
  data in clinician vocabulary, and the firewall guards its decision-support flags.
- **A child table for symptoms on the appointment.** Rejected again (ADR 0095): jsonb rides the existing RLS.
- **Realtime via SSE from Next.** Rejected: Supabase Realtime with RLS is one migration line; polling stays the fallback.
- **Blocking the desk on a duration for catalog items.** Moot: catalog items carry their own qualifiers.

## Build record (2026-09-22)

Built as the seven-phase prompt (`docs/prd/PROMPT-SYMPTOM-CATALOG-EMERGENCY.md`) with the owner's standing
"use your recommendations" in place of the STOP gates; recon in `docs/recon/RECON-SYMPTOM-CATALOG.md`.

**What exists.** Catalog v0.1 as data: 109 items (E 46 / U 35 / R 28) in 12 categories, 11 rules (R1–R7 with R3/R4
instances), 18 items carrying a `lib/triage/discriminators.ts` ref, 14 danger-sign items for the landing strip,
`status: draft`, checksum `fnv1a64:44b95a8410501112` stamped on every submission. One migration (0066, GATED,
Appendix B seeded unverified). Eleven new Edge Functions (`pt-submit-symptoms`, `pt-request-same-day`,
`pt-emergency-event`, `pt-emergency-sheet`, `pt-create-pre-arrival`, `pt-pre-arrival-status`, `ha-update-pre-arrival`,
`ha-pre-arrival-arrived`, `ha-set-hospital-emergency-settings`, `sa-verify-emergency-contact`,
`sa-sign-catalog-version`) and four edited (`pt-declare-intake`, `pt-request-appointment`, `ha-register-intake`,
`system-propose-urgent-appointment`), over four new shared modules (`intake.ts`, `urgent-slot.ts`, `pre-arrival.ts`,
`submission-symptoms.ts`). Web: `/patient/symptoms` (S1–S4), the wizard's catalog summary, `/emergency` (E1),
`/emergency/tell` (E2), `/emergency/status` (E3), `/emergency/crisis`, `/emergency/sexual-violence`, the pill in the
root layout, `/reception/incoming` + `/nurse/incoming`, the hospital-admin profile's Emergency panel,
`/admin/emergency`, the desk catalog inside the Front door, the nightly sweeper. Phone: the same screens under
`(app)/symptoms`, root `emergency` (pre-auth), `(tabs)/emergency` and `(app)/emergency/{tell,status,crisis,sv}`.

**Departures from the PRD as written, all recorded above:** E1 is server-rendered (not static) because the verified
contacts and the patient's hospital fallback are read per request — still one tap, no auth, under the public prefix;
no screenshot matrix, no Lighthouse, no Playwright (ruling 11); the web facility picker does not yet print the
capability word (the phone's does); `reasoningTokenRef` is null throughout (ruling 4).

**Known gap carried into the handover:** no four-eyes action in the product has a second-approval executor
(`_shared/four-eyes.ts` exports `loadPendingForConfirm` / `markFourEyesConfirmed`; nothing calls them), so
`sa-verify-emergency-contact` self-executes only while exactly one real superadmin exists
(`docs/runbooks/emergency-contacts-verification.md`).

### Flags and environments

| Flag                                                              | Where read                                                | dev / preview                         | production                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| `FEATURE_SYMPTOM_CATALOG` / `EXPO_PUBLIC_FEATURE_SYMPTOM_CATALOG` | `lib/emergency/feature.ts`, `mobile/src/lib/symptoms.ts`  | `1` → draft under watermark (Gate CS) | unset → descriptive picker (ADR 0095/0096)    |
| `FEATURE_PRE_ALERT` / `EXPO_PUBLIC_FEATURE_PRE_ALERT`             | `lib/emergency/feature.ts`, `mobile/src/lib/emergency.ts` | `1` → "Tell a hospital" on E1         | unset → call-only sheet                       |
| `FEATURE_FIRST_AID_CARDS` / `EXPO_PUBLIC_FEATURE_FIRST_AID_CARDS` | same                                                      | `1` → two draft cards, watermarked    | unset → hidden                                |
| `MEDSYNC_ENV` / `EXPO_PUBLIC_MEDSYNC_ENV`                         | `catalogRenderMode`                                       | anything but `production`             | `production` (web falls back to `VERCEL_ENV`) |
| `CRON_SECRET`                                                     | `/api/cron/sweep-pre-arrivals`                            | required                              | required (Vercel sends it)                    |

Nothing in production needs setting for this round: every flag defaults off, and `catalogRenderMode` returns `off`
when no version is `signed`. `mobile/eas.json` carries no `EXPO_PUBLIC_FEATURE_*` — add them to the `development`
and `preview` profiles' `env` when the phone should show the draft; never to `production`.

### Gate handover

- **Gate CS (CSO):** sign catalog v0.1 — `npm run db:seed-symptom-catalog -- --sign <artifact ref> --signed-by <uuid>`
  or `/admin/emergency` → Catalog versions → Sign (checksum must match `fnv1a64:44b95a8410501112`).
- **Gate CG (owner):** turn `FEATURE_SYMPTOM_CATALOG` / `FEATURE_PRE_ALERT` on for production only after CS and
  after at least one national contact is verified.
- **Gate A item 1 (owner):** dial and verify 112 / 999 / 912 / KCCA per the runbook; source the three `to_source` rows.
