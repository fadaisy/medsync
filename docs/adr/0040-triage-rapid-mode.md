# ADR 0040 — Triage has a rapid 1-tap Level-1 path (you don't form-fill a patient in arrest)

**Status:** Accepted — CLINICAL-SAFETY artifact, pending CSO sign-off (2026-05-31)
**Context:** Triage runs under load. For the obvious-sick — a patient in arrest, exsanguinating, unresponsive — making the clinician complete a structured vitals form before acting is wrong and dangerous. Kickoff §4 requires a one-tap Step-0 → Red/resus path alongside the full assessment.

## Decision

A **"Resus" button on every triage-worklist row** opens a small confirm (pick which Step-0 life-threat) and, on confirm, records a **Level-1 triage** via `rapidRedAction` — bypassing the full form.

The rapid record is honest and auditable, not a shortcut around governance:

- Same authorisation path as `submitTriageAction` (`requireTriageScope` — clinical cadre + AAL2 only; reception is bounced here AND at the `triage_records` RLS).
- `triage_records` row with `life_threat_fast_tracked = true`, `computed_level = assigned_level = 1`, `override_direction = 'none'`, the chosen life-threat captured in `computed_breakdown`.
- Advances the intake to `triaged`, re-ranks the queue (`queue_entries.priority_order = 1`), writes `sa_audit_log` (`action = 'assign_triage'`, reason "Rapid Level 1 (resus): …"), and calls `notifyTriageOutcome` — the same Red/Orange alert fan-out `submitTriageAction` uses.
- It is **not** an override (computed == assigned), so it doesn't consume down-triage authority and reads cleanly in the trail as "rapid Step-0 life-threat declared."

The full structured assessment (Steps 1–7) remains the path for everyone else; the two modes coexist (kickoff §4 "two entry modes").

The confirm dialog dispatches the action inside a `useTransition` and closes from the resolved callback (no `setState`-in-effect cascade); the worklist row is restructured so the info area opens the full panel and "Resus" is a separate sibling (no nested interactive elements).

## Why this is safe

Rapid mode only ever assigns the **most acute** level (1) — it can never under-triage. The worst case (a clinician hits Resus on a not-actually-arresting patient) is over-triage, the deliberately-tolerated direction. The confirm step + named life-threat make accidental taps recoverable, and the record is fully audited.

## Alert seam — what is and isn't wired (honest)

`notifyTriageOutcome` is **genuinely implemented for in-app delivery**: on a Red/Orange outcome it queries the receiving department's on-shift clinical staff (`staff_affiliations` × `cadres`) and writes `sa_notifications` rows. The **out-of-band** leg (SMS / push) is a labelled stub (`stubbedNotificationSink` logs intent only) pending a dispatcher — the code says so in its own header. Both `submitTriageAction` and `rapidRedAction` call the same function, so wiring a real dispatcher later lights up both paths at once. This is stated so the in-app alert is not over-claimed and the SMS gap is not hidden.

## Consequences

**Positive:** the obvious-sick are actioned in one tap; no form friction at the moment it matters most; same audit + in-app alert guarantees as the full path.
**Negative:** a second triage-creation path to maintain — mitigated by routing it through the same persist/queue/audit/notify code as `submitTriageAction`. The two insert blocks are deliberately parallel; a future refactor could extract a shared `persistTriage` helper.

## Verification (GATE E)

Adversarial seam checks confirmed: the `triage_records` and `sa_audit_log` inserts use only columns + enum/check literals the DB actually accepts (`override_direction='none'`, `ruleset='adult_news2'`, `action='assign_triage'`, `target_kind='triage_record'`); the `queue_entries.state='waiting'` / `patient_intakes.status='triaged'` filters and values are valid; the notify call shape matches the function signature; and `patient_user_id` flows end-to-end from the worklist row into the button's FormData and the insert. One drifted Drizzle column (`queue_entries.priority_order`, present in migration 0036 but missing from the schema file) was fixed in the same gate.

## Related

- ADR 0035–0037, 0039 (the triage engine + ESI-v5)
- `app/nurse/triage/actions.ts` (`rapidRedAction`), `app/nurse/triage/_components/rapid-red-button.tsx`, `lib/triage/notify.ts`
