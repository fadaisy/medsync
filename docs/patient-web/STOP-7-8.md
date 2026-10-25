# STOP 7 and 8: Help and safety, getting in (25 Oct 2026)

Behind `PATIENT_WEB_TIDE=1`, `PW_ROUTES` now also covers `/emergency` (+ lines, crisis, sexual-violence,
tell, status), `/signup/patient` and `/patient/consent`. Staff sign-in (`/sign-in`) is unchanged.

Seen in Chrome (harness, signed out, 1440/834/390, light and dark): `/emergency`, `/emergency/lines`,
`/emergency/crisis`, `/signup/patient` — axe serious/critical 0, no side scroll, Help on every page but
Help itself; Help renders light with the OS in dark (S22).

| Scenario                                                                      | Check                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| S21 nothing dialled or sent during the countdown; cancel leaves no event      | `help.test.ts`                                                                        |
| S22 Help forced light                                                         | `help.test.ts` + harness screenshot                                                   |
| S23 signed out: national lines, nothing personal                              | `help.test.ts` render test + harness                                                  |
| S24 phone UA `tel:`; computer shows the number and the dial-from-a-phone line | `help.test.ts`                                                                        |
| S25 sign-up validations with their words                                      | `getting-in.test.ts`; 31/02, leading 6, age 17 seen in the browser                    |
| S26 consent version and hash as the phone; SMS unticked                       | `getting-in.test.ts` (against the server's own schema)                                |
| S27 "Not my own device" writes no browser storage; sign-out clears the choice | `getting-in.test.ts`; the choice is an httpOnly session cookie cleared by `/sign-out` |

Changes to shared files (invisible to staff): `/sign-out` deletes the `pw-device` cookie;
`/sign-in` shows the idle sign-out line only with `?idle=1`; `app/emergency/_lib` gained `tiles.ts` (moved,
unchanged) and `loadEmergencyContext` returns `userId`.

Not built, for the owner:

- The "own device" offline set (service worker for Help, ticket and health card; IndexedDB outbox). "Yes"
  says it is coming later. The 7-day rule's "password again for history edits" is not built either.
- Pre-alert form and status panel keep their old look inside the Tide page.
- "Show this to the medic" is built from the patient's own rows, as the phone does; `pt-emergency-sheet`
  returns contacts and facilities only.
- Phone-code and health-card sign-in stay off (`mobilePhoneOtp`, `mobileQrSignIn`).
- Idle time is counted per tab.
- Fixed in passing: every patient-web page title read "… · MedSync · MedSync" (the root template adds it).
  The old patient pages still double it.
