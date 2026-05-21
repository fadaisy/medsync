# ADR-0005: Phase 0 schema + pooler-friendly migrator

- **Status:** Accepted
- **Date:** 2026-05-22
- **Phase:** 0.4
- **Deciders:** Usama Fadhul

## Context

Phase 0.4 ships the six foundation tables documented in [`docs/schema-phase-0.md`](../schema-phase-0.md) — `users`, `hospitals`, `hospital_departments`, `user_roles`, `consent_records`, `audit_log` — plus the supporting `set_updated_at()` trigger. RLS, audit triggers, and PHI encryption land in 0.5 / 0.6 / 0.7 on top of this base.

Two implementation problems surfaced during 0.4 and shaped the decisions below.

### Problem 1 — FK references to `auth.users` confuse Drizzle migrations

Drizzle needs typed column definitions to emit foreign keys; the only way to write `references(() => authUsers.id)` is to define a phantom `authUsers` table. But drizzle-kit then emits `CREATE SCHEMA "auth"` and `CREATE TABLE "auth"."users"` into the generated SQL — both already managed by Supabase. Running that migration as-is would fail.

`schemaFilter: ["public"]` in `drizzle.config.ts` filters introspection (the `pull` direction), not generation. There is no first-class drizzle-kit option to "reference this table without managing it."

### Problem 2 — `drizzle-kit migrate` needs prepared statements; pooler doesn't support them

`drizzle-kit migrate` connects via `DATABASE_DIRECT_URL` (the Supabase direct hostname, `db.<ref>.supabase.co:5432`) because the transaction-mode pooler (`:6543`) doesn't support prepared statements. On Supabase free tier, the direct hostname is **IPv6-only** and unreachable from most consumer networks (including this dev environment — `getaddrinfo ENOTFOUND`).

This makes the documented Drizzle workflow unusable for free-tier projects until you upgrade to Pro (which gives an IPv4 direct address) or wire IPv6 connectivity.

## Decisions

### 1. Schema design

Implemented verbatim from [`docs/schema-phase-0.md`](../schema-phase-0.md) — see that document for the per-table breakdown. Highlights:

- Six tables in `public`: `users`, `hospitals`, `hospital_departments`, `user_roles`, `consent_records`, `audit_log`.
- `users.id` is the same `uuid` as the corresponding `auth.users.id` (1:1, ON DELETE CASCADE).
- `hospital_departments` is self-referential via `parent_id` to model IM → 13 sub-specialty trees.
- `user_roles` enforces "superadmin is global, every other role is hospital-scoped" via a Postgres CHECK constraint that pairs `role` and `hospital_id`.
- `consent_records` carries `consent_text_sha256` (hex SHA-256 of the legal text the user saw) so we can prove later what they signed.
- `audit_log` uses `bigint identity` for the PK (cheaper than uuid at audit-log volume) and is locked down in 0.6 (BEFORE trigger + `REVOKE`).
- Role and consent_type values are CHECK constraints (not Postgres ENUM types) for evolvability — `ALTER TABLE … DROP CONSTRAINT, ADD CONSTRAINT` is simpler than `ALTER TYPE … ADD VALUE`.

### 2. Drizzle ↔ `auth.users` pattern

Define `auth.users` as a phantom `pgSchema("auth").table("users", { id: uuid().primaryKey() })` in [`db/schema/_auth.ts`](../../db/schema/_auth.ts) so FK references type-check. **Hand-strip** the `CREATE SCHEMA "auth"` and `CREATE TABLE "auth"."users"` lines from each generated migration before applying. Documented header in [`supabase/migrations/0000_nosy_thunderbird.sql`](../../supabase/migrations/0000_nosy_thunderbird.sql).

Procedure on regeneration:

1. `npm run db:generate`
2. Open the new file in `supabase/migrations/`
3. Delete the leading `CREATE SCHEMA "auth"` + `CREATE TABLE "auth"."users"` block (Drizzle will keep emitting it as long as `_auth.ts` exists)
4. Run `npm run db:migrate`

When the team grows we'll write a post-process script to do this automatically.

### 3. Pooler-friendly migrator

Replaced `npm run db:migrate` with [`scripts/migrate.ts`](../../scripts/migrate.ts), which uses `postgres-js` against the transaction pooler (`DATABASE_URL` on 6543) with `prepare: false`. Tracks applied migrations in `public._medsync_migrations` (idempotent), wraps each file in a transaction, fails the whole file on any statement error.

Trade-off: the official `drizzle-kit migrate` (`npm run db:migrate:drizzle`) is preserved for anyone with an IPv6-reachable direct hostname or a Pro project — the custom script is the default because it works on free tier.

### 4. `set_updated_at()` trigger ships in 0.4

`updated_at` columns are bumped by a single shared trigger function attached to every mutable table (`users`, `hospitals`, `hospital_departments`). Lives in [`supabase/migrations/0001_updated_at_trigger.sql`](../../supabase/migrations/0001_updated_at_trigger.sql) — hand-written because drizzle-kit doesn't generate function/trigger DDL.

## Consequences

**Positive**

- All six tables are live in Supabase, verified via `pg_tables` query — schema lands on time.
- Pooler-friendly migrator unblocks free-tier development; no IPv6 dependency, no Pro upgrade required for Phase 0.
- Drizzle types fully resolve `auth.users` references → IDE autocomplete and typed query results work for `user_id`, `actor_id`, etc.
- The hand-strip pattern is a 30-second edit, well within tolerance until we automate it.

**Negative / trade-offs**

- Every regenerated Drizzle migration needs the 5-line manual edit. Easy to forget. Mitigated by the explicit comment in the generated file + ADR + the journal table (re-applying a borked migration would fail loudly).
- The custom migrator skips drizzle-kit's snapshot/journal system (`supabase/migrations/meta/`). We rely on our own `_medsync_migrations` tracking table. Drizzle's `db:check` won't see our applied state. Acceptable for Phase 0; revisit when team > 1.
- `DATABASE_DIRECT_URL` is now unused by application code or scripts (we kept the env var so the original Drizzle migrator still works if needed). Documented in `.env.example`.
- Postgres CHECK constraints for role / consent_type / level make adding a value a migration. ENUM would be even worse (`ALTER TYPE`). Worth it for the explicitness; rarely changes.

## Alternatives considered

- **Use Supabase Dashboard SQL Editor manually.** Rejected — fine for one-off, terrible for repeatable migrations + tests.
- **Install Supabase CLI and use `supabase db push`.** Rejected for Phase 0 — adds another binary, another auth flow, doesn't integrate with Drizzle's schema-as-code.
- **Upgrade Supabase to Pro for IPv4 direct connection.** Rejected for now — Phase 0 has no real patient data; ~$25/mo cost is for Phase 5+ per the kickoff.
- **Use Postgres ENUM types instead of CHECK constraints.** Rejected — `ALTER TYPE … ADD VALUE` is non-transactional and hard to roll back; CHECK constraints are simpler to evolve.
- **Use `gen_random_uuid()` on the application side for `users.id`.** Rejected — `users.id` must equal `auth.users.id` (1:1), so we always insert with an explicit uuid. Default not needed.
- **Generate the auth.users phantom with `external: true` or similar Drizzle option.** Rejected — no such option exists in Drizzle 0.45. Re-evaluate on future Drizzle upgrades.

## Follow-ups

- Phase 0.5 lands RLS policies (deny-by-default) + RLS test suite using vitest.
- Phase 0.6 lands audit triggers + `audit_log` append-only lockdown.
- Phase 0.9 adds a Postgres trigger on `auth.users` insert that mirrors new sign-ups into `public.users`.
- When team grows: write a post-generate hook that strips the auth.users CREATE block automatically.
- When we move to Pro / IPv4 direct: re-evaluate switching back to `drizzle-kit migrate` as the canonical path.
