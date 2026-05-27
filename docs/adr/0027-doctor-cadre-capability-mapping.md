# ADR 0027 — Doctor cadre→capability mapping (clinical-safety artifact)

**Status:** Accepted (2026-05-27). The §2 mapping is a **clinical-safety artifact**; any change requires Clinical Safety Officer sign-off before merge.

**Context:** Doctor Workspace, per [`docs/doctor-workspace-gate-a-proposal.md`](../doctor-workspace-gate-a-proposal.md). Uganda's clinical hierarchy (UMDPC/AHPC) has genuinely different scopes per cadre: an intern works under supervision; a clinical officer operates within a defined scope at lower-level facilities; a Medical Officer practises independently; a Medical Officer Special Grade / Consultant supervises, teaches, and authors specialty work. Getting cadre→capability wrong has clinical consequences — an intern independently authorising a controlled-substance prescription, or an MO blocked from a routine admission they're qualified for, are both real harms.

## Decision

**Cadre→capability is a configurable policy matrix, defaulted to a safe set, enforced at three layers.**

The default matrix (seeded for every active hospital by migration 0030):

| Capability                 | Intern / JHO | Clinical Officer | Medical Officer | MOSG / Consultant / Senior |
| -------------------------- | ------------ | ---------------- | --------------- | -------------------------- |
| Routine prescription       | co-sign      | co-sign          | allowed         | allowed                    |
| Controlled substance       | blocked      | blocked          | co-sign         | allowed                    |
| High-cost imaging (CT/MRI) | co-sign      | co-sign          | allowed         | allowed                    |
| Admit patient              | co-sign      | co-sign          | allowed         | allowed                    |
| Discharge patient          | co-sign      | co-sign          | allowed         | allowed                    |

Per-cadre **read** capabilities (view panel, decrypt PHI for accessible patients, participate in care-team threads, start/progress/end encounters) are uniformly allowed for all doctor cadres — gated by patient access basis (ADR 0028, separate).

### Three layers of enforcement

1. **Policy table** (`clinical_cosign_policies`) — per-hospital, optional per-department override. Hospital admins customise; defaults ship.
2. **Server-side execution** — every sensitive action goes through a server action (today `proposeClinicalAction` at [app/doctor/patients/[patientId]/actions.ts](../../app/doctor/patients/%5BpatientId%5D/actions.ts), Edge Functions later) which reads cadre + policy + patient access before executing or queueing a co-sign request. Clients **cannot** bypass.
3. **UI affordance** — the patient summary + prescribe surfaces render different framing per requirement (`allowed` → execute; `cosign_required` → "send for supervisor review"; `blocked` → respectful "above your current scope"). UI is the third layer, not the first.

### Co-sign workflow

When a junior triggers a `cosign_required` action, a `clinical_cosign_requests` row lands in `pending_review` with a JSONB `action_payload` snapshot. The supervisor (or any senior in the same hospital, per the RLS policy) sees it in the **Review queue** at `/doctor/cosign-queue`; approving executes the action (today: a no-op success since the prescribing engine hasn't shipped; the request row is the audit trail). Returning requires a written note so the junior gets actionable feedback.

Every transition is captured in `audit_log` via the trigger; sensitive verbs (`cosign_request`, `cosign_approve`, `cosign_return`, `update_cosign_policy`) are also widened into `sa_audit_log`.

### What this is NOT

- **Not a permission matrix in code.** Hardcoding `if (cadre === 'INTERN_DOCTOR') ...` is forbidden. All checks go through `resolveCapabilities()` which reads the policy table; hospitals can override defaults per department without a code change.
- **Not a substitute for the prescribing engine.** The execution side is a placeholder — the safety scaffold (cadre check + policy lookup + co-sign workflow) is shipped end-to-end, but the actual `prescriptions` / `lab_orders` tables and forms ship with the clinical module. When they land, the "execute" branch swaps from a no-op to the real INSERT.
- **Not patient-access enforcement.** Cadre answers "can I do this kind of action?"; patient access answers "with this patient?" — they compose. See ADR 0028.

### Footnoted defaults (Clinical Safety Officer review on each)

1. **CO routine-prescribing co-sign default ON.** Real Ugandan practice varies — at lower-level facilities COs prescribe independently; at hospital level a co-sign is common. Default ON is safer; the policy row lets a hospital flip it OFF per department.
2. **Interns + COs blocked from controlled-substance prescribing entirely** (not just co-sign). Controlled substances need direct senior involvement, not async approval; juniors can ask a senior to author instead.
3. **MO co-sign for controlled substances by default.** Some hospitals will want this OFF for MOs; the policy row supports.
4. **MO supervisory scope** = interns in the same department only. MOs don't routinely supervise other MOs.

## Consequences

- Policy changes are config, not code. New hospitals get the safe default; departments can tighten without engineering.
- The default matrix is a **clinical-safety artifact** — any change requires a CSO review noted in the PR description.
- The co-sign workflow is the safety primitive for every future high-risk action (prescribing, orders, admits, discharges). Adding a new action kind = adding a new CHECK + a new policy row, not redesigning the workflow.
- Multi-affiliation doctors (consultant at hospital A, MO at hospital B) get the right scope at each — policy is per-hospital, cadre is per-affiliation.
- RLS gives defence-in-depth, but the canonical enforcement is the server-side capability resolver. If RLS were ever loosened, the resolver would still refuse.

## Related

- [ADR 0028 — Patient access basis](0028-patient-access-basis.md) — the read-side complement.
- [ADR 0025 — Responsive patient primitives](0025-responsive-patient-primitives.md) — the doctor workspace is desktop-first; primitives are shared with the patient workspace.
