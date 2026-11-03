# RECON-SETUP: SETUP-TABS §E and §G → this repo (migration 0274, GATED)

## Tables (§E)

| Spec                         | Real                                                                                                                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `golive_items` + state + ev. | **create** `pharmacy_golive_items` (record/mark answers; auto items computed, never stored), `pharmacy_golive_state`, `pharmacy_golive_events`. Existing `pharmacy_golive` (0129, per point) and `pharmacy_location_golive` (0180, per place) stay: place switch-on keeps working |
| `practice_sessions`          | **create** `pharmacy_practice_sessions`; practice rows in a `pharmacy_practice` schema, truncated on end                                                                                                                                                                          |
| `places` (extend)            | **alter** `pharmacy_locations`: `hours`, `supplied_from uuid`, `supplier_ids uuid[]`, `handover_slots time[]`, `free`, `pay_first`, `closed_at/by/note` (close = guard: no stock)                                                                                                 |
| `devices`                    | **create** `pharmacy_devices` (`public.devices` is the EMR glucometer table — not reused)                                                                                                                                                                                         |
| `fridges` (extend)           | **alter** `pharmacy_fridges` 0268: `location_id` nullable, `sensor_id`; one place at most is the column itself                                                                                                                                                                    |
| `fridge_readings`            | **reuse** `pharmacy_fridge_readings` 0268 (`source` sensor/chart, `slot` am/pm); **add** `note`; out-of-range needs it                                                                                                                                                            |
| `fridge_excursions`          | **create** `pharmacy_fridge_excursions` (opened by trigger on an out-of-range reading); `pharmacy_excursion_acks` stays the action record                                                                                                                                         |
| `suppliers` (extend)         | **create** `pharmacy_suppliers` (none exists; orders name suppliers as text today — check `pharmacy_orders`)                                                                                                                                                                      |
| `handover_sessions`          | **reuse** `pharmacy_shift_handovers` + `pharmacy_shift_handover_misses` (0267)                                                                                                                                                                                                    |
| `pharmacy_rules` (extend)    | **reuse** 0270 + 0273 `params`; **add** `pharmacy_rule_groups` (`shows_on`, group signatures), proposals `kind`, `status` rejected + `reject_note`. Proposer ≠ second signer: already in 0273 `pharmacy_rule_sign`                                                                |
| `sms_provider`               | **create** `pharmacy_sms_provider` (`api_key_secret_ref` → Supabase Vault; never selected to the client)                                                                                                                                                                          |
| `sms_templates`              | **reuse/widen** `pharmacy_sms_rules` 0268 (+0273 staff rules): add `audience`, `timing`, `lg_checked_by/at`                                                                                                                                                                       |
| `sms_outbox`                 | **reuse** `pharmacy_sms_messages` (phone encrypted + hmac already); add `parts`, `delivered_at`, status `queued/delivered`                                                                                                                                                        |
| `sms_optouts`                | **reuse** `pharmacy_sms_optouts` (hmac PK = no duplicates); add `reason`                                                                                                                                                                                                          |
| `sms_settings`               | **create** `pharmacy_sms_settings` (`monthly_budget_ugx`)                                                                                                                                                                                                                         |

## Derivations (§F) → `lib/pharmacy/derive/setup/{golive,places,rules,messages}.ts`

`ruleText`/`validateParam` already in `lib/pharmacy/rules/registry.ts` (re-export). Phone: `e164` in `lib/pharmacy/epi/store.ts`.

## Actions (§G) → `lib/pharmacy/actions/setup/*.ts` + `app/pharmacy/setup/setup-actions.ts` ("use server")

Pattern `runPharmacyWrite` (as `lib/pharmacy/actions/roster.ts`). Rules: propose = `lib/pharmacy/rules/actions.ts`,
sign/withdraw = `lib/pharmacy/medicines/store.ts`; add reject + group sign. SMS send: `lib/pharmacy/sms-sender.ts` over
`lib/notifications/africastalking.ts`; webhooks → `app/api/pharmacy/sms/{delivery,stop}/route.ts` (idempotent on
provider id). Scheduler: extend the existing pharmacy SMS cron (find with `rg -n "sms" app/api -g route.ts`).

## UI → `components/pharmacy/setup/{going-live,places,rules,messages}/*`; page tabs in `app/pharmacy/setup/page.tsx`

Old code to delete in step 9: `LiveTab`, `PlacesTab` (`_components/places-tab.tsx`, `cold-setup.tsx`, `chips.tsx`),
`RulesTab`, the Messages tab, `loadLive`/`loadRules`/`loadColdSetup` in `_lib/read.ts`, unused `RC.setup.*` keys.

Tests: no Playwright in the repo → Vitest + PGlite (`tests/emr-db/pharmacy-setup-*.test.ts`) for §I and the SQL
guards; the 1440/390 pass on a dev fixture `/styleguide/pharmacy-setup` in the browser pane.
