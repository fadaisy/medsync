# ADR 0344 — See a doctor lists doctors only, shows bookable times, and books up to 60 days ahead

**Status:** Accepted, 2026-10-18. Owner decision. It amends ADR 0084 §8 (the 14-day patient booking horizon) and the Tide v1 "never your hour" rule (law L8), for a doctor's booked slots only.

## Context

On the phone, "See a doctor" listed every clinical cadre, including nurses, laboratory staff and pharmacists. "Ask for a day" showed only Morning or Afternoon, never a time. Its days ended 14 days out. The owner asked for three changes:

- doctors only;
- the doctor's actual bookable days and times;
- a calendar that reaches the coming weeks and next month.

## Decision

1. **Doctors only.**
   - "See a doctor" keeps the cadres registered with the Uganda Medical and Dental Practitioners Council (UMDPC): Medical Officer, Medical Officer (Special Grade), Consultant, Senior Consultant, Dental Officer, Dental Surgeon.
   - Intern doctors are left out, because they do not practise on their own.
   - Nurses, midwives, clinical officers, laboratory staff, therapists and pharmacists stay bookable through clinic days. They are not listed as doctors.
   - The phone filters on the reference seed's cadre ids (`DOCTOR_CADRE_IDS`). The upgrade is for the server to return the cadre's council.
2. **Times for a doctor's slots.**
   - The slots `pt-bookable-clinicians` returns are already the engine's bookable times. "Ask for a day" now shows each open time and books the one chosen.
   - The screen says plainly: "Please arrive a little early. The doctor may see you later than this time."
   - Clinic days keep their "doors open" time.
   - No surface shows how many slots or places are left (ADR 0084).
3. **A 60-day window.**
   - `PATIENT_BOOKING_HORIZON_DAYS = 60` lives in `supabase/functions/_shared/booking-horizon.ts`, a file with no imports. Four places read that one number:
     - `pt-bookable-clinicians`, which returns slots;
     - `pt-request-appointment`, which takes the request;
     - `ha-upsert-session-template`, which generates clinic days;
     - the phone's calendar and session reads.
   - The USSD menu keeps its own 14 days, because that menu lists only two weeks.

## Consequences

- **The evidence behind ADR 0084 §8 still stands:** 9.1% of patients missed visits booked 0–2 weeks ahead, against 38.3% at 6 months. 60 days is a deliberate trade for choice. The appointment reminders and the confirmation request carry the extra no-show risk, and the no-show rate should be watched after go-live.
- **Deployment:** the owner deploys `pt-bookable-clinicians`, `pt-request-appointment` and `ha-upsert-session-template`. Until then the server still answers for 14 days, and the calendar shows the later days with no open times.
- **Existing clinic-day templates** produce 60 days of sessions the next time each is saved, or when the services hub goes live.
