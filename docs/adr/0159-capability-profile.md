# ADR 0159 — A versioned capability profile with three audiences

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

Referrals, the public directory and network planning each need "what can this hospital do". None of them may see personal data or unverified routing values.

## Decision

`buildCapabilityProfile(input, audience)` is pure and versioned (`capability-profile.v1`), with snapshot tests. It carries no people at all: no heads, no staff and no counts of staff.

- **internal:**
  - live departments, with the start flag and units;
  - every live clinic by name;
  - confirmed diagnostics, with where they are referred;
  - every capability value, with its verification state.
- **network:** the same, but confidential clinics are named only as "Clinic".
- **public:**
  - live clinics that patients book directly and that are not confidential;
  - confirmed tests, but not the ones marked not offered, and not where they are referred;
  - only the emergency capability and arrival directions;
  - availability for clinics, imaging and tests only.

Pending (unverified) routing changes are never published to any audience. The value shown is always the live one (ADR 0158).

## Consequences

- Superadmins get aggregates across hospitals (the standards comparison), never another hospital's detail (D-SVC-14).
