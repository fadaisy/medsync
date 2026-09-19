# Gate F build contract — low-bandwidth channels (READ IN FULL)

Repo /Users/airm1/Desktop/medsync, branch feat/booking-app (do not commit). Inputs: docs/booking-app-gate-a-proposal.md (§5.12,
§10 row F), docs/booking-app-prd.md (§3.2 journey 2, §3.3.7, §4.5 USSD budget, §4.7 webhooks, §6.4 language), ADRs 0087–0090,
lib/notifications/africastalking.ts, supabase/functions/\_shared/{book,encryption,dispatches,waitlist}.ts, Gate E's tables.
Africa's Talking docs (read them via the installed knowledge you have; the owner will supply credentials AFTER this gate):
USSD callback = POST form-encoded { sessionId, serviceCode, phoneNumber, text } where `text` is the full "\*"-joined input
history; respond text/plain beginning "CON " (continue) or "END " (finish). Inbound SMS = POST form-encoded { from, to, text,
date, id, linkId }. AT does not sign callbacks: security = an unguessable secret path segment (env `USSD_WEBHOOK_SECRET`,
`SMS_WEBHOOK_SECRET`), plus an optional allowlist of AT's published source IPs (env `AT_CALLBACK_IPS`, comma-separated; enforced
only when set). Document both in docs/ops-channels.md.

## Rulings assumed (ADR 0091)

- English only at launch; `language` is stored and every user-facing string comes from one `lib/channels/strings.ts` table keyed
  by language so Luganda is a data change after CSO sign-off (§6.4 — no machine translation; a language is fully on or off).
- Identity on USSD: the carrier-verified `phoneNumber` is the booking identity; the menu asks the caller's name once per session
  and books with a provisional patient (C4) — `phone_verified_at = now()` (carrier-verified). A phone that matches an existing
  patient_profiles phone (blind index) is offered "Book as {first name}?" — NEVER auto-linked (§2.8): booking still creates a
  provisional row; reception reconciles at the desk. Existing provisional rows for the same phone_hmac at the same hospital are
  reused within their expiry.
- Menu (≤ 6 levels, PRD §3.2.2): 1 language → 2 hospital (active hospitals with at least one published session or bookable day in
  14 days, 5 per screen, "0 More") → 3 service line (session lines first) → 4 next 3 clinic days (or, for slot lines, next 3 open
  days then 3 times) → 5 your name → 6 confirm "1 Yes 2 No" → END with position/time + code; the SMS receipt goes through the
  dispatcher (kind booking_receipt, provisional recipient). Other roots: "2 My next visit" (by phone_hmac over provisional +
  patient rows: date, place, code), "3 Cancel my visit" (code entry → cancel-appointment core path with origin 'ussd'),
  "4 Confirm I'm coming" (code → pt-confirm-attendance path). Emergency line on every menu screen's first line is NOT possible in
  USSD's budget; instead the END text of "2 My next visit" and the root carry "If very sick go to emergency now." (CSO-provisional).
- SMS keywords (inbound): `YES <code>` / `CONFIRM <code>` → confirm attendance; `CANCEL <code>` → cancel; `STOP` → revoke
  sms_communication consent (record) and reply once; anything else → one reply with the three keywords. Idempotent on message id.
- Rate limits: 20 USSD sessions per phone per hour; 10 inbound SMS per phone per hour; over → END/reply with a sentence.

## Build

1. Migration `0062_ussd.sql` (GATED): `ussd_sessions` per §5.12 (+ hospital_id NULL, service_line_id NULL, last_input, updated_at;
   zero RLS policies — service-role only; swept by cleanup-drafts when expired); `appointments_channel_check` already admits 'ussd';
   `appointments_origin_check` — add 'ussd' if absent (additive re-issue); audit verbs `ussd_booking`? no — the core audits
   `book_appointment` with channel 'ussd'; add `sms_stop` verb. Drizzle.
2. `lib/channels/ussd.ts`: a PURE state machine `nextScreen(state, input, data) → { reply: "CON …" | "END …", state' , effects }`
   with all data fetched by the route and passed in; tests cover every screen, "0 More" paging, invalid input, resume mid-session,
   the 160-char USSD screen budget (assert every reply ≤ 160 chars, ASCII), the 6-level cap, and the three other roots.
3. `app/api/ussd/[secret]/route.ts`: verify secret (+ IPs when set), parse form body (zod), load/create `ussd_sessions` by
   provider_session_id (idempotent on sessionId+text), run the machine, apply effects (book via a Next-side call to the Deno
   booking core? — the core lives in Deno. Decision: the route calls the Edge Function `pt-request-appointment`? It has no user JWT
   (no account). Add a service-role Edge Function `system-ussd-book` { secret header, phone_e164, declared_name, hospital_id,
   session_id | slot, reason } that mints/reuses the provisional and books through the core with origin 'ussd', channel 'ussd';
   the route calls it with the service-role key from the server env (never exposed). Same for cancel/confirm: `system-ussd-act`
   { action: 'cancel'|'confirm', booking_code, phone_e164 }), respond text/plain within the 2 s budget (measure: log ms).
4. `app/api/sms/inbound/[secret]/route.ts`: keyword parser (pure, tested) → the same system functions; reply via the dispatcher
   (a `kind:'reply'`? add 'sms_reply' to the dispatches kind CHECK in 0062) so cost is attributed; STOP records consent revocation.
5. `docs/ops-channels.md`: AT dashboard steps (USSD shared code callback URL = https://<host>/api/ussd/<secret>; SMS inbound
   callback; DLR callback from Gate E), env vars, the IP allowlist, how to test with AT's simulator, and the postpaid/prepaid note
   (Part 8 #9).
6. ADR 0091 + CHANGELOG. Gates: typecheck, lint, test, build. No live AT calls in tests.

## Verify

- Every reply ≤ 160 ASCII chars; ≤ 6 levels; resume works; idempotent callbacks (replay of the same sessionId+text yields the same
  reply and no second booking); no auto-link of phone to patient; the secret path + IP allowlist enforced; system-\* functions
  require the service-role header and are not callable with a user JWT; rate limits; strings table only (grep for literals in the
  machine); STOP revokes and replies once; nothing logs a phone in clear.
