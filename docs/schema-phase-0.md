# Phase 0 schema proposal

> Authoritative source for the six tables Phase 0 ships. Phase 0.4 implements this; later sub-phases (0.5 RLS, 0.6 audit, 0.7 encryption) build on top.

**Scope:** the foundation only — identity, organisation, audit, consent. No clinical tables (patients, encounters, labs, prescriptions, vitals) — those land in Phase 1+.

**Schema:** `public` only. We never touch Supabase's `auth`, `storage`, `realtime` schemas; those are managed by Supabase.

**Conventions:**

- Primary keys are `uuid` (Postgres `gen_random_uuid()`).
- Timestamps are `timestamptz` with `now()` defaults. Every mutable table has `created_at` + `updated_at`. `updated_at` is bumped by an `updated_at` trigger (added in 0.4).
- Names: tables and columns are `snake_case`, plural for tables (`hospital_departments`, not `hospital_department`).
- Foreign keys: explicit `on delete` behaviour on every FK. Deleting an `auth.users` row cascades to `public.users`; everything else is `restrict` or `set null` per row-level reasoning below.
- Soft delete: none for Phase 0. We delete rows; audit log preserves history. Revisit if regulators require row retention.

---

## Tables

### 1. `public.users`

1:1 with `auth.users`. The handful of profile fields we can't keep in Supabase's auth metadata land here. PHI lives elsewhere (encrypted) when those modules ship.

| Column       | Type          | Constraints                                 | Notes                                                              |
| ------------ | ------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `id`         | `uuid`        | PK, FK → `auth.users(id)` ON DELETE CASCADE | Same uuid as the auth row.                                         |
| `full_name`  | `text`        | NOT NULL                                    | Plaintext for Phase 0 (operational). Encryption in Phase 1+.       |
| `email`      | `text`        | NOT NULL, UNIQUE                            | Mirrors `auth.users.email`; useful for joins without schema reach. |
| `phone`      | `text`        | NULL                                        | E.164 format. SMS Phase 5+.                                        |
| `created_at` | `timestamptz` | NOT NULL, default `now()`                   |                                                                    |
| `updated_at` | `timestamptz` | NOT NULL, default `now()`                   | Trigger-bumped.                                                    |

**Indexes:** PK on `id`, UNIQUE on `email`.
**RLS intent:** authenticated user can `SELECT` only their own row (`id = auth.uid()`). No `INSERT` from clients (rows created by a trigger on `auth.users` insert, or via Edge Function); `UPDATE` allowed for own row, restricted columns. Service role bypasses. Anon denied everything.
**Audited:** yes (any change to identity is significant).

---

### 2. `public.hospitals`

The organisation root. Mulago National Referral seeded in 0.11. Plural-name and slug-name both indexed.

| Column       | Type                                                                                   | Constraints               | Notes                                              |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------- |
| `id`         | `uuid`                                                                                 | PK                        |                                                    |
| `name`       | `text`                                                                                 | NOT NULL                  | Display name: "Mulago National Referral Hospital". |
| `slug`       | `text`                                                                                 | NOT NULL, UNIQUE          | URL-safe: `mulago-national`.                       |
| `country`    | `text`                                                                                 | NOT NULL, default `'UG'`  | ISO-3166-1 alpha-2.                                |
| `region`     | `text`                                                                                 | NULL                      | "Central", "Northern", etc.                        |
| `district`   | `text`                                                                                 | NULL                      | "Kampala".                                         |
| `level`      | `text` (enum-style, CHECK: `national_referral, regional, district, hc4, hc3, private`) | NOT NULL                  | Uganda MoH facility taxonomy.                      |
| `created_at` | `timestamptz`                                                                          | NOT NULL, default `now()` |                                                    |
| `updated_at` | `timestamptz`                                                                          | NOT NULL, default `now()` |                                                    |

**Indexes:** PK on `id`, UNIQUE on `slug`, btree on `country, district`.
**RLS intent:** authenticated reads allowed (org listing is non-sensitive). Writes restricted to `superadmin` role. Service role bypasses. Anon allowed `SELECT` (so a sign-up flow can pick a hospital before authenticating) — _narrow open-by-design exception_.
**Audited:** yes.

---

### 3. `public.hospital_departments`

A department within a hospital (Internal Medicine), or a sub-specialty within a department (Cardiology). Self-referential via `parent_id` to model the IM → 13 sub-specialties tree (seeded in 0.11).

| Column        | Type          | Constraints                                             | Notes                                                 |
| ------------- | ------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| `id`          | `uuid`        | PK                                                      |                                                       |
| `hospital_id` | `uuid`        | NOT NULL, FK → `hospitals(id)` ON DELETE CASCADE        |                                                       |
| `parent_id`   | `uuid`        | NULL, FK → `hospital_departments(id)` ON DELETE CASCADE | NULL = top-level department.                          |
| `name`        | `text`        | NOT NULL                                                | "Internal Medicine", "Cardiology".                    |
| `slug`        | `text`        | NOT NULL                                                | URL-safe, unique within (`hospital_id`, `parent_id`). |
| `created_at`  | `timestamptz` | NOT NULL, default `now()`                               |                                                       |
| `updated_at`  | `timestamptz` | NOT NULL, default `now()`                               |                                                       |

**Indexes:** PK on `id`, UNIQUE on (`hospital_id`, `parent_id`, `slug`), btree on `hospital_id`, btree on `parent_id`.
**RLS intent:** mirrors `hospitals` — authenticated reads allowed, writes restricted to `superadmin` or `hospital_admin` scoped to that hospital. Anon `SELECT` permitted.
**Audited:** yes.

---

### 4. `public.user_roles`

A user holds zero or more roles, scoped to a hospital (or global for `superadmin`). Composite uniqueness so a user can't hold the same role twice in the same scope.

| Column        | Type                                                                                          | Constraints                                       | Notes                                                                  |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`          | `uuid`                                                                                        | PK                                                |                                                                        |
| `user_id`     | `uuid`                                                                                        | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |                                                                        |
| `role`        | `text` (CHECK: `patient, clinician, nurse, pharmacist, lab_tech, hospital_admin, superadmin`) | NOT NULL                                          | Postgres CHECK rather than ENUM type — easier to evolve in migrations. |
| `hospital_id` | `uuid`                                                                                        | NULL, FK → `hospitals(id)` ON DELETE CASCADE      | NULL only valid when `role = 'superadmin'` (enforced by CHECK).        |
| `created_at`  | `timestamptz`                                                                                 | NOT NULL, default `now()`                         |                                                                        |
| `created_by`  | `uuid`                                                                                        | NULL, FK → `auth.users(id)` ON DELETE SET NULL    | Who granted the role (NULL only for system-seeded rows).               |

**Indexes:** PK on `id`, UNIQUE on (`user_id`, `role`, `hospital_id`) — composite uniqueness; btree on `user_id`; btree on (`hospital_id`, `role`) for "who's a clinician at hospital X" queries.
**Check constraints:**

- `(role = 'superadmin' AND hospital_id IS NULL) OR (role <> 'superadmin' AND hospital_id IS NOT NULL)` — superadmin is global; everything else is hospital-scoped.

**RLS intent:** user can `SELECT` their own roles. `hospital_admin` can `SELECT` all roles within their hospital. `superadmin` can `SELECT` all. Inserts restricted to `superadmin` or `hospital_admin` (scoped). Service role bypasses. Anon denied.
**Audited:** yes — role assignments are security-critical.

---

### 5. `public.consent_records`

Versioned, immutable consent log. Each (user, consent_type, version) is recorded once with the exact text hash so we can prove later what they agreed to. Required for Uganda Data Protection and Privacy Act 2019.

| Column                | Type                                                                                  | Constraints                                       | Notes                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`                  | `uuid`                                                                                | PK                                                |                                                                                                            |
| `user_id`             | `uuid`                                                                                | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |                                                                                                            |
| `consent_type`        | `text` (CHECK: `data_processing, sms_communication, research_use, third_party_share`) | NOT NULL                                          |                                                                                                            |
| `version`             | `text`                                                                                | NOT NULL                                          | Semver-style, e.g. `1.0.0`. The legal text is versioned separately in `docs/legal/`.                       |
| `consent_text_sha256` | `text`                                                                                | NOT NULL                                          | Hex SHA-256 of the exact text shown. Lets us prove what they signed even if `docs/legal/` is later edited. |
| `accepted_at`         | `timestamptz`                                                                         | NOT NULL, default `now()`                         |                                                                                                            |
| `accepted_ip`         | `inet`                                                                                | NULL                                              | Captured server-side. Forensic only; not used for auth.                                                    |
| `accepted_user_agent` | `text`                                                                                | NULL                                              |                                                                                                            |

**Indexes:** PK on `id`, btree on (`user_id`, `consent_type`), partial UNIQUE on (`user_id`, `consent_type`, `version`) — same version can only be accepted once.
**RLS intent:** user can `SELECT` and `INSERT` their own consent rows. No `UPDATE` or `DELETE` for anyone (immutability enforced both via RLS and trigger). Service role bypasses (for audits / data-export requests). Anon denied.
**Audited:** yes.

---

### 6. `public.audit_log`

Append-only system log. Populated _only_ by the `audit.log_changes()` trigger (added in 0.6), never by application code. Locked down: no `UPDATE` or `DELETE` from anyone (BEFORE trigger raises + `REVOKE` privileges as a second layer).

| Column        | Type                                     | Constraints                                    | Notes                                                             |
| ------------- | ---------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `id`          | `bigserial`                              | PK                                             | bigserial because audit volume is high; uuid wastes 16 bytes/row. |
| `actor_id`    | `uuid`                                   | NULL, FK → `auth.users(id)` ON DELETE SET NULL | Who performed the action; NULL for service-role / system.         |
| `action`      | `text` (CHECK: `insert, update, delete`) | NOT NULL                                       |                                                                   |
| `schema_name` | `text`                                   | NOT NULL                                       | `public`.                                                         |
| `table_name`  | `text`                                   | NOT NULL                                       |                                                                   |
| `record_id`   | `text`                                   | NULL                                           | PK of the affected row (text so it works for uuid + bigint).      |
| `before_data` | `jsonb`                                  | NULL                                           | `OLD.*` on update/delete; NULL on insert.                         |
| `after_data`  | `jsonb`                                  | NULL                                           | `NEW.*` on insert/update; NULL on delete.                         |
| `timestamp`   | `timestamptz`                            | NOT NULL, default `now()`                      |                                                                   |
| `request_id`  | `uuid`                                   | NULL                                           | Set via `app.request_id` GUC (Phase 0.9 sets per request).        |

**Indexes:** PK on `id`, btree on `timestamp`, btree on (`table_name`, `record_id`), btree on `actor_id`.
**RLS intent:** no client-side `SELECT` for Phase 0 (audits are admin-only; we'll add `superadmin` SELECT in 0.5). `INSERT` only via the trigger function (which runs as the table owner — RLS skipped). `UPDATE`/`DELETE`: explicitly denied via BEFORE trigger that raises + `REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC, anon, authenticated`. Service role can read; cannot mutate (because the trigger fires regardless of role).
**Audited:** no — auditing the audit log would recurse.

---

## Encrypted columns (Phase 0)

**None.** The encryption library lands in 0.7; the encrypted columns that consume it (NIN, full names _as stored_, clinical notes, lab free-text) live in Phase 1+ tables. Phase 0 has no encrypted columns. This is recorded so future readers understand why `lib/encryption.ts` exists with no callers in 0.7.

## Audited tables (audit triggers in 0.6)

`users`, `hospitals`, `hospital_departments`, `user_roles`, `consent_records`.
**Not** `audit_log` (would recurse).

## RLS policies (designed in 0.5, applied in 0.5)

Every Phase 0 table gets:

1. `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`
2. `ALTER TABLE … FORCE ROW LEVEL SECURITY;` — applies RLS even to the table owner (defence in depth; the table owner being `postgres` shouldn't grant a free pass).
3. Deny-by-default — no permissive policy ships unless explicitly written.
4. Per-table policies per the "RLS intent" line above.
5. `auth.user_has_role(text)` SQL helper for role-based policies.

## Updated-at trigger

A single shared `public.set_updated_at()` trigger function is created in 0.4 and attached to every table that has an `updated_at` column (`users`, `hospitals`, `hospital_departments`).

## Open questions / future work

- **Postgres ENUM vs CHECK constraint for `role` / `consent_type` / `level`.** Chose CHECK for evolvability (`ALTER TYPE` is awkward; `ALTER TABLE … DROP CONSTRAINT, ADD CONSTRAINT` is simple). Re-evaluate when the role list stabilises.
- **`auto-create users row when auth.users row is created`** — a trigger on `auth.users` could mirror new sign-ups into `public.users`. Deferred to 0.9 (sign-up flow); for 0.11 seeding, the script will insert directly.
- **Soft delete columns (`deleted_at`).** Not in Phase 0. If regulators require retention rather than deletion, add later.
