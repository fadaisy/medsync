# ADR 0345 — Ask for a day: a countdown, the symptom catalogue, and photos, videos and voice notes

**Status:** Accepted, 2026-10-18. Owner decision, from the Time Picker prototypes (board "Ask for a day · seconds, symptom catalogue, then pay"). Builds on ADR 0095 (symptoms on a booking), ADR 0098 (the symptom catalogue) and ADR 0344 (a doctor's times).

## Context

The owner asked for four changes to "Ask for a day" on the phone:

- a doctor's open times on a scroll wheel, with a countdown to the chosen time, to the second;
- "Anything the doctor should know?" before payment;
- the detailed symptom catalogue (v0.1, 86 adult items) in place of an empty box;
- voice notes turned into text, photos from the phone, and photos or videos taken there and then.

## Decision

1. **The wheel and the countdown.** The wheel shows three rows and snaps to the middle one, which is the chosen time. The first open time is chosen until the patient scrolls to another. A muted card beside it counts down days, hours, minutes and seconds. Only that card redraws each second. A screen reader hears the time to the minute.
2. **Order.** The time, then the note, then who pays and how, then the request button.
3. **The catalogue on a booking.** Patients choose by area or by search, from a list about four rows tall that scrolls. Each choice asks its own questions.
   - What is chosen goes to the clinic as words: code, label and answers, in the request's existing `symptoms` field. No tier is sent.
   - The catalogue's tier is said to the patient as advice only. "Get help now" points to Help, and "Be seen today" points to today's options. The booking still goes ahead.
   - The surface follows the catalogue gate. Draft content shows the "Unsigned clinical content" watermark. With the gate off, only the note box shows.
   - It shows `SYMPTOMS_NOTE`, and the clinical firewall test now covers it.
   - The adult list is used, also when booking for a household member. The upgrade is to ask who the visit is for, as the symptoms screen does.
4. **Photos, videos and voice notes** (migration 0172).
   - They stay on the phone until the request exists. Then each goes to the private `appointment-attachments` bucket at `<uploader>/<appointment>/<file>`, with one row in `appointment_attachments`.
   - Rows are append-only. Whoever can read the appointment can read them, because the check runs `appointments`' own RLS. Only the patient, or the agent who booked, can add one.
   - Up to six photos or videos (a video is at most a minute), and three voice notes.
   - A file that fails does not undo the request. The ticket says how many did not send.
5. **Speech to text.** Expo Go has no speech recogniser, and none of the app's services transcribes. The words come from the keyboard's own microphone into the note box. The voice note is kept as sound for the clinic. Turning a voice note into text later needs either a development build with an on-device recogniser, or a speech service. A speech service would send patient audio to a third party, which is a separate decision.

## Consequences

- The owner applies migration 0172. Until then, files fail to send and the ticket says so. The request itself is unaffected.
- No staff screen shows attachments yet. They are stored and readable under RLS. Showing them at the desk and to the doctor is the next piece of work.
- Nothing orders, routes or scores a booking by its symptoms or attachments (ADR 0095).
