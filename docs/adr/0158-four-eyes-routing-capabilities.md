# ADR 0158 — A second person verifies every value that routes an emergency

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

Emergency receiving hours, pre-alerts, the SMS and ambulance numbers, arrival directions and critical-care counts decide where an ambulance goes. A typo there sends a patient to the wrong place. The existing four-eyes table serves superadmins only and has no confirmer.

## Decision

1. **`capability_values`** holds typed keys from a catalogue (`CAPABILITY_KEYS`), each marked routing or not.
   - A change to a **routing** key is written to `pending_value`, `pending_by` and `pending_at`. The live value stays until another hospital admin or a superadmin verifies it.
   - The CHECK `capability_values_four_eyes` stops the author verifying their own change.
   - Until verification, MedSync keeps signposting with the last verified value.
2. Values that already had columns on `hospitals` (the pathway, CAP-2) stay there. Verifying writes those columns, and the `emergency_contacts` ambulance row.
3. **CAP-5: `ha-set-hospital-emergency-settings` refuses routing keys** with a 409 that points to the hub. The profile form shows those values read-only and edits only the coordinates.
4. Critical-care bed counts (ICU, HDU, isolation, NICU) are **derived** from Wards & beds and are never typed in.

## Consequences

- A single-admin hospital needs a superadmin to verify its routing values. This is deliberate.
- The design system's caution pair (#D97706 on #FEF3C7) is 2.86:1, which fails WCAG AA. The hub's amber text uses `amber-800` in light mode, and the token in dark mode, until the token is fixed. This is an owner item.
