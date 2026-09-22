# Runbook — verifying an emergency contact

**Who:** a superadmin (two, once more than one exists). **Why this is a runbook:** the number on the Emergency
sheet's primary button is the highest-stakes string in the product. Production renders `verified` rows only
([ADR 0098](../adr/0098-symptom-catalog-and-emergency-pathway.md) ruling 8, PRD MS-PRD-SYM-001 §9.3); until a row is
verified the sheet falls back to the hospital's registered `emergency_phone`.

## What is seeded (migration 0066 Appendix B — none verified)

| Key                             | Label                               | Number       | Kind      | Scope    | Status       |
| ------------------------------- | ----------------------------------- | ------------ | --------- | -------- | ------------ |
| `UG.NATIONAL.112`               | General emergency (mobile)          | 112          | general   | national | `unverified` |
| `UG.NATIONAL.999`               | General emergency                   | 999          | general   | national | `unverified` |
| `UG.NATIONAL.912`               | MoH ambulance short code            | 912          | ambulance | national | `unverified` |
| `UG.KAMPALA.KCCA_AMBULANCE`     | KCCA city ambulance (toll-free)     | 0800 299 000 | ambulance | district | `unverified` |
| `UG.NATIONAL.RED_CROSS_HIGHWAY` | Uganda Red Cross highway ambulances | —            | ambulance | national | `to_source`  |
| `UG.NATIONAL.CRISIS`            | Crisis / mental health              | —            | crisis    | national | `to_source`  |
| `UG.NATIONAL.SV`                | Sexual violence support             | —            | sv        | national | `to_source`  |

`to_source` rows have no number: a superadmin must first find and record one (a new migration or a direct row
update by the owner — there is no "edit number" surface on purpose), then verify it like any other.

## "Verified" means a human dialled it

The function cannot check a number. **Verified means: someone on the team dialled it from a Ugandan mobile, the
right service answered, and the date, dialler and who answered are written in the reason.** Anything less stays
`unverified`.

## Steps

1. **Dial it.** From a Ugandan SIM. Note the date and time, who dialled, what answered ("Uganda Police National
   Emergency Call Centre", "KCCA ambulance dispatcher"). For 912, confirm it is actually live — the PRD records the
   MoH's announcement, not a working line.
2. **Open `/admin/emergency`** (superadmin only; the sidebar's Emergency entry). Under **Emergency contacts** find the
   row.
3. **Set the status to `verified`** and write the reason, e.g. `Dialled 2026-09-22 14:10 by <name>; NECC answered.`
   At least 8 characters; it is audited verbatim (`sa_audit_log.action = 'verify_emergency_contact'`).
4. **Four-eyes.** With **one** real superadmin the request auto-satisfies and the row updates at once ("Saved").
   With **two or more**, the page says the request is **pending a second approval** and nothing has changed yet; the
   row waits in `sa_pending_approvals` (`action = 'delete_reference_data'`, intent `verify_emergency_contact`).
   **Known gap:** no four-eyes action in the product has a second-approval executor yet (`_shared/four-eyes.ts` exports `loadPendingForConfirm` / `markFourEyesConfirmed`; nothing calls them). Until
   one is built, verification is only self-executing while the platform has exactly one real superadmin; with two,
   the owner applies the row change by SQL and records the same reason in `sa_audit_log`. Listed in the ADR 0098
   handover.
5. **Check the sheet.** Open `/emergency` signed out in production: the primary button now shows the verified
   number; the hospital fallback disappears. On the phone, the Emergency tab shows the same after the next
   `expo start -c` (the sheet caches the last contacts in AsyncStorage and refreshes on open).

## Un-verifying

Same form, status `unverified`, reason required (e.g. `Dialled 2026-10-03: number dead`). Takes effect on the next
sheet load. Use **Inactive** (`active = false`) for a number that should not show even as unverified in non-prod.

## Never

- Never hard-code a number in a component — `tests/booking/clinical-firewall.test.ts` fails on a literal 112 / 999 /
  912 outside the seed.
- Never verify a number you have not dialled today.
- Never edit the seed JSON to flip a status: `contacts.seed.json` is documentation of what 0066 inserted; the DB row
  is the truth.
