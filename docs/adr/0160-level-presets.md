# ADR 0160 — Level presets from the MoH 2016 standards, applied as Planned

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

A new hospital should not start from an empty page. The Ministry's _Service Standards and Service Delivery Standards for the Health Sector_ (2016) lists what each level provides.

## Decision

- **Five signed presets** (HC III, HC IV, district, regional referral, national referral) are extracted with page references. They are data files carrying their source, page and signature (E-SVC-05), signed by Fadhul (CSO) on 2026-09-26.
- **Everything a preset adds is Planned**: departments not live, clinics inactive, offerings unconfirmed. Nothing reaches staff or patients until an admin sets it live.
- **The one-time legacy import** (Appendix B, corrected to the application's junction tables) is offered only when the hospital's application actually has answers. Its routing values arrive as pending (ADR 0158).
- The standards comparison shows departments, clinics and imaging against the level's preset. Tests are left out until the national menu arrives (ADR 0156).

## Consequences

- A regional referral hospital starts with 23 Planned items from its preset.
- Updating a preset is a data change with a new signature, not a migration.
