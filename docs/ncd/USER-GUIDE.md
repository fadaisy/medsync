# NCDSync user guide

The NCD registry lives at `/ncd`. While the standard is a draft, every screen says so, and only synthetic test records can
be created. Each section below is one page for one role.

## Triage nurse

1. **Today's clinic** lists the patients booked for today. When a patient arrives, press **Mark arrived**.
2. Open the visit and fill in **Measurements**: weight, then each blood pressure as `120/80` in one box (add a second or
   third reading if you take one), then glucose with its type for patients with diabetes. The visit blood pressure (the
   mean) and the BMI appear as you type. Press **Save measurements**. You do not need the clinician part.
3. A value outside the usual range asks you to check it. Correct it, or confirm it if it is right.
4. On a phone, use **Phone view**. Without a connection the measurements are kept on the phone, encrypted, and sent when
   the connection returns. The line at the top says how many entries are waiting. If one needs a decision (a value
   outside the usual range, for example), the line says so: open it, then send it as it is or discard it. The phone's
   copy of the clinic list is removed after three days without a connection.
5. A walk-in: **Add a walk-in patient** at the bottom of the list (search first).

## Clinician

1. Open the visit from **Today's clinic**. The trajectory shows the last six visits as numbers with a small trend line.
2. **Clinician entries**: confirm the medicines carried forward with one press, or edit them (names only, no doses); answer
   missed doses and, for diabetes, hypoglycaemia; record control for each condition that asks for it (Not assessed is
   allowed); medicines obtained; then the next appointment (quick picks 4, 8, 12 weeks) or a transfer or discharge.
3. The completeness line lists what is missing. **Close visit** saves everything; a visit cannot close without a next
   appointment or a transfer or discharge.
4. **Record a review** on the patient record for kidney, eyes, feet, lipids and other annual items. Categories (eGFR,
   kidney, foot risk) are calculated on save and shown as "category from latest result".
5. **My patients** lists the patients you saw who were not in range at their last visit, have a review due, or are overdue.
6. The registry records and reminds. It never advises treatment.

## Registry officer

1. **Search and enrol**: type the name, phone or hospital number. Possible existing records appear beside the form.
   Settle every definite and probable match ("This is the patient" or "Not this patient") before **Enrol**. Only the
   registry number is required; the national ID is never required.
2. **Recall**: the overdue list, longest overdue first. Select a patient, call, and press one outcome. Moved or died opens
   the event form. **Show number** reveals the full number and is recorded. Demo numbers must never be dialled.
3. **Exchange › Legacy import** back-enters old visits from the template: dry run first, then import. The dry run lists
   errors, possible duplicates (also between rows of the same file) and values outside the usual range; check those
   against the paper record and tick the box before importing. The import is all or nothing.
4. **Data quality › Merge** requests a merge of two records; someone else approves it.

## Registry lead

1. **Data quality**: resolve the query list with a note; check the monthly audit sample against the source; approve or
   refuse merges requested by others.
2. **Dashboard** and **Monthly report**: read the month, then **Sign** the report. Signing locks the month. It is refused
   before go-live and while demo data is on.
3. **Administration**: enable or disable condition modules (a draft core module only before go-live), propose code-list
   changes (a second person approves), settings, demo data, and the go-live request.
4. **Recall › Templates**: SMS templates are sent only after two different people approve them; Luganda slots stay
   empty until a reviewed translation exists.

## Head of department

The **Dashboard** (charts or table, filters by condition, sex, age band, district and care band) and the monthly report.
Every number opens the patients behind it, and that access is recorded.

## Administrator

The dashboard figures (counts from 1 to 4 are hidden), aggregate exports, the demo data switch, and **Registry roles**:
assign the registry lead, head of department and auditor. The clinical safety role is assigned only by the platform owner.

## Auditor

The access log of the registry (views, reveals, drill-downs, exports, signatures). Nothing else.

## Demo data

**Administration › Demo data › Turn on demo data** fills the registry with the catalogue's synthetic patients (the
scenario patients, or a full clinic of about 1,284). Every screen then carries "Demo data is on. Nothing here is a real
patient." **Turn off demo data** removes every demo patient and everything recorded against them; real records are not
touched. Demo data cannot be turned on once the registry is approved for patient data.
