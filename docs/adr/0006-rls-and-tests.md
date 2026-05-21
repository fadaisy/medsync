# ADR-0006: RLS strategy + test infrastructure

- **Status:** Accepted
- **Date:** 2026-05-22
- **Phase:** 0.5
- **Deciders:** Usama Fadhul

## Context

Phase 0.5 lands two things on top of the Phase 0.4 schema:

1. **Row Level Security** — every table is deny-by-default, opened up per role per command via explicit policies. RLS is the hospital-grade security boundary; the app code is the second layer, never the only one.
2. **A test runner that can hit the live Supabase project**, sign in as multiple synthetic users, and assert positive + negative cases per table. We need this not just for one pass — every later sub-phase (0.6 audit, 0.9 auth flows, Phase 1+ clinical tables) must add to this suite.

## Decisions

### 1. RLS policy model

For every Phase 0 table:

- `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE … FORCE ROW LEVEL SECURITY;` — defence in depth so even the table owner (`postgres`) is subject to RLS. Service role still bypasses (Supabase grants it the `bypassrls` attribute).
- Explicit `GRANT` of table-level privileges to `anon` / `authenticated` — Supabase doesn't auto-grant on tables created via direct SQL. Privilege controls what _commands_ a role can attempt; RLS controls which _rows_.
- Permissive policies per `(command, role)` combination. Absence of a permissive policy = deny.

Per-table summary (full SQL in [`supabase/migrations/0002_rls.sql`](../../supabase/migrations/0002_rls.sql)):

| Table                  | `anon` | `authenticated` (non-admin)         | `hospital_admin`                         | `superadmin`                   |
| ---------------------- | ------ | ----------------------------------- | ---------------------------------------- | ------------------------------ |
| `users`                | denied | SELECT/UPDATE own row only          | (treated as non-admin)                   | SELECT all                     |
| `hospitals`            | SELECT | SELECT                              | SELECT                                   | SELECT + INSERT/UPDATE/DELETE  |
| `hospital_departments` | SELECT | SELECT                              | SELECT + write within their hospital     | SELECT + write all             |
| `user_roles`           | denied | SELECT own roles only               | SELECT in scope + INSERT/DELETE in scope | SELECT all + INSERT/DELETE all |
| `consent_records`      | denied | SELECT/INSERT own; no UPDATE/DELETE | (treated as non-admin)                   | SELECT all                     |
| `audit_log`            | denied | denied                              | denied                                   | SELECT all                     |

Notes:

- `hospitals` and `hospital_departments` are `anon`-readable so the unauthenticated sign-up flow can render a hospital/department picker before the user has logged in.
- `consent_records` has no UPDATE/DELETE policy — consent is immutable. Withdrawal records a new row with a typed `consent_type`.
- `audit_log` has no INSERT policy for clients. Rows are populated by the `audit.log_changes()` trigger function (Phase 0.6) running as the function owner (`SECURITY DEFINER`), which side-steps RLS. UPDATE/DELETE are locked down in 0.6 via a BEFORE trigger + `REVOKE`.

### 2. `public.user_has_role(role_name [, hospital_id])` helper

`SECURITY DEFINER STABLE` SQL function that reads `public.user_roles` and returns boolean. Hardened `search_path = public, pg_temp` (prevents search-path injection). `REVOKE EXECUTE FROM PUBLIC` then `GRANT EXECUTE TO authenticated, anon, service_role` so callers can use it from policy expressions.

Logic:

```sql
SELECT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role = role_name
    AND (
      p_hospital_id IS NULL
      OR hospital_id = p_hospital_id
      OR role = 'superadmin'  -- superadmin is global
    )
)
```

Lives in `public.*` rather than `auth.*` because Supabase's pooler user lacks `CREATE` privilege on the `auth` schema (which Supabase owns). The Supabase convention is to put RLS helpers in `public`.

### 3. Vitest as the test runner

[`vitest`](https://vitest.dev/) + `@vitest/coverage-v8`, run via `npm test`. Configured in [`vitest.config.ts`](../../vitest.config.ts).

Key config choices:

- `environment: "node"` — RLS tests are server-side; we hit Supabase via REST.
- `fileParallelism: false` — keeps Supabase auth.admin's free-tier rate limits from tripping when tests run in parallel.
- `globals: false` — explicit `import { describe, test, expect }` per file; less magic.
- `setupFiles` for per-file setup (currently a placeholder for future shared setup).
- `env: { ...process.env }` after env-loading at config time → tests get every env var the developer has in `.env.local`.

### 4. Env loading workaround for the `@next/env` + `NODE_ENV=test` collision

The single most surprising bug of this sub-phase: vitest sets `NODE_ENV=test` automatically, and `@next/env`'s loader _deliberately skips `.env.local`_ when `NODE_ENV === 'test'` (so production tests can't pick up local-only secrets). The result: `loadEnvConfig()` returns `loadedEnvFiles: []` even though `.env.local` is sitting right there.

Workaround in [`vitest.config.ts`](../../vitest.config.ts): temporarily override `NODE_ENV='development'` before `loadEnvConfig()`, restore after. The tests still run under `NODE_ENV=test` — only the file-discovery step is fooled.

Documented inline + here so the next person who refactors the config doesn't quietly break it.

### 5. Test helpers (`tests/rls/_helpers.ts`)

- `createTestUser(suite, role)` — provisions an auth.users row via `auth.admin.createUser`, signs in, returns `{ id, email, client }` where `client` is an anon-key SDK client bearing that user's session JWT.
- `serviceSupabase()` — service-role client for setup / teardown (bypasses RLS).
- `serviceSql` — raw postgres-js handle for direct SQL when REST is awkward (seeding into `user_roles`, asserting row state after RLS-denied UPDATEs).
- `grantRole`, `createTestHospital`, `deleteHospital`, `deleteUser` — narrow helpers.
- `cleanup()` — afterAll sweep deleting any leftover `rls-*@medsync.local` users.
- Email convention: `rls-<suite>-<role>-<rand>@medsync.local` so a crashed run is trivially identifiable for manual cleanup.

### 6. Coverage

- [`tests/rls/users.test.ts`](../../tests/rls/users.test.ts) — anon denied; own-row SELECT/UPDATE; cross-user UPDATE blocked; INSERT/DELETE blocked.
- [`tests/rls/hospitals.test.ts`](../../tests/rls/hospitals.test.ts) — anon SELECT allowed (signup flow); non-superadmin write blocked; superadmin write allowed.
- [`tests/rls/hospital-departments.test.ts`](../../tests/rls/hospital-departments.test.ts) — same pattern; hospital_admin scoped writes verified.
- [`tests/rls/user-roles.test.ts`](../../tests/rls/user-roles.test.ts) — own-roles SELECT; hospital_admin sees own hospital's roles; non-admin can't INSERT; cross-hospital INSERT blocked even for hospital_admin.
- [`tests/rls/consent-records.test.ts`](../../tests/rls/consent-records.test.ts) — own SELECT/INSERT; cross-user INSERT blocked; UPDATE/DELETE immutability.
- [`tests/rls/audit-log.test.ts`](../../tests/rls/audit-log.test.ts) — anon + non-superadmin denied; superadmin SELECT allowed; direct INSERT blocked for everyone.

**36/36 tests pass against live Supabase.** Suite duration ~50s, dominated by `auth.admin.createUser` round-trips.

## Consequences

**Positive**

- Deny-by-default + tested means RLS is the actual security boundary, not just an aspiration. A naive `supabase.from('users').select()` from a logged-in user returns one row, full stop.
- The test suite gives us a regression net for every later sub-phase touching policies. Adding audit triggers (0.6) without breaking RLS is a `npm test` away from confidence.
- `user_has_role` makes policy expressions readable (`auth.user_has_role('superadmin')`) and consistent across tables.

**Negative / trade-offs**

- Tests hit the real Supabase project. They create real auth.users rows during the run; the suite cleans up but a crash leaves orphans behind. The `cleanup()` afterAll catches them on next run but be aware.
- Free-tier auth.admin endpoints rate-limit aggressively. `fileParallelism: false` keeps the suite under that, at the cost of ~50s runtime that could theoretically be ~10s parallel. Worth it.
- The `@next/env` + `NODE_ENV=test` workaround is non-obvious. Documented in code, ADR, and CHANGELOG so the next refactorer doesn't strip it.
- `users` table requires manual seeding (`INSERT public.users (id, ...) VALUES (auth_user_id, ...)`) because the Phase 0.9 trigger that mirrors `auth.users` → `public.users` doesn't exist yet.

## Alternatives considered

- **Jest** — rejected. Slower, more complex config, no native ESM. Vitest's vite-native + ESM-first model is a better fit for a Next.js project.
- **Skip RLS, enforce in app code only.** Rejected outright — the kickoff explicitly mandates RLS at the database layer.
- **Use `auth` schema for the role helper.** Rejected — Supabase doesn't grant `CREATE` on `auth` to the pooler user; the convention is to use `public`.
- **Postgres ENUM for role names.** Already rejected in ADR-0005; CHECK constraint is enough.
- **Spin up a dedicated test Supabase project.** Deferred. Phase 0 has no real data; pollution risk is low. Phase 1+ will likely want a separate test project.
- **Mocked Supabase for unit tests.** Rejected for RLS — RLS only exists at the database layer; mocking would defeat the point.
- **Roll our own env loader instead of `@next/env`.** Rejected — `@next/env` is already a transitive dep, and the NODE_ENV workaround is a one-line override.

## Follow-ups

- 0.6 layers the audit triggers + audit_log lockdown on top of these policies.
- 0.9 adds a trigger on `auth.users` insert that mirrors into `public.users`, removing the manual-seed need in those tests.
- When team > 1: dedicated test Supabase project, CI runs the suite against it.
- Consider adding a `pnpm test:rls` filter for just RLS tests later when we have non-RLS test suites.
