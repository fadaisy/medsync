# ADR 0437: Partner pharmacies are not hospitals

**Status:** Accepted, 26 Oct 2026. Pharmacy Phase 4 GATE A (D-PH4-22, signed by the CSO), Step 2.

## Context

There is no organisations table. `hospitals` is the tenant, `user_roles.hospital_id` is NOT NULL for everyone except a superadmin, and every hospital-scoped policy keys on `private.current_hospital_id()`. A partner pharmacy stored as a `hospitals` row would inherit hospital-scoped access and appear in hospital lists and reports (H4-15).

## Decision

- **The register.** Partners live in `partner_pharmacies` (0231), with append-only licences, responsible pharmacists, verifications, disclosed interests and status events. "In force" is a projection, evaluated at each use (PN-2).
- **Staff.** Partner staff are in `partner_staff`, not `user_roles` or `staff_affiliations`:
  - one partner per user at a time;
  - `network.admin`, `network.supply` or `network.record`;
  - changed only by being ended.

  `private.current_partner_id()` scopes their reads.

- **Supplies.** `pharmacy_supplies` names a supplying hospital **or** a supplying partner, exactly one (`ps_supplier`). A partner supply carries the partner's product, batch and expiry as text, has no product or batch keys, needs a routing, and writes no stock movement. Law 3's pairing check (`private.pharmacy_supply_movement_pair`) exempts exactly that case (RT-5).
- **The verifier.** The MedSync network verifier is a superadmin named in `network_verifiers`. A confirmation needs a second named verifier, and anyone with a disclosed interest is refused, by trigger.

## Consequences

- Hospital code, policies and reports are unchanged.
- Sign-up gains a partner branch at Step 6 (D-PH4-25).
- All of this is dark: 0231 is unapplied, and `networkRegistry` and `pharmacyNetwork` stay off until the hospital's data-protection officer or legal adviser signs, and legal questions 3 and 5 are answered.
