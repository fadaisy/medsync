# Lab Phase 1 — the timed trial

Measures the two budgets the build could not measure without people (FINAL-REPORT, Section 13): a doctor acknowledges
a critical result in **1 tap**, with the alert visible within **≤ 5 s**; a four-result paper form is back-entered in
**≤ 90 s** (median). Runs in production at **MedSync Trial Hospital**, a test hospital with invented patients, created
by `scripts/lab/trial.ts`.

## Before: in this order

1. **Merge `origin/main` into `feat/lab-safety-floor`.** The lab branch is behind main; deploying it as it is would roll
   main's newer work back in production.
2. **Apply migrations 0102–0106** to production (`npm run db:migrate -- 0102 0103 0104 0105 0106` from the lab
   worktree).
3. **Write the participants file**, outside the repo (it holds email addresses), for example `~/trial.json`:

   ```json
   {
     "doctors": [
       { "name": "Dr A. Example", "email": "a.example+trial@gmail.com" },
       { "name": "Dr B. Example", "email": "b.example+trial@gmail.com" }
     ],
     "labStaff": [
       { "name": "C. Example", "email": "c.example+trial@gmail.com" },
       { "name": "D. Example", "email": "d.example+trial@gmail.com" }
     ],
     "labLeadEmail": "you+triallead@gmail.com",
     "consultantEmail": "you+trialoncall@gmail.com"
   }
   ```

   1–4 doctors and 1–4 technologists. Every address must be new to MedSync: a `+trial` address of their own email
   works. The lab-lead and on-call accounts are support accounts, not participants; use addresses you control.

4. **Dry run, then create:**

   ```sh
   cd ~/Desktop/medsync-lab1
   npm run lab:trial -- --config ~/trial.json
   npm run lab:trial -- --config ~/trial.json --apply --actor <your auth user id>
   ```

   The dry run checks the migrations, the catalogue and that no trial hospital exists, and writes nothing. The apply
   prints each person's password once (hand each their own line), the task A patients by doctor and the task B
   patients by MRN.

5. **Vercel production env:** add `7a1a0000-0000-4000-8000-000000000001` to `LAB_WORKSPACE`, `LAB_CRITICALS`,
   `LAB_UNITS_RANGES` and `LAB_DOWNTIME` (comma-separated after any existing ids), and to `EMR_V1` if that is a list;
   `DEV_SKIP_MFA=1` lets participants sign in without an authenticator (it applies to every user, so remove it after).
   Deploy production.
6. **On the trial hospital, as the trial lab lead:** in Downtime entry, record a downtime period covering the times you
   will write on the forms, and print the blank forms (5 per technologist). Fill each with an MRN from the task B list,
   collection and result times inside that period, and four invented FBC values, marked as invented.

## On the day (45 minutes)

- **Task A: acknowledgement.** Each doctor signed in on their own phone or a ward PC. A technologist results one of that
  doctor's task A patients (U&E), marks the potassium critical and presses Release and alert. The runner times release
  → alert on screen → Acknowledge. Three per doctor: workspace open, on a phone, app in the background.
- **Task B: back-entry.** Each technologist enters their 5 forms with Save and next form. The runner does not help
  unless someone is stuck for 60 s, and notes it.
- Note wrong patients or values, anyone who thought the doctor knew before acknowledging, and hesitations.

## After

Timings from the database (`<H>` = `7a1a0000-0000-4000-8000-000000000001`):

```sql
-- B: seconds per form (between consecutive saves by one person; the first form of each stack is timed by hand)
select entered_by, form_number,
       extract(epoch from entered_at - lag(entered_at) over (partition by entered_by order by entered_at)) as seconds
from downtime_entries where hospital_id = '<H>' order by entered_by, entered_at;

-- A: release → opened → acknowledged
select a.id,
       extract(epoch from (select min(e.at) from critical_alert_events e where e.alert_id = a.id and e.kind = 'seen') - a.sent_at) as to_seen_s,
       extract(epoch from a.acknowledged_at - a.sent_at) as to_ack_s, a.acknowledged_via
from critical_alerts a where a.hospital_id = '<H>' order by a.sent_at;
```

Send the output and the notes to Claude for the final report. Then close the trial:

```sh
npm run lab:trial -- --close --apply --actor <your auth user id>
```

It deactivates every affiliation (the lab role goes with it), removes the roles, bans the accounts and offboards the
hospital. Clinical records are append-only, so the trial's alerts, marks and results stay in the database for good,
under the trial hospital and labelled as such. Remove the trial hospital id from the flags and unset `DEV_SKIP_MFA`.
