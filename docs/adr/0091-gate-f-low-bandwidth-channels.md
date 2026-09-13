# ADR 0091 — Gate F: USSD and SMS keywords, the low-bandwidth channels

**Status:** Accepted — product-owner decision (2026-09-13)

**Builds on** [ADR 0088](0088-gate-c-booking-flow.md), [ADR 0089](0089-gate-d-identity-and-lifecycle.md),
[ADR 0090](0090-gate-e-notifications-waitlist-cancellation.md). Inputs: `docs/booking-app-prd.md` §3.2
journey 2, §3.3.7, §4.5, §4.7, §6.4; `docs/booking-app-gate-a-proposal.md` §5.12, §10 row F.

## Context

The equity metric is the share of bookings made from feature phones (PRD §2). A patient with no smartphone
must be able to book, see, cancel and confirm a visit by dialling a code or sending a word, over Africa's
Talking's shared USSD code and SMS — within a 160-character screen, a 2-second step and six menu levels,
without a MedSync account, and without the platform ever guessing who they are. This ADR records how.

## Decision

### Rulings

- **English only at launch; Luganda is a data change.** Every user-facing string of both channels lives in
  `lib/channels/strings.ts`, keyed by language; the menu and the reply composer read nothing else (a test
  greps the machine for sentence literals). A language is fully on or off — `LANGUAGES` lists what is on.
  No machine translation, ever (§6.4); Luganda goes live when the CSO signs the table.
- **Identity on USSD is the carrier-verified phone, and it books a PROVISIONAL patient (C4).** The menu asks
  the caller's name and age once (one screen — the six-level budget) and `system-ussd-book` mints a
  `provisional_patients` row with `phone_verified_at = now()`; an existing live provisional for the same
  phone at the same hospital is reused. A phone that matches a `patient_profiles.phone_hmac` is **offered**
  "Booking as {name}. 1 Yes 2 Another name" and still books a provisional row — **never auto-linked**
  (PRD §2.8). Reception reconciles at the desk, as for every provisional.
- **`patient_profiles.phone_hmac`** (additive, 0062) is the blind index that makes "my next visit" and the
  offer possible; written at signup and on every phone change, backfilled once by the owner
  (`npm run db:backfill-phone-hmac`). Deviation from ADR 0089's "no blind index yet", recorded.
- **The menu** (≤ 6 levels, ≤ 160 ASCII per screen): root → `1 Book` → language → hospital (5 per screen,
  `0 More`) → clinic (session lines first) → day (next 3; a slot-mode clinic lists "day time" on ONE
  screen) → name and age → confirm `1 Yes 2 No` → END with position + window or time, and the code. The
  SMS receipt follows through the dispatcher (`booking_receipt`, provisional recipient). Other roots:
  `2 My next visit` (by blind index over provisional and account rows), `3 Cancel my visit` (code),
  `4 Confirm I'm coming` (code). The emergency line is on the root and on the END of "my next visit" only —
  the screen budget forbids it elsewhere.
- **Reason on USSD.** The menu asks no reason; the line's first Appendix A code stands. An administrative
  word the desk may change; PRD §7.2 rule 1 (no clinical question) is untouched.
- **The two writers are service-role Edge Functions**, `system-ussd-book` and `system-ussd-act`
  (`cancel` | `confirm` | `stop`), called by MedSync's own routes with the service-role key from server env.
  A user JWT is refused outright; a test greps for it. Writes are audited as the system actor
  (`MEDSYNC_SYSTEM_ACTOR_UUID`, a real `auth.users` row — the convention `system-propose-urgent-appointment`
  set). Booking goes THROUGH THE CORE (origin `ussd`, channel `ussd`); cancel is `cancel-appointment`'s
  path; confirm is `pt-confirm-attendance`'s. A code acts only on a visit that BELONGS to the phone.
- **Webhook security:** AT does not sign callbacks. Every webhook (USSD, inbound SMS, DLR) is authenticated by
  an unguessable secret path segment compared in constant time (`USSD_WEBHOOK_SECRET`, `SMS_WEBHOOK_SECRET`)
  plus an optional allowlist of AT's published source IPs (`AT_CALLBACK_IPS`, enforced only when set). A miss
  is a 404. Documented in `docs/ops-channels.md`.
- **Idempotency:** USSD by `(sessionId, text)` — the row stores the last input and reply, a replay returns
  the same screen and books nothing twice (the booking's idempotency key is `ussd:<sessionId>`). Inbound SMS
  by AT's message `id` — the `inbound_sms` INSERT is the lock.
- **SMS keywords:** `YES|CONFIRM|OK <code>` confirms, `CANCEL|NO <code>` cancels, `STOP` (and cousins) opts
  out, anything else — including a verb with a malformed code — gets one help reply. No look-alike guessing
  on codes (0/O/1/I are not in the alphabet): guessing could act on someone else's visit.
- **STOP is by phone and stronger than consent.** `sms_opt_outs(phone_hmac)` covers a provisional patient who
  holds no account; the dispatcher refuses EVERY SMS to an opted-out phone — the receipt included, since the
  consent text promised "Reply STOP to opt out" — except the one reply confirming the STOP. An account
  holder's `sms_communication` consent is revoked too, audited `sms_stop`. Re-granting in the app removes
  the row (Gate H wires that; today the owner can).
- **Replies are dispatcher rows.** `notification_dispatches.kind = 'sms_reply'` with a reply KEY in the
  payload (never free text), `related_kind = 'inbound_sms'`; `hospital_id` becomes nullable — a platform
  reply (STOP, help) has no facility to bill and is absent from every facility's "Sent today".
- **Rate limits:** 20 USSD sessions per phone per hour (END with one sentence, no row); 10 inbound SMS per
  phone per hour — the crossing message hears why, the rest are recorded and not answered (a flood is not
  answered message for message at 35 shillings each).
- **Session state lives minutes** (PRD §5.5): `ussd_sessions.expires_at` = last step + 10 min, swept by the
  cleanup cron. Zero RLS policies on `ussd_sessions`, `inbound_sms`, `sms_opt_outs` — service-role only.

### The schema (migration 0062, GATED)

`ussd_sessions` (§5.12 + `hospital_id`, `service_line_id`, `last_input`, `last_reply`, `updated_at`),
`inbound_sms`, `sms_opt_outs`, `patient_profiles.phone_hmac`, `appointments_origin_check` + `ussd`,
`notification_dispatches.hospital_id` DROP NOT NULL, kind + `sms_reply`, related_kind + `inbound_sms`,
`sa_audit_log` + `sms_stop`. Dry-run BEGIN/ROLLBACK after 0061 against the dev DB: clean.

### The code

- `lib/channels/strings.ts` — the one table. `lib/channels/ussd.ts` — `applyInput` / `render`, pure;
  tested screen by screen (budget, levels, paging, invalid, resume, roots, the strings-only rule).
  `lib/channels/sms-keywords.ts` — the parser, pure, tested. `lib/channels/webhook-auth.ts`,
  `lib/channels/system-call.ts`, `lib/channels/ussd-data.ts` (reads: hospitals with capacity, lines, days via
  the wizard's own `fetchLines`, the known account, the next visit).
- `app/api/ussd/[secret]`, `app/api/sms/inbound/[secret]`; `app/api/sms/dlr/[secret]` now shares the auth.
- `supabase/functions/system-ussd-book`, `system-ussd-act`, `_shared/system-actor.ts`; the dispatcher renders
  `sms_reply`, treats `inbound_sms` rows as live, and applies `sms_opt_outs` before the claim.
- `scripts/backfill-phone-hmac.ts`; the cleanup cron sweeps expired `ussd_sessions`.

## Consequences

- A feature phone can book, see, cancel and confirm with no account and no data bundle; the desk sees one
  provisional per caller and reconciles as it already does.
- "Bookable hospital" on the USSD list is approximated (a published clinic day with room OR an active
  slot-mode line) — deriving every clinician's slots for every hospital does not fit a 2-second step; a
  hospital whose slot lines have no open time still lists, and its day screen then says so. Recorded in
  `ussd-data.ts` with the upgrade path (a materialised next-open-slot per line).
- Name and age share a screen; a caller who types only a name is asked again with the example.
- The core's per-actor rate limit is left wide for the system actor; the per-phone limits are the routes'.
- `MEDSYNC_SYSTEM_ACTOR_UUID` and the two webhook secrets are owner actions before either channel works;
  live Africa's Talking credentials arrive after this gate (owner's word) — nothing in the repo calls AT in
  a test.

## What Gate F does NOT do

- No Luganda strings yet (a data change after CSO sign-off); no per-facility USSD funding switch (Part 8 #9
  is configured per AT account); no phone OTP for a MedSync account over SMS (the phone is the identity for
  a provisional, not a login).
- No WhatsApp, no call centre (deferred, PRD §3.3.7).
- Re-granting SMS after STOP from the app does not yet clear `sms_opt_outs` (Gate H; today a support action).

## Alternatives considered

- **A per-hospital USSD code** — the shared code needs no UCC allocation and the menu's hospital step costs
  one level; rejected for launch.
- **Passing the session through the JWT-authenticated `pt-request-appointment`** — a USSD caller has no
  account and no JWT; minting one per phone would make the phone a login, which C4 forbids. Service-role
  system functions with the same core instead.
- **Storing the reply text on the dispatch row** — the table stores no body (PHI rule); a reply KEY rendered
  from the strings table keeps that and makes Luganda a data change.
- **Look-alike correction on typed codes (O→0, I→1)** — rejected: a guessed glyph could confirm or cancel a
  different patient's visit. The alphabet already has none of them; a malformed code gets the help line.
