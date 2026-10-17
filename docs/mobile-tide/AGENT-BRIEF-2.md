# Tide v1 · round 2 brief: make it work on real data

Read `docs/mobile-tide/AGENT-BRIEF.md` first. Its rules on screens, colour, accessibility, motion, code, checks and "Do not" all still apply. Then read ADR 0342 (`docs/adr/0342-patient-phone-reads-its-own-records.md`) and migration `supabase/migrations/0170_patient_phone_tide.sql`. This round replaces fixtures with real data. The owner chose this, and ADR 0342 records it.

## What changed since round 1

- **Real data replaces fixtures.**
  - Read and write with the phone's Supabase client: `import { supabase } from "@/lib/supabase"`. Check the real export name in `mobile/src/lib`.
  - Row-level security does the scoping: a patient sees only their own rows.
  - Screens still never import Supabase; only `src/data/*` and `src/lib/*` do.
- **Remove `demo` and the Demo ribbon** from every screen that is now real. Keep it only where data is still an example (payments). Remove the "(demo)" and "Demo" tags too.
- **`mobileClinicalData` / `GATE_CG_SIGNED` no longer gate the patient's own log or shared summaries.** Stop reading that flag in the repositories you own.
- **Honest words** (ADR 0342 §3):
  - A reading or dose the patient logs is visible only to them.
  - Replace every "your care team can see it", "Sent to your care team" and "Told your care team" with true words. Good choices: "Saved", "Saved · only you can see it", "Bring this list to your visit".
  - `savedWords()` in `src/lib/flags.ts` is the lead's file. Stop calling it; the lead deletes it.
- **Before migration 0170 is applied:**
  - Saving the kinds pulse, mood, water or activity fails with a check violation. Show a plain "Couldn't save that. Try again later." and never crash.
  - The RPC `patient_intake_ahead` may not exist yet: hide the count on any error.
  - Write the code so it works the moment the owner applies 0170.
- **Offline:**
  - When the phone is offline and a save fails, queue it with `enqueue()` (`src/offline/outbox.ts`).
  - The health-data builder owns making the outbox actually flush (see their brief).
  - Show "Saved on this phone. It will send when you are online" when queued.
- **Loading and empty states:** every real list has a loading state (a quiet skeleton or spinner), an empty state in plain words, and an error state with a retry. A new patient has no readings, no medicines and no visits; that must look right.
- **No fabricated data:** no placeholder doctors, numbers or names where real data is absent. Say what is missing.
- **Tests:** keep `npx jest` green. Mock Supabase in unit tests. Write a test for every mapping (database row to view) with a branch.
- **You cannot sign in to the real backend.** Do not try, and do not use real credentials. Verify with types, unit tests and careful reading of the RLS policies in `supabase/migrations`. The owner will test in Expo Go.

## Contracts between builders (do not break)

- **`src/data/medicines.ts` (health-data builder).** `useMedicines(now)` keeps returning at least `{ doses, dueNow, taken, total, week, medicines, otherReported }`.
  - Each dose keeps `{ id, slot, time, medicine, instruction, takenAt, snoozedUntil, status }`.
  - `medicinesRepo.take(id, at?)`, `undo(id)` and `snooze(id, at?)` keep their signatures.
  - You may add fields such as `loading`, `error` and `scheduledForIso`.
  - `slot` may become a wider string union. Keep `SLOT_WORDS` covering it.
- **`src/data/readings.ts` (health-data builder).** `readingsRepo.save(input, opts)` and `useSavedReadings()` keep their shapes. `useSavedReadings` returns real rows, newest first.
- **`src/data/labs.ts` (records builder).** It exports `useLabsSummary()`. The lead rewires the Care hub's lab preview to whatever shape you give it. Document that shape in a doc comment.
- **Routes the records builder adds:** `/records` (list) and `/records/[id]` (one shared visit summary). Me's "Visits and documents" row links to `/records`.
- **`src/features/home/doctors.tsx` (visits builder).** Exports `Doctors`, which Home renders with no props.

## Checks (from `mobile/`)

```
node scripts/regen-typed-routes.cjs
npx tsc --noEmit
npx eslint <your files> --max-warnings=0
/private/tmp/claude-501/-Users-airm1-Desktop-medsync/a9a676bf-a7ce-4735-a085-0fa514b898cb/scratchpad/pt.sh --check <your files>
npx jest
```

For web files (route handlers, `app/patient/*`), run the web checks from the repo root. The worktree has no root `node_modules`, so the lead adds a symlink while you run them. Ask the lead if it is missing; do not create it yourself. The checks are `npx eslint <files>` and a typecheck. The full web typecheck takes about 10 minutes (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`), so run it once at the end.

## Report

Under 350 words:
- files changed;
- what is real now and what is still example data, and why;
- anything that needs the owner (a migration, a setting);
- checks with their counts.
