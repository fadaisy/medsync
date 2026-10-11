# Laboratory safety floor — user guide

One page for each person who uses it. What you see depends on what your hospital has turned on; if a menu item below is
missing, it is not on at your hospital yet. Wording marked "draft" on screen has not yet been signed by the Clinical
Safety Officer.

---

## 1. Laboratory technologist

**Entering a result.** Open the specimen from the **Worklist**. Each value shows its unit as text: the unit belongs to
the test, so you do not choose it. Type the number; "7,2" is read as 7.2. If the value is outside the lab's entry check,
MedSync asks you to confirm it. The reference range and flag fill in themselves. You can change a flag, but you must say
why; MedSync keeps both.

**A critical value.** If a value is at or beyond the hospital's signed critical limit, it shows the **Critical** pill and
the button becomes **Check and release**. You cannot release it without a check. To mark a value critical yourself, use
**Mark critical**. Then:

1. Choose the check you made: **Repeated on the same sample** (type the repeat value), **Sample checked, not repeated**,
   or why you could not check.
2. If the panel says nobody is set up at the next level, phone the ward now.
3. Press **Release and alert**. The doctor is alerted at once.

**After release: Criticals.** Every open alert is listed with how long it has waited.

- "Sent · waiting" means the doctor has **not** acknowledged. Opening the alert is not acknowledging it.
- If you phone and the doctor reads the value back, use **Log a call** and record the read-back. That acknowledges it by
  phone. A call to a nurse is recorded as "Ward informed. The clock keeps running."
- If you cannot reach anyone, press **Could not reach anyone**. The alert moves up a level at once.
- "Not sent · phone the ward" or "Escalations may be delayed" mean: phone now.

**Correcting a released result** that was alerted sends a correction to everyone who was alerted. It needs its own
acknowledgement.

**When MedSync is down.** Use the printed downtime forms. Afterwards, open **Downtime entry**, enter each form by its
number with the times written on it, and press **Save and next form**. The record keeps the form's times. A critical
written on the form without a phoned read-back opens a live alert when you save.

---

## 2. Doctor (or any clinician who orders tests)

**A critical result alert** is pinned at the top of your workspace, on the Overview and in Results to review, with the
patient, the value and when it was released. One tap on **Acknowledge** closes it. You may add a response and a note;
neither is required. On a phone the button stays at the bottom of the screen.

- Acknowledge only if you have taken responsibility for acting on the result. Opening the alert is not acknowledging it,
  and the lab keeps seeing "waiting" until you do.
- If the alert reached you by escalation, it says "Escalated to you"; **Acknowledge** takes it over.
- If the lab recorded a phone acknowledgement from you, the alert says so. If that was not you, press **Not me**: the
  alert opens again.
- A **Corrected result** alert means a value you were told about has changed. Acknowledge it too.
- Results to review will not batch-acknowledge a report with an open critical alert. Open and acknowledge it on its own.

**Results entered after downtime** say so, with the time on the paper form and the time it was entered.

Nurses cannot acknowledge an alert; a doctor must.

---

## 3. Laboratory lead

You set up what the technologists and doctors rely on. Nothing clinical comes pre-filled: every number is yours and the
CSO's to sign.

1. **Test catalogue.** For each test you run, set each component's unit, decimal places and, if you want one, an entry
   check. A unit change creates a new version; results already released keep their old unit.
2. **Reference ranges.** Enter bands by sex and age, with a source, and save the draft. Sign it (MedSync asks for your
   authenticator code again). The CSO countersigns. Until both have signed, technologists type the range by hand and it
   shows as unsigned.
3. **Critical limits.** The same pattern: draft, your signature, the CSO's. Automatic flagging starts only when the
   limits and the response times are both signed. Editing a signed set opens a new draft; the signed one stays in force
   until the new one is signed.
4. **Response and contacts.** Set how long a doctor has to acknowledge and when each level is reached, and name the
   level-1 contact for every department and the hospital's level-2 contacts. In production, criticals stay off while any
   active department has no level-1 contact.
5. **SMS wording** is approved by two different people. SMS stays off until your hospital turns it on and confirms the
   staff numbers are right.
6. **Downtime.** Print blank forms before you need them (each has its own number). Record each downtime and each drill.

---

## 4. Hospital admin: one result path

Until the switch, results can be entered two ways: the older lab list and the new one. **One result path** (Departments
→ Diagnostics) moves your hospital onto the new path only.

**The four conditions**, each shown with its evidence:

1. No older-path requests still waiting in the lab.
2. Set-up complete: every test in use has a unit, the wording is signed, response times are signed, and every active
   department has a level-1 contact.
3. A downtime drill recorded.
4. A briefing of the lab and the wards recorded (record it on this page).

**Switching.** When all four are met, press **Switch to the new path**. A **different** hospital admin then approves it.
MedSync checks the four conditions again at that moment. After the switch, the older list cannot take new results, and
results already entered there stay readable under **Older results**.

**Reversing** the switch is done by the MedSync superadmins (two of them, with a reason). Ask them if the new path cannot
be used.
