# ADR 0423 — The own-device choice lives in a session cookie

**Status:** Proposed — 2026-10-25 (patient web Step 8; implements D-PW-05 and D-PW-06, ADR 0419).

## Decision

After a patient signs in, the patient web asks once per session "Is this your own device?" (default No;
closing the dialog is No). The answer is an httpOnly, SameSite=Lax session cookie `pw-device` holding only
`own` or `shared`, set by a server action and deleted by `/sign-out`. No: nothing goes into browser storage,
the old web's service worker and its cache are removed, and 15 minutes idle signs the patient out to
`/sign-in?idle=1`. Yes: 7 days.

Not built in this slice: the "own device" offline set (Help, the latest ticket and the health card cached by
a service worker; an IndexedDB outbox for health logs) and the password-again rule for history edits. "Yes"
says the offline set is coming later. Staff sign-in is unchanged; staff never carry the cookie.
