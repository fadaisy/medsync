# MedSync Book — how to test what was built (A′–H)

A hands-on walkthrough for the owner and anyone they hand a phone to. It covers what only a person can see;
the machine already checks the rest (§0). Every step is **Do → Expect**. Where a step is expected to be
_refused_, the refusal is the pass. Every label and sentence below was checked against the code on
2026-09-20.

Read alongside: `docs/booking-app-handoff.md` (deploy order, secrets), `docs/ops-channels.md` (USSD/SMS
runbook), ADRs 0084–0094 (why things behave as they do).

**Money is deferred**, so nothing here pays, sends a live SMS, or delivers a push. Those are listed in §12 as
"not testable yet", not as gaps.

---

## 0. Before you start

### 0.1 Apply and deploy (once)

```sh
npm run db:migrate                          # 0063 then 0064 — both dry-run clean
npx supabase functions deploy --use-api     # every function; _shared/ changed
npx vercel deploy --prod                    # or push to main — the project is GitHub-linked
```

`0063` must land **before** the redeployed functions: `_shared/book.ts` now writes `quoted_fee_*`.

### 0.2 Let the machine do its part

```sh
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build && npm run budget
cd mobile && npx tsc --noEmit && npx eslint src --max-warnings=0 && npx prettier --check "src/**/*.{ts,tsx}"
```

All green means: the clinical firewall holds (PRD §5.4), red is reserved, every Pill has words, the six Gate H
rulings are in the code, the axe pass over the public pages is clean, and the patient routes are under 370 kB.
The same run happens on GitHub on every push (`.github/workflows/ci.yml`). Fifteen suites skip locally
unless `MEDSYNC_ALLOW_RLS_DB_WRITES=1` — they write rows to whatever `.env.local` points at, so run them only
against a project you are happy to dirty.

### 0.3 Run the apps

```sh
npm run dev                                 # web at http://localhost:3000
cd mobile && npx expo start --lan -c        # phone: Expo Go on the same Wi-Fi, or an emulator
```

Or test against production: `https://medsync-six.vercel.app`. The phone talks to the same Supabase project
either way (`mobile/.env`).

### 0.4 Two browsers, one phone

Roles cannot share a browser session. Use one browser (or profile) per role, and a phone (Expo Go) for the
patient app. The Africa's Talking simulator is your "feature phone".

---

## 1. The cast

You need these accounts. If the dev project already has them, reuse them; the handoff names the five legacy
patients and the system actor.

| Role                   | How to get one                                                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Superadmin** (you)   | Already exists. Signs in with MFA.                                                                                                                                                                                                                                            |
| **Hospital admin**     | `/signup/hospital` → you activate it at `/admin/tenants`. (`/hospital-admin/admins` is still a placeholder. A second admin on an existing hospital needs the claim link a superadmin gets from `/admin/tenants` → New hospital, opened by a signed-in, MFA-enrolled account.) |
| **Reception**          | The person registers at `/signup/non-clinical`, picking the hospital and the Reception cadre → the hospital admin approves the pending affiliation at `/hospital-admin/staff`.                                                                                                |
| **Clinician (doctor)** | `/signup/clinical` with a clinical cadre (e.g. Medical Officer) → same approval. The **Invites** panel at `/hospital-admin/staff` is optional: it takes emails only and hands you a `/signup/clinical?invite=…` link to share.                                                |
| **Patient A** (web)    | `/signup/patient` — three steps: identity (name, sex, date of birth, ID type, phone), district, then the account (**email + password ≥ 12 chars** — you sign in with the email, not the phone) and the consent box. Usable immediately.                                       |
| **Patient B** (phone)  | Another `/signup/patient`; sign in on Expo Go with it.                                                                                                                                                                                                                        |
| **Feature phone**      | The AT simulator at <https://simulator.africastalking.com> with your sandbox app (`docs/ops-channels.md` §3).                                                                                                                                                                 |

Do **not** use `/sign-up` for staff — it creates a patient-default account. MFA is mandatory for reception
and clinical roles — enrol at `/onboarding/mfa-setup` on first sign-in.

---

## 2. Set the hospital up (hospital admin)

Everything below happens at `/hospital-admin`.

### 2.1 A department, a clinician, a cadre

- **Do:** `/hospital-admin/departments` — at least one department (e.g. Medicine). At `/hospital-admin/staff`,
  the doctor's affiliation is **active** in that department with a **clinical** cadre.
- **Expect:** the doctor appears in the roster with the cadre's registered name, verbatim.

### 2.2 Service lines — one of each mode

`/hospital-admin/scheduling` → **Service lines**. Create three:

| Line             | Capacity mode  | Payment posture      | Fee (UGX) | Why                                      |
| ---------------- | -------------- | -------------------- | --------- | ---------------------------------------- |
| General clinic   | **session**    | **Full fee to book** | 20,000    | positions and arrival windows (ADR 0087) |
| Follow-up review | **slot**       | **Full fee to book** | 30,000    | a clinician's time                       |
| Same-day queue   | **open_queue** | **No payment**       | —         | the walk-in door                         |

- **Expect:** each line saved with its reason codes. The Fee box steps in hundreds; the server accepts any
  whole UGX.

### 2.3 Fees by cadre (Gate G)

- **Do:** open _Follow-up review_ (a saved line) → **Fees by cadre** → an override for the doctor's cadre at
  UGX 35,000 with a reason (≥ 8 chars). Then open _Same-day queue_.
- **Expect:** the override saves and shows the cadre's registered name. On the No-payment line the **Fees by
  cadre** panel is simply absent. Call `ha-set-service-line-fee` directly for that line → **409** "This clinic
  is free. Set a payment posture on the line first." Call it as a **reception** user → refused (hospital_admin
  or superadmin only).

> The override goes on _Follow-up review_ (the slot line) because that is the line the provider screen books
> into (§3.3). Put a second one on _General clinic_ if you want the **range** on its tile (§3.2).

### 2.4 Weekly rules → clinic days

- **Do:** **Clinic sessions** → **New weekly rule** on _General clinic_: the doctor as clinician, a weekday,
  09:00, 180 min, total 60 / bookable 10, interleave 2/1, overbooking 1.00. Add a **second** rule with **no
  clinician**.
- **Expect:** both rules' days for the next 14 days appear in the **Next 14 days** table as `published`; the
  unnamed rule's rows read **Not yet assigned** in the Clinician column.

### 2.5 Availability for the slot line

- **Do:** as the doctor, `/doctor/schedule` → **Availability** → Add block: Type **Bookable**, a coming
  weekday, e.g. 09:00–12:00. (There is no department field — the block follows the doctor's affiliation.)
- **Expect:** the block appears on the calendar; the patient side derives slots from it.

---

## 3. Patient on the web

Sign in as **Patient A**. Connect to the hospital first (`/patient/hospitals` → choose it) if the home shows
the **Connect to a hospital** card (or `/patient/book` says "Choose your hospital first").

### 3.1 Consent re-acceptance (Gate H)

You only see this if your record does not match the active notice. To force it on the dev project, publish
a new version of the notice — a real product action — and every patient is asked once:

```sql
-- DEV PROJECT ONLY. Supersedes v1.0; pgcrypto is on.
INSERT INTO public.consent_versions (consent_type, version, effective_date, supersedes_id, body, body_sha256)
SELECT 'data_processing', 'v1.1', current_date, id, body || E'\n\n(v1.1 — test revision)',
       encode(digest(body || E'\n\n(v1.1 — test revision)', 'sha256'), 'hex')
FROM public.consent_versions WHERE consent_type = 'data_processing' AND version = 'v1.0';
```

- **Do:** open `/patient`.
- **Expect:** you land on `/patient/consent` with the **full text** of v1.1, a checkbox, "Agree and continue"
  and the header's Sign out. The left rail and the bottom tab bar are **gone** — nothing to tap that would
  lead back here. Submit **without** ticking: the browser refuses and points at the box (its own "please tick
  this box" prompt); the server's red "Tick the box to continue." is the second line of defence. Tick and
  submit: you are on the home. Open `/patient/consent` again: "Data-processing notice v1.1 accepted — On
  <date>" in East Africa Time.
- **Also:** while gated, try `/patient/appointments` directly → redirected back to consent.

### 3.2 The home (the reference design)

- **Expect:** the two doors ("Coming to the hospital today" first and filled; "Ask for a day" second), then
  **Let's find your doctor** with a search box, **Your clinicians** as a horizontal carousel — clinicians of
  departments with a slot-mode line (photo or monogram, rating or "No ratings yet", "Next open <day>" from the
  §2.5 block, else "No days open here yet") — then **Find care** tiles, one filled (the clinic open soonest),
  each with its mode word and the fee: `UGX 30,000 to UGX 35,000, depending on which clinician you see` on
  Follow-up review (base + override = a range), `UGX 20,000` on General clinic, both sentences beneath ("You
  pay at the hospital, not in the app." / "Waivers may apply — ask at the desk."), and **nothing** on the
  free line.
- **Do:** type the doctor's surname in the search.
- **Expect:** the carousel narrows to the doctor, the Find care tiles disappear, and the count line announces
  "1 clinician and 0 clinics match" (a screen reader hears it). Type the department name instead and both
  lists match. Clear it: everything returns.

### 3.3 The provider screen

- **Do:** tap the doctor's card → `/patient/clinician/<id>`.
- **Expect:** photo card with a circular Back, rating badge (or none), name · cadre · department, the action
  row (the video circle reads "Video" or "In person"; phone and chat read "No calls" / "No chat" with the
  reason in their label), the stats strip — **With us** / **Patients** / **Reviews** — reading "—" where there
  is nothing yet (never a flattering 0). Date strip with a month stepper; the days and **times** come from the
  doctor's §2.5 availability on the slot line (Follow-up review) — positions never appear here. The fee reads
  **one number** for that line with the cadre's name: `Medical Officer · UGX 35,000` (the §2.3 override), not
  the range. The docked button sits above the tab bar, never under it.
- **Do:** pick a day **and a time**, then tap **Book this time** (disabled as "Pick a day and time" until both
  are chosen).
- **Expect:** `/patient/book?line=…&clinician=…&slot=…` opens with that choice already made.

### 3.4 Book a clinic day (session mode)

- **Do:** `/patient/book`. Steps: Reason → (Before you book, for a new problem) → Clinic → Clinic day → Check.
- **Expect:** the reason list is the 13 administrative reasons; **no clinical question anywhere**. The "Before
  you book" interstitial is static text — no form. On **Clinic day**, the unnamed rule's days are disabled with
  "Clinician not yet named"; the named days show places left. On **Check**: who, the day ("Clinic day — a
  position, not an exact time"), the reason, and the sentence about the code. The fee is **not** repeated in
  the wizard — it was on the tile and the provider screen, and the quoted number appears on
  `/patient/appointments` after booking. Confirm.
- **Expect (receipt):** a booking code, the day, a **position** and an **arrival window** — never a clock time
  for the appointment itself. `/patient/appointments` lists it with the quoted fee.
- **Try:** book 5 more times quickly with different reasons → the sixth is refused (5 per hour).

### 3.5 Book a time (slot mode)

- **Do:** again, choose _Follow-up review_ → a day and a time from the doctor's availability.
- **Expect:** `pending_approval` until the doctor confirms (§6.2); the receipt says so in plain words.

### 3.6 Waitlist

- **Do:** as hospital admin, set the General clinic rule's **bookable** capacity to 1. This re-stamps only
  **empty** future days, so use a day nobody has booked (or cancel §3.4's bookings first), and make sure no
  other named day of the line inside its time-to-care window (default 7 days) still has a place. As Patient B
  (phone or a second browser) book that day; as Patient A try it.
- **Expect:** the day shows Full → the wizard offers **"Tell me if a place opens"**. Join. Then cancel Patient
  B's booking.
- **Expect:** Patient A's waitlist entry is **offered** the released place and a `waitlist_offer` row is queued
  at once in `notification_dispatches`; the dispatcher (§8) sends it; `pt-accept-waitlist-offer` books it when
  accepted.

### 3.7 Move, cancel, arrive

- **Move:** on `/patient/appointments`, the §3.4 clinic-day booking says "A place in a clinic day cannot be
  moved yet" (by design — cancel and book another day). Use the §3.5 slot booking: **Move this visit** → pick
  another time. The new booking carries the **same quoted fee** even if the admin changed the price in between
  (a quote is a snapshot).
- **Cancel:** cancel one. The appointments page shows "Cancelled at the patient's request." — a sentence, never
  a raw column value.
- **Arrive:** on the day of a confirmed in-person visit (any time that day), "I have arrived" appears; tap it.
  The reception board (§5.2) shows you as checked in.

### 3.8 Household

- **Do:** `/patient/household` → add an adult member (declared adult, an adult age). Try a member aged 12.
- **Expect:** the adult saves; the child is refused with "Booking for a child is not available yet." Booking
  for the member shows "For <name>" on the receipt; the quoted fee is on `/patient/appointments` as for your
  own visits (they will pay).

---

## 4. Patient on the phone (Expo Go, Patient B)

### 4.1 Sign in and the consent gate

- **Do:** sign in. If v1.1 is live and B has not accepted it:
- **Expect:** the **consent screen is the only screen** — no tabs behind it, no Back. The **emergency block**
  is at the top (the Emergency tab is behind the gate, so the block travels). The full text, a checkbox, "Agree
  and continue", "Sign out instead".
- **Do:** while still signed in, turn Wi-Fi/data **off**, then kill and reopen the app (the stored session
  restores on its own — do not sign out first; an offline sign-in only shows "Couldn't reach MedSync").
- **Expect:** "We couldn't check your account" with **Try again** — the app does **not** open onto the tabs.
  Data back on, Try again → the consent screen (or the tabs, if already accepted).
- **Do:** with data on, tick and Agree.
- **Expect:** the tabs appear. Kill and reopen: a brief "Checking your account" hold (emergency block +
  spinner), then the home — the consent form itself does not come back.

### 4.2 Home, doctor, clinic

- **Expect:** top strip (wordmark · hospital · your photo, which opens Settings), greeting, "How are you
  feeling today?", Coming up, the two doors, **Let's find your doctor** with the search box, **Doctors** with
  department chips and the carousel, **Find care** tiles with fees and both sentences.
- **Do:** search a name that matches nothing.
- **Expect:** "0 clinicians and 0 clinics match"; the department chips stay so you can reset; clear the box.
- **Doctor screen:** same components as the web (§3.3), one fee number. **Clinic screen:** the fee card with
  both sentences; days with no clinician are disabled.

### 4.3 Book, see, move, cancel, rate

- Book a clinic day → the interstitial → receipt with position and window.
- **Visits** tab → a slot-mode visit (Follow-up review) → **Move this visit** → a day and time; the moved
  visit keeps its quoted fee. A clinic-day booking shows no move control on the phone — the server refuses to
  move a position (cancel and rebook instead).
- Cancel → the visit reads "Cancelled at the patient's request."
- After a completed visit, **rate it** from the visit screen; the rating appears on the doctor's card as
  "★ 5.0 · 1" (never before there is one).

### 4.4 Emergency

- **Expect:** the Emergency tab is the **only red thing in the app**. Every pushed screen carries the red disc;
  the tab shows the hospital's verified number or the destination alone — never an invented number.

### 4.5 Sign out

- **Expect:** Settings → Sign out → the welcome screen. On a **physical device with a dev build** the device's
  `push_tokens` row is deleted (check in the Table Editor — RLS hides it from PostgREST). Android Expo Go and
  emulators never mint a token, so there is nothing to delete there.

---

## 5. Reception

Sign in as **Reception** (MFA). `/reception`.

### 5.1 Book on behalf (`/reception/book`)

- **Do:** a **new caller**: name, phone, date of birth, "declared adult" ticked. Choose General clinic, a day.
  For §5.2, give the caller **Patient A's phone** (or A's name and year of birth).
- **Expect:** a **provisional** booking with a code; the caller is told the position and the window.
- **Do:** a caller with **age 15**; then a caller with **age 18 typed beside a 2015 birthday**.
- **Expect:** both refused — the form says "Booking for a child is not available yet." before you can submit,
  and if you force the request the **server** refuses with the same sentence (either number under 18).
- **Do:** a caller born exactly 18 years ago today.
- **Expect:** accepted on both sides — the desk and the server count whole calendar years the same way.

### 5.2 Expected today (`/reception/expected`)

- **Expect:** today's bookings with their time and position; **Check in** and **No-show…** actions; the
  provisional booking reads **Identity to confirm** with a **Confirm identity** link that opens the "Who is
  this booking for?" panel. Candidates appear only on the same phone, or the same name and year of birth —
  that is why §5.1 used A's phone.
- **Reconcile:** **Confirm** on Patient A's card. The booking now names A.
- **Un-reconcile:** no button — call `ha-reconcile-identity` directly with `action: "unreconcile"`,
  `hospital_id`, `provisional_patient_id` and a reason ≥ 20 chars, as hospital admin → the row is back to
  "Identity to confirm".
- **Cross-tenant:** if the same provisional (a household member's) holds a booking at a second hospital that
  was also confirmed to the same patient there, the un-reconcile is **refused (409)** naming that count; a
  superadmin can do it and it reverses everywhere.
- **No-show:** once a confirmed booking's start time has passed, "No-show…" → a reason ≥ 8 chars → **Mark
  no-show**. For a past day open `/reception/expected?date=YYYY-MM-DD`. It feeds the reports (§9) — the
  clinic's number, never the patient's.

### 5.3 Find (`/reception/find`)

- **Do:** type a surname (finds people on today's board) or a patient code (any record; ≥ 3 characters).
- **Expect:** patient records with **Register an entry**. No booking lookup lives here; to find a _patient_ by
  phone for a desk booking use `/reception/book`. Booking status and cancel sentences are patient-side (§3.7,
  §4.3); a staff member's typed cancel reason is only in `/admin/audit`.

---

## 6. The doctor

Sign in as the **doctor** (MFA). `/doctor/schedule`.

### 6.1 The day

- **Expect:** the calendar with the clinic day and the slot bookings; the **pending rail** with the slot
  request from §3.5; the queue rail once patients are checked in.

### 6.2 Confirm and decline

- **Do:** confirm one request; decline another with a reason.
- **Expect:** the label on the decline form says the reason is **audited, staff only — the patient reads a
  fixed sentence**. On the patient's side: "The clinic could not take this request." and nothing of your words.

### 6.3 Start the encounter (this writes `called_at`)

- **Do:** with a patient **checked in**, start their encounter from the queue rail.
- **Expect:** the entry moves from **Waiting** to **Now seeing** (the encounter row is created; no encounter
  page opens from here). This is the moment the §3.6 detector measures: called inside the arrival window, or
  not.

### 6.4 Running late / cancel a clinic day (hospital admin)

- **Running late:** `/hospital-admin/scheduling` → the day → set 30 minutes. Patients' windows shift; a
  "Window moved" message is queued for them.
- **Cancel the day:** the two-step cancel with a reason. Every live booking becomes `cancelled` with the code
  `session_cancelled`; patients see "This clinic day was cancelled." and a one-tap **rebooking** offer of the
  next open day of that clinic ("Book <day>"), with "Choose another day" beside it. The staff reason stays on
  the session row, which patients cannot read once it is not published.

### 6.5 Edit a rule (Gate H ruling)

- **Do:** with one future day holding a booking and the others empty, change the rule's bookable capacity from
  10 to 12.
- **Expect:** the **empty** future days now show 12 places; the day **with a booking** still shows 10 — its
  promise stands. Deactivate the rule: empty future days are cancelled; the booked one stays.

---

## 7. USSD and SMS (Africa's Talking sandbox)

Runbook: `docs/ops-channels.md` §3–§5. Callbacks point at your deploy (or `ngrok` to `next dev`).

### 7.1 Book from a feature phone

- **Do:** in the simulator, dial your sandbox code as `+256700000001`.
- **Expect:** a root menu within 160 characters (1 Book a visit / 2 My next visit / 3 Cancel my visit /
  4 Confirm I'm coming, plus the emergency line); on the booking path at most six levels: language → hospital
  → clinic → day → name + age on one screen → confirm. No reason is asked — the clinic's first reason code is
  stamped on the row; the desk can change it. The final screen gives the code, the position and the window.
- **Do:** book again as `Amina 12`.
- **Expect:** refused in one sentence — "Could not book: Booking for a child is not available yet." (the same
  rule as the desk: a feature phone is a desk with no clerk).
- **Expect (behind it):** an `appointments` row with `channel = 'ussd'` and a **provisional** patient; a
  receipt SMS **queued** in `notification_dispatches` (the sandbox inbox gets it once the dispatcher runs, §8).

### 7.2 SMS keywords

Send from the simulator's SMS tab to your sandbox shortcode. Every reply is **queued** as an `sms_reply` row
and reaches the simulator inbox only after the dispatcher runs (§8) — not instantly.

| Text                                                            | Expect                                                                                                                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YES <code>` (also `Y`, `OK`, `CONFIRM`, `COMING`)              | a clinic-day booking is confirmed by the patient (`confirmed_by_patient_at` set); a slot booking still awaiting the clinician answers "This visit cannot be confirmed now." |
| `CANCEL <code>` (also `NO`, `N`)                                | cancelled with the code `patient_cancelled` — do not type `NO` expecting help                                                                                               |
| `STOP` (also `STOPALL`, `UNSUBSCRIBE`, `END`, `QUIT`)           | `sms_opt_outs` row for the phone; nothing further is sent to it                                                                                                             |
| `HELP`, `INFO`, `?`, a verb without a valid code, anything else | one-line help ("reply YES <code> to confirm, CANCEL <code> to cancel, STOP to end SMS"), no guessing who you are. There is no MOVE keyword.                                 |

- **Do:** send `STOP`, then book again from the same number.
- **Expect:** the booking succeeds; the receipt row is still created (`queued`) and, when the dispatcher next
  runs, is marked `cancelled` with `failure_reason = 'sms_opted_out'` — never sent. The only SMS the number
  still receives is the one confirming the STOP.

### 7.3 Delivery reports

- `curl` a DLR as in the runbook, using the row's real `provider_message_id` as `id` (the runbook's
  `ATXid_123` placeholder matches nothing and answers `{ "ok": true, "updated": 0 }`) → `Success` moves a
  `sent` row to `delivered`; `Failed`/`Rejected`/`Expired` move it to `failed` with
  `failure_reason = 'dlr_failed: <reason>'`; `Sent`/`Submitted`/`Buffered` change nothing. Cost is not on the
  DLR — it was written to `cost_amount`/`cost_currency` when the dispatcher sent the message.

---

## 8. Notifications (the dispatcher)

The cron runs **daily at 05:00 UTC (≈ 08:00 EAT)** on Hobby. To run it by hand:

```sh
curl -s -H "authorization: Bearer $CRON_SECRET" https://<host>/api/cron/dispatch-reminders
```

- **Expect:** JSON `{ ok: true, legacy: {…}, dispatches: { scanned, push, sms, fallbacks, held: {…}, reaped,
failed, backlog }, receipts: {…}, waitlist: { expired, cascaded }, released: { released } }` —
  `dispatches.sms` is what the sandbox will have received. A wrong secret is 401; a missing `CRON_SECRET`,
  `AFRICASTALKING_USERNAME`/`_API_KEY` or `MEDSYNC_PHI_KEY` is 503 naming the variable.
- **Rows:** the receipt from §7.1 goes `queued → sent`. The T‑24h `confirmation_request` and T‑2h
  `arrival_window` rows were written **at booking time**, not by the cron; they send once their
  `scheduled_at` has passed — for tomorrow's clinic day, expect the confirmation request on today's run and
  the arrival window on tomorrow's.
- **Quiet hours** (per hospital, default 21:00–07:00 EAT) hold the confirmation request, arrival window,
  waitlist offer and window-shift rows (`held`, `scheduled_at` moved to 07:00); the receipt, a clinic-day
  cancellation, an unconfirmed release and SMS keyword replies go at any hour.
- **Push:** with no `push_tokens` row for Patient B (Expo Go, no Firebase — §12) each push row goes `failed`
  with `failure_reason = 'no_push_token'` and keeps `channel = 'push'`; the dispatcher inserts a sibling SMS
  row (same idempotency key with `:sms` for `:push`) that sends on the **next** run, and only if the patient
  granted SMS consent (else `cancelled` / `no_sms_consent`). The receipt already has its own SMS row; a USSD
  booking has no push row at all.
- **Unconfirmed release** is **off** by default (Gate E) — nothing is released for not confirming unless the
  department's scheduling policy sets `release_unconfirmed_hours`, and even then only after a confirmation
  request was actually sent.

---

## 9. Reports (hospital admin) and the rollup (superadmin)

### 9.1 `/hospital-admin/reports`

- **Expect:** a boxed ruling **above** the numbers, headed **"These numbers describe the clinic's access,
  never a patient."** Under it, six cards over **7 / 28 / 90** days — the switch is the "Window" row of three
  links directly under the page header ("7 days" / "28 days" / "90 days", with "since 00:00 on <date>, East
  Africa Time" at its right; default 28) — Fill rate, No-show rate, Wait accuracy, Demand vs capacity, Refill
  load, SMS spend — each with its **basis line** ("34 of 50 places", "2 of 60 held bookings whose day has
  ended"). With fewer than 20 in a denominator the card reads **"Too few to report"**, never a percentage.
- **Below:** a table per service line (fill, wait accuracy, the **Windows** column with "Positions not
  honoured" in amber when under 50% over a real sample — visible on a phone-width screen too) and a table per
  clinic day.
- **Check one number by hand** (read-only SQL against the dev project). The page's window starts at **00:00
  Africa/Kampala** 28 days ago (what it prints as "since 00:00 on …"), not at `now() - 28 days`:

```sql
-- Fill rate, last 28 days, ended days only
select sum(booked_count) as booked,
       sum(ceil(capacity_booked * overbooking_factor)) as places
from clinic_sessions
where hospital_id = '<id>' and status in ('published','closed')
  and starts_at >= ((now() at time zone 'Africa/Kampala')::date - 28)::timestamp at time zone 'Africa/Kampala'
  and starts_at < now() and ends_at <= now();

-- Wait accuracy: session-mode bookings only; a patient who arrived after their window
-- closed is left out of the denominator (the card says so)
select count(*) filter (where q.called_at between a.arrival_window_start and a.arrival_window_end) as inside,
       count(*) as called
from queue_entries q
join appointments a on a.id = q.appointment_id
join clinic_sessions s on s.id = a.session_id
where a.hospital_id = '<id>' and q.called_at is not null
  and a.arrival_window_start is not null and a.arrival_window_end is not null
  and q.arrived_at <= a.arrival_window_end
  and a.starts_at >= ((now() at time zone 'Africa/Kampala')::date - 28)::timestamp at time zone 'Africa/Kampala'
  and a.starts_at < now();
```

- **Demand vs capacity** compares bookings **for** the days that started in the window against those days'
  places; it prints "—" when no day was published. Waitlist joins stand beside it.
- **Refill load** shows the refill-visit count; if GATED migration 0039 (prescriptions) is applied on the
  project it adds "; N prescriptions written" and the note that the two counts are **not joined** — otherwise
  "Prescriptions are not yet recorded at this hospital."

### 9.2 Tenant isolation

- **Do:** as a hospital admin of a **second** hospital, open `/hospital-admin/reports`.
- **Expect:** only that hospital's lines and figures; nothing of the first.

### 9.3 `/admin/scheduling-rollup` (superadmin)

- **Expect:** a **Booked access** panel — one row per hospital: fill, no-show, wait accuracy, requests / places,
  SMS spend. **No patient name, booking code or phone** anywhere on the page — the only names are the
  hospitals' own.

---

## 10. Things that must be refused

Each of these is a pass when it fails.

| Try                                                                                          | Expect                                                                                          |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Book a clinic day whose rule names no clinician (web, phone, or a direct call)               | disabled on the surface; **409** "This clinic day has no clinician assigned yet." from the core |
| Six bookings within an hour as one patient                                                   | the sixth is **429**                                                                            |
| A fee override on a No-payment line; a reception user calling `ha-set-service-line-fee`      | **409** / refused                                                                               |
| Desk or USSD booking with either number under 18                                             | refused, same sentence, client and server                                                       |
| Hospital admin un-reconciles a provisional confirmed to the same patient at another hospital | **409** with the count; superadmin succeeds                                                     |
| Reading another patient's appointment through PostgREST with a patient JWT                   | empty — RLS                                                                                     |
| Any patient page or action while consent is due                                              | redirect to `/patient/consent`; the action does not run                                         |
| A patient reading a staff cancel reason (row, phone, USSD)                                   | a code in the column, a fixed sentence on every surface                                         |
| Adding `reason_note` to a triage input, or a clinical word to a reason label                 | `npm test` fails (`tests/booking/clinical-firewall.test.ts`)                                    |
| A red button on a patient surface (`variant="emergency"`)                                    | `npm test` fails (`tests/design/red-reserved.test.ts`)                                          |

---

## 11. Accessibility and design spot checks

- **Keyboard only** through the web wizard: every step reachable; the day and time chips are reached with
  **Tab** (each is a button in an "Available days" / "Available times" list) and announce pressed / not
  pressed; the docked Book bar is focusable and never covered by the tab bar.
- **Screen reader** (VoiceOver / TalkBack) on the provider screen: the stats read "Patients: none yet" when
  empty; the action circles read their reason; the tiles read name, department, mode word, fee and soonest
  day in order.
- **Colour:** on the web nothing on a patient or reception screen is red — the emergency block is **amber** by
  decision (ADR 0084 §3); on the phone the only red is the Emergency tab and the emergency disc. Every status
  pill has words; a flagged line on the reports page is **amber with words**.
- **Targets:** every control ≥ 44 px (the window links, the chips, the consent checkbox).
- **Dark mode:** the toggle in the header (ADR 0087 C8 keeps it); the filled tile keeps full contrast.
- **Phone width** on the web: no horizontal scroll; the carousel keeps the first card whole.

---

## 12. Not testable yet (deferred by decision)

| Item                        | Why                                                                                                           | What would change                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Android push                | Firebase project + `google-services.json` + one dev build                                                     | `GATE-G-BUILD.md` §2 — free                        |
| iOS push                    | Apple Developer account                                                                                       | billing                                            |
| Live SMS to a real handset  | AT live credentials, sender ID / shortcode, wallet                                                            | billing                                            |
| `*/15` dispatcher cadence   | Vercel Pro                                                                                                    | billing (or Supabase pg_cron, free — ops-channels) |
| Payments in the app         | ADR 0092: the fee is stated, nothing is charged; PRD Part 8 #8/#14 are unresolved legal items; billing paused | a new ADR, not a switch                            |
| Booking a child at the desk | CSO + legal guardian model                                                                                    | PRD Part 8 #12                                     |

---

## Appendix — tidying up

- Test hospitals created through the RLS helpers are named `Test …` and are deleted by the suites' `cleanup()`.
  Do not name a real hospital that way on a project where those suites may run.
- The v1.1 consent row from §3.1 is a real supersession: leave it, or delete **only** on the dev project
  (`delete from consent_versions where version = 'v1.1'`, then the `consent_records` written against it).
- `sa_audit_log` is append-only. Everything you did as staff is in it, under `/admin/audit`.
