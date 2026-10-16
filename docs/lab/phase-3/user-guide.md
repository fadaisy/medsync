# Lab Phase 3: user guide (one page per role)

**Draft wording**, for the CSO to check before go-live. Everything below appears only where the hospital's flag is
on (`labStock`, `labEquipment`, `labQc`, `labQcHold`, `labEqa`, `labPoctQuality`, `labHmis`, `labReports`), and no
flag goes live in production until the Phase 3 copy (`LAB3_COPY_STATUS`) is signed. Every target, range, level,
window and validity the screens use is entered and signed by the hospital's laboratory lead: MedSync ships none.

## The technologist (QC run, the hold, the look-back)

- **Quality today** (`/lab/quality`) lists what QC is still to run today, results held by QC, lots near their use-by
  date, equipment down and what needs you. Start the day here, before patient samples.
- **Record a QC run.** Choose the analyser and the test, type each level's result, and read the Levey-Jennings chart:
  the run is placed against the target and SD of the plan in force, and the rules broken are named in words ("Rejected:
  2-2s on level 1. A systematic shift is likely."). A 1-2s alone is a warning: the run is accepted and the warning
  kept. For a rejected run, choose what you will check first, then **Reject run and hold**. Every point on the chart
  can be focused for its value, time and who ran it, and the same points are one click away as a table.
- **"QC not run today"** on a result means the analyser's QC for that test was not run in the window. By default it
  informs; the laboratory lead may set it to hold.
- **A held result.** When the latest run on that analyser has failed, the result page shows an amber block: "{Analyte}
  release is held." Release the others: the doctor sees "{Analyte} to follow: held for quality control." Then either
  rerun QC after the corrective action (a passing run lets you release the held value as a completion version), or,
  for an Immediate order, run the sample on another analyser that passed QC today (the block names them).
- **If the patient cannot wait**, only a holder of the override (the laboratory lead or an acting head) can release
  the held value, with a reason. The doctor then reads "Released while QC had failed. The lab is reviewing this
  result." Ask the lead; never release around the hold.
- **The look-back.** A rejected run opens a nonconformity with every result released on that analyser since the last
  accepted run. For each, choose **Result stands**, **Repeat when QC passes** or **Amend**. The "estimate" of how far
  results may read high or low only sorts the list; it is never a correction. "Repeat when QC passes" puts the result
  on a list above your worklist once QC passes; press **Repeat done** after you repeat it. Amend goes through the
  usual amendment, which alerts the doctor.
- **Kits and stains** (Quality control, Kits and stains tab): record the controls when the rule says they are due
  (new lot, each day of use, new operator…). A failed control quarantines the lot at once; it cannot be chosen at the
  bench or the bedside until the lead releases it.

## The laboratory lead (plans, acceptance, nonconformities, EQA, the HMIS check)

- **Sign the set-up**, each from your own lab's practice and sources (never from the screen's examples): QC plans per
  analyser and test (levels, control lot, frequency, reject and warn rules, targets, hold when not run) and the QC
  policy (minimum runs and days for this lab's own target); both also need the CSO's countersignature. Kit and stain
  rules, acceptance plans, bedside device rules, competency validity and register columns you sign alone. A draft you
  wrote is signed by another lead; if no one else can, record why.
- **This lab's target**: once the signed minimum of accepted runs over the signed minimum days is reached, **Set this
  lab's target** makes a new plan version. Targets never drift by themselves.
- **Accept or reject a new lot** (Stock, Receive): a lot waits in acceptance until its plan is met (comparison
  samples within the criterion and, if the plan says so, an accepted QC run on the new lot). **Accept lot** or **Reject
  lot** with a reason; a rejected lot opens a nonconformity. Lots on the shelf at switch-on are recorded once as
  "accepted (before MedSync)" with your written statement.
- **Nonconformities**: you own the automatic ones (QC reject, failed control, rejected lot, temperature, EQA). Add
  actions, and after a QC reject **Authorise resumption** once a run has passed and the look-back is finished. **Close**
  needs the cause, every look-back result decided, every action done or cancelled with a reason, the effectiveness
  check met and your signature. Nothing closes by itself.
- **EQA** (External quality): enrol each scheme with the tests it covers; record each round (samples, our results,
  who tested, the date submitted), then the provider's scores exactly as reported. An unacceptable score opens a
  nonconformity with a look-back from receipt to scoring. Tests with no scheme need an alternative assessment within
  the period you set ("{n} of {m} tests have no EQA").
- **Equipment**: register every analyser, fridge and centrifuge with its maintenance tasks, calibration items and
  temperature range. **Mark down** reports the problem to the services hub, so doctors see "Analyser down" when
  ordering. **Back in service** opens only once a repair is recorded and QC has passed on every linked test after it.
- **HMIS 105** (`/lab/hmis`): on the 1st, **Count the month**, enter the cells still kept by hand, read "How the numbers
  are counted", open any number to see the records it counts, then **Check**. The In-Charge signs. If records change
  after signing, the page says "{n} numbers changed after signing" and you **Prepare revision**. The mapping
  (`/lab/hmis/mapping`) is signed by you and the HMIS focal person, and only once every row is verified against the
  printed form or eHMIS.
- **The parallel month**: keep the paper tally for one full month beside MedSync and explain every difference
  (`docs/lab/phase-3/parallel-run.md`) before the paper tally stops.

## The store

- **Receive a delivery** (Stock, Receive a delivery): supplier, delivery note number, then one line per lot with the
  quantity, use-by date and the condition on arrival. Only accepted quantities enter stock; damaged packs are recorded
  against the supplier. **Save receipt**. A new lot that needs acceptance waits for the lead.
- **Issue** from the item panel: the lot that expires first is marked "Use first" and offered first. Choosing another
  lot needs a reason.
- **Count**: record the weekly count. A difference needs a reason and adjusts stock on hand.
- **Quarantine** a lot you suspect; only the lead releases it.
- **Order**: the item panel shows months of stock (from issues over the last months), the quantity to reach the
  maximum and days out of stock. **Print order request** for NMS or JMS. "Not enough history" means there are not
  yet enough whole months of issues to estimate use.

## The nurse (bedside device checks)

- **Bedside tests → Device checks** (`/nurse/bedside/devices`): each meter on your ward shows whether today's control
  check is due. Type each control's reading; the accepted range is the one printed on the strip vial, entered once per
  strip lot by the laboratory. **Save check**.
- A check is due each day the meter is used, with each new strip lot or control vial, and after a drop or an error
  message (**Record a drop or error message**). A new strip lot, a new control vial or a drop needs a passing check
  before the next patient result. Until today's daily check is saved the result says "Control check not done today."
- **A failed check stops the meter**: "{Device} failed its control check at {time}. It cannot be used until a check
  passes." Rerun with a fresh control or tell the laboratory.
- **Who may record**: your own assessment for each test, with its valid-to date. "Your assessment for {test} lapsed on
  {date}. Ask the laboratory for reassessment." The laboratory records the reassessment.

## The Health Unit In-Charge (signing the HMIS 105)

- The hospital admin designates you as In-Charge. Open **HMIS 105** (`/hmis`). From the 1st to the 7th a reminder says
  when the previous month is due.
- Open the month the laboratory lead has checked. Read "How the numbers are counted" and the cells entered by hand.
  You see numbers only, never patient records.
- **Sign** with a fresh second factor (the code from your authenticator). If you checked the month yourself, another
  In-Charge signs when one is designated.
- After signing, the report is frozen. If late records change it, the lead prepares a revision; you sign the revision.
  Earlier revisions stay readable. Print the form or download the CSV for the district.

## The hospital admin (reports and designations)

- **Designate** the Health Unit In-Charge and the HMIS focal person on the HMIS desk (`/hmis`), with start dates; end a
  designation when someone leaves.
- **Reports → Laboratory** (`/hospital-admin/reports`): the same eight tiles the laboratory sees (tests released,
  reports later than the stated time, specimens rejected, criticals acknowledged in time, QC runs rejected, wrong
  labels caught, reports corrected, equipment down), over your 7, 28 or 90-day window. Numbers only: no patient rows
  and no drill-down. "No data" means nothing was recorded, and is never shown as 0.
