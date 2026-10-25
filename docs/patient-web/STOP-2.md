# STOP 2: the foundation (25 Oct 2026)

Commits: ebd809c2 (packages/patient-core, ADR 0420), 1da64a17 (tokens, kit, shell, guards, harness).
Everything sits behind `PATIENT_WEB_TIDE=1`; with it off `/pw` is a 404 and no route is rewritten
(`PW_ROUTES` is empty until an area's page is built).

| Check                                                  | Result                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| S1 kit axe (JSDOM, `tests/patient-web/kit.test.ts`)    | 0 violations                                                                                                                          |
| S1 gallery in Chrome, 1440 / 834 / 390, light and dark | axe serious/critical 0, Help visible, no horizontal scroll                                                                            |
| S2 guards (`tests/patient-web/guards.test.ts`)         | raw colour, red/amber/green, dose, queue, disabled reason, no sheet/drawer, no browser storage, forced light, token block = generator |
| S3 shell (Help, rail/bare, plus order)                 | pass                                                                                                                                  |
| Typecheck, lint, full Vitest                           | pass (490 files, 11,337 tests)                                                                                                        |
| Phone jest after the patient-core move                 | 44 suites, 584 tests pass                                                                                                             |
| First load, gzip                                       | `/pw/gallery` 313 kB JS + 54 kB CSS (the whole kit); old `/patient` 303 kB + 54 kB                                                    |

Built in their area steps, not here: Ticket, HealthCard, WeekChart, Cascade/NowCard, Ring, RangeBar,
ProgressBar, DoctorBadge, MoodFace, PlaceMap, TimeChips, PhoneField, OtpBoxes, DateTile, SegmentTiles.

Owner: run `scripts/patient-web/seed-test-patients.mjs` on dev (signed-in harness runs and the Step 0
LCP/INP baselines need it); D-PW-04 against 0188's care-team read is still open.
