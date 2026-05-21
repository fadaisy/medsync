# ADR-0007: Audit infrastructure (`audit_log_changes()` + append-only lockdown)

- **Status:** Accepted
- **Date:** 2026-05-22
- **Phase:** 0.6
- **Deciders:** Usama Fadhul

## Context

Phase 0.6 adds the second non-negotiable hospital-grade security layer: every change to a sensitive table generates an immutable audit record, and the audit log itself cannot be modified after the fact.

This is required by Uganda Data Protection and Privacy Act 2019 (Section 19 — security obligations), HIPAA-equivalent practice, and the "defensible to a UMDPC investigator" bar in the kickoff.

## Decisions

### 1. Two trigger functions, both in `public.*`

- **`public.audit_log_changes()`** — `AFTER INSERT OR UPDATE OR DELETE` on each audited table. Captures `OLD` and `NEW` as `jsonb`, resolves the PK as text (handles uuid + bigint + text uniformly), captures `auth.uid()` as `actor_id`, and INSERTs into `public.audit_log`. Declared `SECURITY DEFINER` so it can INSERT regardless of caller role.
- **`public.audit_log_block_modify()`** — `BEFORE UPDATE OR DELETE` on `public.audit_log`. Always `RAISE EXCEPTION 'audit_log is append-only; <OP> forbidden'` (with SQLSTATE `insufficient_privilege`).

Both live in `public.*` for the same reason as the RLS helper (ADR-0006): the pooler user lacks `CREATE` on `auth.*`, and adding a third `audit` schema would hit the same restriction. The function names are explicit enough that there's no namespace collision.

### 2. Captured columns

`audit_log` is populated with:

- `actor_id` — `auth.uid()` (nullable; NULL when service-role or system).
- `action` — lowercased `TG_OP` (`insert`, `update`, `delete`).
- `schema_name` / `table_name` — from `TG_TABLE_SCHEMA` / `TG_TABLE_NAME`.
- `record_id` — `to_jsonb(NEW or OLD)->>'id'`. Works for every table because all six Phase 0 tables use `id` as their PK.
- `before_data` — `to_jsonb(OLD)` for UPDATE/DELETE; NULL for INSERT.
- `after_data` — `to_jsonb(NEW)` for INSERT/UPDATE; NULL for DELETE.
- `request_id` — read from `app.request_id` GUC. Phase 0.9 middleware will set this per request; until then it's NULL.
- `timestamp` — defaulted to `now()`.

### 3. Audited tables

`users`, `hospitals`, `hospital_departments`, `user_roles`, `consent_records`. **Not** `audit_log` itself (would recurse infinitely on every INSERT).

### 4. Append-only lockdown — two layers

1. **`BEFORE UPDATE OR DELETE` trigger** raises immediately. Fires regardless of who's connected (postgres, service_role, anon, authenticated, …). This is the actual guarantee.
2. **`REVOKE UPDATE, DELETE` from PUBLIC, anon, authenticated.** Defence in depth; even if someone later writes a permissive policy, the role doesn't have the privilege in the first place.

`service_role` is intentionally NOT REVOKEd from — it's a Postgres role with `bypassrls`, but the BEFORE trigger above still raises. So service-role _thinks_ it has UPDATE/DELETE privilege but is blocked at the trigger. This way operational scripts that use service-role get the same hard failure as anyone else if they try to tamper.

### 5. Tests

[`tests/audit/audit.test.ts`](../../tests/audit/audit.test.ts) — two `describe` blocks:

- **`audit: log_changes trigger`** — INSERT, UPDATE, DELETE on `hospitals`, asserts that the corresponding `audit_log` row carries the right `action`, `before_data`, `after_data`.
- **`audit: append-only protection`** — UPDATE on `audit_log` raises (`/append-only/i`); DELETE raises; the original row survives both attempts.

42 tests pass total (36 RLS + 6 audit), suite runtime ~63s against live Supabase.

## Consequences

**Positive**

- Every sensitive change is now provably logged. A regulator asking "who deleted this user role at 14:32 on May 22?" gets a real answer with `actor_id` and a full `before_data` snapshot.
- The trigger captures `OLD`/`NEW` as jsonb, so schema evolution doesn't break old audit rows — they retain the exact field set as it existed at the time.
- Even a misconfigured RLS policy or accidental `GRANT` later can't tamper with audit rows — the BEFORE trigger is unconditional.
- Service-role is held to the same standard. There is no "trusted internal" path that bypasses audit.

**Negative / trade-offs**

- Audit data accumulates and is never deleted. For Phase 0 (free-tier Supabase, no real patient data) this is fine; in production we'll need a retention policy + cold-storage offload. The trigger doesn't fire on `TRUNCATE`, so a future op can purge with `TRUNCATE audit_log` if needed — but that's a privileged maintenance task, not a regular operation.
- Test rows accumulate too (the `cleanup()` paths can't delete from audit_log). Mitigated by predictable test row signatures (`table_name = 'audit_protection_test'`, etc.) so manual cleanup via `TRUNCATE` or filtered DELETE-via-superuser is possible.
- The trigger does a `to_jsonb(NEW)` on every INSERT/UPDATE. Cheap on Phase 0 row volumes; will need to re-evaluate for high-frequency tables in Phase 1+ (vitals, monitoring data). For those, switch to a column-filtered audit or use a separate event stream.
- `actor_id` from `auth.uid()` is NULL during seeding / migrations / service-role ops. Acceptable for Phase 0; revisit if regulators demand stronger actor attribution for system ops.

## Alternatives considered

- **Application-level audit (insert rows from code).** Rejected outright. Easy to forget; bypassed by direct SQL; breaks on Edge Function failures. Triggers are the only architecturally sound option.
- **Postgres `pgaudit` extension.** Rejected — designed for compliance-style audit at the statement level (logs SQL text), not the field-level diff we want. Also requires superuser to install, which Supabase free tier doesn't grant.
- **Separate `audit.*` schema for the functions.** Rejected — same `CREATE SCHEMA` permission constraint as `auth.*`. `public.*` works and the function names are unambiguous.
- **Soft-protect audit_log via RLS only.** Rejected — RLS gates ROWS but a `DELETE` policy could be written by mistake. The BEFORE trigger is unconditional; safer.
- **Capture only specific columns.** Rejected for Phase 0 — full `to_jsonb(NEW)` is the simplest correct thing. Re-evaluate per table if storage becomes a concern.

## Follow-ups

- Phase 0.9 middleware sets `app.request_id` GUC per request so `audit_log.request_id` correlates back to web logs.
- Phase 0.10 reference Edge Function (`assign-role`) explicitly inserts audit context.
- Phase 1+ clinical tables (vitals streams, etc.) may need a high-volume variant — possibly a separate `audit_events` partition or an event-stream destination.
- Add a retention / cold-storage policy as part of production deployment planning.
