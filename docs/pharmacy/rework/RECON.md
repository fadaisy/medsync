# P0 Recon: kit references → real names (feat/pharmacy-rework, cut from feat/pharmacy-stock-up-polish fe6f448c)

Next migration number: **0265** (0264 is the newest; 0264 is not applied yet).

| Kit reference | Real name in the repo | Decision |
|---|---|---|
| Ledger "movements" | `pharmacy_stock_movements` (0124, extended in 0180 and 0230) | extend it |
| `place_id` | `location_id` (0180), with the old `dispensing_point_id` kept beside it under `psm_place` | keep `location_id` |
| `happened_at` / `entered_at` | `effective_at` / `recorded_at`, which already exist | reuse them; add a generated `late` column |
| `kind` enum | the existing kinds `received, supplied, issued, received_from_issue, ward_used, cart_used, reversed, count_correction, …` | keep them; the kit's kind names map onto these |
| `reverses_id` | `kind='reversed'` + `source_kind='reversal'` + `source_id` | add `reverses_id` (FK) and a unique partial index for one reversal per movement |
| `idempotency_key` | none on movements; the actions use a `clientKey` | add the column, unique per hospital |
| Guard trigger | `private.pharmacy_movement_guard()` (0180:300), trigger `psm_guard` | replace it in 0265 |
| Downtime skip | `IF NEW.downtime THEN RETURN NEW` (0180:313) | replace it: downtime flags the batch `needs_count` |
| Attestations | `pharmacy_attestations` (0122:151), append-only; 30-min window in `0127` guard and in `lib/pharmacy/controlled.ts:118` | single use through a new `pharmacy_attestation_uses` (PK = attestation id), with a 10-minute life |
| Witness sign-in | `lib/auth/attest.ts` `attestSecondPerson` | keep it; add a request/approve flow on the witness's device |
| Controlled marker | TypeScript only: the signed `controlled_classes` set (`pharmacy_signed_sets`) plus `data/pharmacy/controlled-substances.v1.json` by ingredient | add `pharmacy_products.controlled_class`, backfilled and kept in sync by the app; the SQL guard reads it plus the signed set |
| Controlled entries | `pharmacy_controlled_entries` (0127), `dispensing_point_id NOT NULL` | add `location_id`, drop that NOT NULL, require one of the two |
| Catalogue | `cat_*` (0251–0259) plus `pharmacy_products.catalogue_*` (0255) | keep; `pharmacy_products` stays (it is the stock identity) |
| Places | `pharmacy_locations` (0180) + `pharmacy_dispensing_points` (0122) | keep locations; the points stay as the dispensing settings row |
| Prices | `pharmacy_product_prices`, `pharmacy_price_lists` (0257) | reuse them; no new `pharmacy_prices` |
| VEN | `cat_*.emhslu_ven` (0251:198) | reuse it |
| Legal answers | `pharmacy_legal_answers` (0129:88), question 1–8 | gate the permission map on Q1 |
| Permission maps | `lib/pharmacy/access.ts` v1/v2/v3, `data/pharmacy/permission-map.v{1,2,3}.json`, `dispensingMap()` keyed on `VERCEL_ENV` | one map, gated on the recorded legal answer |
| Dev overrides | `PHARMACY_DEV_HOSPITALS` (access.ts), `DEV_SKIP_MFA` (`lib/auth.ts`) | production refuses to boot (instrumentation) |
| Signed copy | `content/pharmacy*.ts` (25 files), `SignedCopy`, `workspaceLiveFor` (`lib/workspace-access/flag.ts`) | new strings go in `content/pharmacy-rework.ts` (draft) |
| Second signed store | `pharmacy_signed_sets` (0122) + `pharmacy_content_entries` (0210) | keep both for now; merging is a P6 deletion |
| Shell | `app/pharmacy/layout.tsx` → `_components/v2/shell.tsx` (behind `PHARMACY_WORKSPACE_V2`) | new 6-section shell replaces both |
| Nav | `lib/pharmacy/nav.ts`, `lib/pharmacy/workspace-v2/places.ts`, `find.ts` | one href map in `lib/pharmacy/ia.ts` |
| Tide kit | `app/lab/_components/v2/*` (29 importers); `components/tide/` already exists (patient Tide) | promote the lab kit to `components/tide/work/` |
| Flags | 21+ `PHARMACY_*` in `lib/pharmacy/feature.ts` | collapse to `PHARMACY_CORE/WARDS/EPI/INSIGHTS` |
| Scope | `requirePharmacyScope()` (`lib/pharmacy/scope.ts:43`) | keep it |
| Patient hand-over | `pharmacy_handovers` (0126): giving medicine to a patient | **name clash**: the shift handover table is `pharmacy_shift_handovers` |
| Counts | `pharmacy_counts`, `pharmacy_count_lines` (0124), month end (`lib/pharmacy/stores/month-end*.ts`) | add `status`, `shelf` and partial save |
| Refills | `pharmacy_refill_requests/_lines/_events`, repeats (0230) | reuse them (0230 is applied per the stock-up branch) |
| Immunisation | none in the EMR | create `pharmacy_epi_*` |
| Duty roster | none (`hospital_admin_roster` holds admins only) | create `pharmacy_duty_roster` |
| Prescribers | EMR staff with prescribing cadres | reuse them plus a `cd_allowed` flag table |
| Demo | `lab_demo_hospitals` (0157) plus `pharmacy_demo_*` (0250); removal by trigger disabling (0260–0263) | soft mark: demo hospitals are filtered; the demo code is frozen |
| Ward / cart use | `lib/pharmacy/stores/ward-store.ts`, `cart-store.ts` (`ward_used`, `cart_used`) | the guard now needs a witness for controlled lines |

Create: `pharmacy_attestation_uses`, `pharmacy_witness_requests`, `pharmacy_duty_roster`, `pharmacy_cd_prescribers`,
`pharmacy_cd_checks(+_lines)`, `pharmacy_shift_handovers(+_lines,+_items)`, `pharmacy_handover_misses`, `pharmacy_cases(+_events)`,
`pharmacy_rx_checks`, `pharmacy_rx_queries`, `pharmacy_round_picks(+_lines)`, `pharmacy_fridges(+_readings,+_excursion_acks,+_contents)`,
`pharmacy_sms_rules`, `pharmacy_sms_messages`, `pharmacy_sms_optouts`, `pharmacy_reports`, `pharmacy_risk_actions`,
`pharmacy_epi_clients`, `pharmacy_epi_doses`, `pharmacy_epi_open_vials`.
