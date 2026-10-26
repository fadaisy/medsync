# STOP 3: Home, the plus, readings, notifications, mood (25 Oct 2026)

Commit e02a5990. Behind `PATIENT_WEB_TIDE=1`: `/patient`, `/patient/mood`, `/patient/notifications`,
`/patient/care/readings` (`?kind=`) now serve the Tide pages.

| Scenario                                                                        | Where it is checked                                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| S4 first run / cascade order                                                    | `tests/patient-web/home.test.ts` (pure day builder)                    |
| S5 take → toast, Undo, rail badge, Care                                         | `home.test.ts` + layout revalidation; not yet seen in a browser        |
| S6 every threshold edge ±0.1, each sugar context, Save and get help, chest pain | `tests/patient-web/readings.test.ts` against the shared threshold JSON |
| S7 doctor badges: real clinicians, "New", shared fee, no queue count            | `home.test.ts` + guards                                                |
| S8 kind map, route keys, read on open                                           | `tests/patient-web/notifications.test.ts`                              |

Typecheck, lint, 129 patient-web/patient-core tests and the guards pass; gallery harness: axe 0, Help, no
side scroll at 1440/834/390 in both themes. Signed-in pages are NOT yet seen in a browser: they need the
test patients (`scripts/patient-web/seed-test-patients.mjs`, owner, dev database).

Changes from the brief, for review:

- The danger interrupt opens in place inside Log a reading, not at `/patient/care/readings/danger?value=…`:
  W4 forbids readings in query strings and W3 forbids browser storage.
- Web saves (reading, take, Undo, mood) insert with the patient's own Supabase session under RLS, as the
  phone does; `logReadingAction` lacks `pulse` and the sugar context. Pulse and mood need migration 0170.
- The phone's pure dose, log and doctor rules were copied into `packages/patient-core/{medicines,log,doctors}.ts`;
  the phone still has its own copies until a mobile change re-exports them.
- The bell counts messages only; the phone's bell also counts doses due now.
- Fixed: the token generator turned `10px` into `10`, which voided the card shadow.

Gaps: Eat card shows the empty wording (food list not shared yet); mood faces use the nearest Tide tokens
(the generator does not emit the phone's mood colours); no live-share banner yet (Step 7); notifications
do not list doses due (the phone's in-row "I took it").
