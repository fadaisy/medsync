# Reference-data sources

Status of every `ref_*` / lookup catalog MedSync ships, the upstream
source behind it, and what still needs to land before we treat the
catalog as production-complete.

The seeds live in migrations `0010_seed_onboarding_reference.sql` and
`0011_patient_profiles.sql`. Provenance for every batch is recorded in
`public.ref_data_versions` (one row per `dataset × version_date`).

Updating a dataset is non-destructive: append a new `ref_data_versions`
row, then upsert into the relevant table in a follow-up migration with
`ON CONFLICT … DO UPDATE`.

| Dataset                  | Table(s)                         | Source                                                                | Status              | Notes                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ug_regions`             | `ref_regions`                    | Uganda statistical regions (UBOS; stable historical fact)             | Complete            | 4 regions; not subject to UBOS versioning.                                                                                                                                                                                                                                       |
| `ug_districts`           | `ref_districts`                  | UBOS NPHC 2024 framework (135 districts + 11 cities)                  | Placeholder         | Migration 0010 records the dataset row with `row_count=0`. 0011 seeds 21 districts (Kampala, Wakiso, Mukono, Mpigi, Luwero, Masaka, Jinja, Mbale, Soroti, Tororo, Iganga, Gulu, Lira, Arua, Kitgum, Moroto, Mbarara, Kabale, Kasese, Hoima, Fort Portal). Full 135+11 list TODO. |
| `ug_subcounties`         | `ref_subcounties`                | UBOS NPHC 2024 framework (~2,184 subcounties)                         | Placeholder         | 0011 seeds the 5 Kampala divisions only (KCCA: Central, Kawempe, Makindye, Nakawa, Rubaga). All other districts: TODO.                                                                                                                                                           |
| `ug_councils`            | `ref_councils`                   | Council websites + MoH HRH Strategic Plan 2020–2030                   | Complete\*          | 4 regulators (UMDPC, UNMC, AHPC, PSU). PSU ("Pharmaceutical Society of Uganda") flagged — confirm the official pharmacy _regulator_ name (Pharmacy Council vs PSU).                                                                                                              |
| `ug_cadres`              | `ref_cadres`                     | Ministry of Public Service scheme of service + MoH HRH Strategic Plan | Complete            | Full national cadre catalog, council-linked.                                                                                                                                                                                                                                     |
| `ug_specialties_im`      | `ref_specialties`                | Phase 0.11 hospital_departments seed                                  | Complete (IM scope) | Internal Medicine + 13 sub-specialties. New specialties land when MedSync onboards new departments.                                                                                                                                                                              |
| `ug_roles_im`            | `ref_roles`                      | Derived from MoH schemes of service + Phase 0.11 IM seed              | Complete (IM scope) | IM-scoped role catalog.                                                                                                                                                                                                                                                          |
| `ug_districts_minimal`   | `ref_districts` (subset)         | Hand-seeded subset of UBOS NPHC 2024 framework — GATE C bootstrap     | Placeholder         | Recorded 2026-05-23 with `row_count=21`.                                                                                                                                                                                                                                         |
| `ug_subcounties_kampala` | `ref_subcounties` (Kampala only) | KCCA — Kampala City Council Authority divisions                       | Placeholder         | Recorded 2026-05-23 with `row_count=5`.                                                                                                                                                                                                                                          |

## Outstanding work (GATE H or later)

1. **Full UBOS NPHC 2024 district + subcounty pull.** Source: UBOS
   National Population and Housing Census 2024 framework. The dataset
   row already exists; replacement migration drops a new
   `ref_data_versions` row + `INSERT … ON CONFLICT (code) DO NOTHING`
   bundles for the missing 114 districts and ~2,179 subcounties.

2. **Confirm the pharmacy regulator name.** The seed currently uses
   `PSU = Pharmaceutical Society of Uganda`. PSU is the professional
   society; the _regulator_ may be a separate body (Pharmacy Council
   under MoH). Verify against the National Drug Authority and update
   the row in `ref_councils` with a new
   `ref_data_versions` entry on resolution.

3. **Specialty + role catalog expansion beyond IM.** Adding a new
   department to a hospital today requires:
   1. INSERT a row in `ref_specialties` (and any sub-specialties).
   2. INSERT one or more rows in `ref_roles` referencing the cadre +
      (optionally) specialty.
   3. INSERT the `hospital_departments` row that the affiliation form
      will resolve against.
   4. Update `ref_data_versions` with the source.

4. **Geographic seeds for the rest of Uganda.** Once UBOS 2024 lands,
   re-test `/signup/patient` district + subcounty cascading on small
   districts and reseed the Kampala-divisions example data in the
   docs.

## Operational notes

- All `ref_*` tables are `public` SELECT (anon + authenticated) — they
  contain no PHI and the forms hit them while the user is still
  unauthenticated.
- Mutations are service-role only and go through migrations.
- The `ref_data_versions` UNIQUE on `(dataset, version_date)` keeps
  the table idempotent under re-runs and gives `git blame`-style
  history of source revisions.
