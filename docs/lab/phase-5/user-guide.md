# Lab Phase 5: user guides

17 Oct 2026. Short guides for each person who uses what Phase 5 added. Everything here is switched on per hospital
(`LAB_DELTA_CHECKS`, `IPC_LAB_FEED`, `PATIENT_RESULTS`, `PATIENT_RESULTS_SMS`) and stays off in production until the
Clinical Safety Officer signs the Phase 5 copy. Patient results also wait for the legal opinion (Q7) and the privacy
notice, terms and PDPO registration (Q8).

## 1. Patients

**Where:** MedSync app → More → **Results**.

- **Turning results on.** The first time, you see "Show my results in the app. You can turn this off at any time."
  Press the switch. Until you do, nothing is shown. You can turn it off again under **Your choices**; your results
  disappear at once.
- **Ready.** Each card shows the test, the date, your value with its unit, and words such as "Higher than the usual
  range". If your doctor wrote you a note, it is there too.
- **Not ready to show yet.** A test your doctor has not looked at says "Your doctor looks at this first". A test sent
  to another lab gives the expected date. A test not yet done says "Waiting for the lab".
- **Some tests are always given to you in person** by a health worker, not in the app. They do not appear here at all.
- **One result.** Tap a card: the value, a line showing the usual range shaded and your value as a dot, "What this
  test is" (written and signed by your hospital), your earlier results for the same test, your doctor's note, and
  "If you feel very unwell before then, press Emergency or go to the nearest health facility."
- **A corrected result** first says "This result is being checked". When your doctor has seen the correction, the new
  value shows with "Corrected on {date}" and the old value crossed out.
- **Text me when results are ready.** A second switch. The message names only your hospital, says you have new
  results, and how to stop. Messages are sent between 06:00 and 19:00. Reply **STOP** to stop them.
- **Ask for a copy of all my results.** The records office replies within 30 days.
- **Children.** A parent or guardian sees a child's results only if the hospital linked them, and only the kinds of
  result the hospital's signed rule allows. Links are made at the hospital, never in the app.
- **Privacy.** Results are not saved on your phone, and the browser tab never shows a test or a value.

## 2. Doctors and clinical officers

**Results to review** (`/doctor/results`) gains **The patient sees it**: your released results from the last 14 days
and, for each, what the patient sees and why.

| Words                                 | Meaning                                                         | What you can do                 |
| ------------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| When you mark it reviewed             | Waiting for your acknowledgement                                | Review it in the list above     |
| After you have spoken to them         | A critical result: the patient sees it once you record talking  | **I have spoken to them** (how) |
| In person only                        | HIV, pregnancy, tissue, cytology, or a group the hospital keeps | Tell the patient yourself       |
| Held until {date}                     | You held it, with a reason                                      | **Release hold**                |
| Patient has not agreed to see results | The patient has not turned results on                           | Nothing                         |
| Seen by the patient {date}            | The patient opened it                                           | Nothing                         |

- **Hold from the patient:** choose "I will explain it in person" or "Seeing it now could harm the patient", and a
  date no later than the hospital's signed maximum. Holds are listed for the CSO each month. When the date passes, the
  result comes back to you; it is never shown automatically. A hold never blocks a copy request.
- **Note to patient:** a short note the patient reads with the result.
- Results released more than the signed number of days ago and still not reviewed head the section.

## 3. Laboratory

### Delta checks (`/lab/results/{order}`, `/lab/setup/delta`)

- When a value differs from the patient's previous result by more than a signed rule allows, the result page shows the
  change, the interval and what the rule means, and **Release** is disabled until you record an outcome with a note for
  each flag: physiological or treatment, transfusion or dialysis, confirmed same patient, contamination suspected,
  previous specimen suspect, recollect, or mislabel confirmed. "Recollect" rejects the specimen as a possible wrong
  sample; "mislabel confirmed" opens a nonconformity. Always check the previous specimen too.
- **Laboratory lead:** add rules (delta, panel, pattern) with their basis and source; the RCV calculator works out
  √2 × Z × √(CVA² + CVI²) from your QC's CVA and a named CVI, but MedSync suggests no limit. **Trial** shows what a rule
  would have flagged on past results without writing anything. Another lead signs, the CSO countersigns in the admin
  console. A rule marked "Flags often · review" fires on many results: look at it.

### What patients see (`/lab/setup/patient-release`, laboratory lead)

Draft the **release table** (for each kind of result: never, after review, or after the clinician has spoken to the
patient; and whether a message is sent), the longest hold and the aged window with your source; **plain words** per
test and language; the **minors rule** with the legal opinion reference; the **results-ready message**; and tests to
add to "never in the app". Another lead signs; the CSO countersigns. Nothing reaches a patient before both.

### Demo lab day (`/lab/setup/demo`, demo hospitals only)

In a hospital marked as a demo hospital, **Load a demo lab day** adds eight patients named "Demo patient 01" to "08"
with tests waiting at every stage. Results are the middle of the hospital's own signed ranges. Demo patients cannot
sign in; demo records stay in the demo hospital. To mark a hospital as a demo hospital, a superadmin runs, in the
Supabase SQL editor:

```sql
INSERT INTO public.lab_demo_hospitals (hospital_id, marked_by, note)
VALUES ('<demo hospital id>', '<your user id>', 'Demo hospital for the lab');
```

The demo hospital needs a doctor on its staff and at least one numeric test with units set up.

## 4. Infection prevention (`/ipc`)

- **Lab alerts:** open, closed this week, flagged patients. Each alert shows the condition, the patient's two
  identifiers, the place and the suggested precaution, never the whole result. Record **precautions started** (type and
  place), **not needed** (reason), **contacts listed**, or **notified**. Unanswered alerts escalate after an hour.
- **The patient flag:** precautions started puts a flag on the patient. It shows on the bed board as "Infection
  prevention: {precaution}" (never the condition), and a readmission or move raises a new alert. Only IPC clears it,
  with a reason.
- **Alert list:** the IPC lead drafts and signs each entry; a laboratory lead countersigns; the surveillance focal person
  checks the IDSR route. Entries for organisms wait for the microbiology module.
- **Surveillance:** this week's numbers and the lab-confirmed counts per IDSR item. MedSync does not report cases; the
  surveillance focal person submits to DHIS2 by 12:00 on Monday. **Print the digest** for the weekly meeting.

## 5. Data protection lead (`/referral-governance`)

**Results in the app and by SMS: consent wording.** Write the version, the in-app wording, the SMS wording and the
legal basis, then sign. Signing publishes the consent version patients agree to. Until it is signed, no patient can
turn results on.

## 6. Records office (`/hospital-admin/records-requests`)

Patients' copy requests, by hospital number and due date (30 days). A request marked "A result is held in the app: ask
the clinician first" is still answered in full; ask the clinician before sending. **Mark sent** when done.
