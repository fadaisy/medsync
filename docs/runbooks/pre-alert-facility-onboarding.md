# Runbook — switching a facility on for pre-alerts

**Who:** the facility's hospital admin, with the platform superadmin's knowledge. **What you are promising:** that a
human watches the Incoming board whenever the facility says it takes emergencies. A pre-alert nobody acknowledges is
worse than no pre-alert — the patient's status screen tells them so after five minutes and says to call.

References: PRD MS-PRD-SYM-001 §8.3–§8.5, [ADR 0098](../adr/0098-symptom-catalog-and-emergency-pathway.md) rulings 7–10,
Gate A items 3–4 and 8; migration 0066 §6.

## Before you start

- **Server flag.** `FEATURE_PRE_ALERT=1` in the Vercel environment (off in production until Gate CG). Without it
  the Emergency sheet is call-only and no facility receives anything, whatever its settings say. The phone reads
  `EXPO_PUBLIC_FEATURE_PRE_ALERT` per EAS profile.
- **A verified number to call first.** The sheet always shows the call button above "Tell a hospital"
  ([emergency-contacts-verification.md](emergency-contacts-verification.md)). Pre-alerts never replace the call.
- **Reception has the Incoming station.** `/reception/incoming` is in the reception sidebar and the nurse
  workspace mirrors it at `/nurse/incoming`. It shows an honest empty state before 0066 is applied.

## Steps

1. **Decide the capability honestly.** `/hospital-admin/profile` → **Emergency** panel → _Emergency capability_:
   `none` (default — the facility does not take walk-in emergencies), `daytime`, or `24h`. The phone's facility
   picker prints "Open 24 h" for `24h` (the web picker does not show it yet); a facility that says `24h` and locks
   its gate at night is the failure mode this field exists to prevent.
2. **Name who watches the board.** _Board owner_ is required the moment pre-alerts are on (a DB CHECK, not just the
   form): e.g. `Day: reception lead. Night: the triage nurse on duty.` It prints on the board's header so the person
   on shift knows it is theirs.
3. **Write the emergency entrance directions** (≤ 500 characters, in the patient's terms: gate, road, door). They go
   to the patient on the status screen and in the SMS fallback.
4. **Numbers.** _Emergency SMS number_ (E.164, `+256…`) receives the facility copy of every pre-alert once the
   notifications engine exists; today it is what the patient's **"Send by SMS instead"** button targets when the
   request cannot be sent. _Ambulance number_ is the facility's own ambulance line if it has one — it is also what
   unlocks the patient's "Use my location" toggle (precise location is shared only when someone can be dispatched
   to it).
5. **Coordinates.** Latitude −2…5, longitude 29…36 (Uganda). Optional; without them the facility sorts by name in
   "Nearest hospital". Get them from the pin on any map app; the form does not geocode.
6. **Tick _Accept pre-alerts_, write the reason (≥ 8 characters), Save.** The change is audited
   (`set_hospital_emergency_settings`) and takes effect on the next sheet load.
7. **Test end to end, non-production.** Open `/emergency` signed out → _Tell a hospital_ → pick the facility →
   Send with defaults (two taps). The board should chime and show the card within a second (Realtime) or fifteen
   (polling). Acknowledge; the patient status flips to "The hospital sees your alert". Mark _Arrived_: an intake in
   `awaiting_triage` appears on the triage worklist, entry type `self_presentation_prealerted`, and the card leaves
   the board. `npm run db:seed-symptom-catalog -- --dev-mulago` does steps 1, 2 and 6 for the Mulago dev hospital
   (`24h`, pre-alerts on, a dev board owner).

## Running the board

- **Acknowledge inside 2 minutes.** The card escalates (a red ring and "Unacknowledged N min") at
  `BOARD_ESCALATION_MS`; the patient's screen gives up waiting at `ACK_TIMEOUT_MS` (5 min) and tells them to call.
- **Ready** when the bay is prepared. **Arrived** converts the alert to an intake (search the patient's code, or
  register as unknown). **Not arriving** with a reason closes the card; **Hoax** closes it and, after two hoaxes from
  the same device or phone hash inside 24 hours, the sheet refuses further pre-alerts from it (`call_only`) — the
  call buttons stay.
- The chime is on per browser (`Chime` toggle in the header) and only after the first click on the page — browsers
  block autoplay.
- Red on this board means tier E only. Urgent and routine pre-alerts are neutral cards.

## Switching off

Untick _Accept pre-alerts_ with a reason. Open alerts stay on the board until closed; new ones stop. Set the
capability back to `none` if the facility no longer takes walk-in emergencies at all.

## Retention (Gate A item 8)

`/api/cron/sweep-pre-arrivals` (daily, 04:00 UTC) expires open alerts (sent, seen or ready) 6 hours after they were sent, nulls the shared
location after 72 hours, and after 30 days strips callback phone, location and free text from every alert that did
not arrive. Arrived alerts are part of the intake record and keep their PHI under the intake's rules.
