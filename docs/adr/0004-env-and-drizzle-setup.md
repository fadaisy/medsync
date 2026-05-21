# ADR-0004: Environment validation, Supabase clients, Drizzle setup

- **Status:** Accepted
- **Date:** 2026-05-21
- **Phase:** 0.3
- **Deciders:** Usama Fadhul

## Context

Phase 0.3 wires the data layer: Supabase (auth + Postgres) and Drizzle (typed schema + queries). Two cross-cutting concerns shape every decision below:

1. **Hospital-grade safety** — runtime crashes from a missing env var must be impossible to ship. Validation must run before any code path reads a credential.
2. **RLS is the gate** — every query travels through a client with a specific auth posture (anon vs cookie-authenticated user vs service role), and the choice must be obvious at the import site.

## Decisions

### 1. Environment validation: `@t3-oss/env-nextjs` (split server/client)

[`lib/env.ts`](../../lib/env.ts) wraps `createEnv()` with two Zod schemas:

- **`server:`** secrets that must never reach the client bundle (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DATABASE_DIRECT_URL`, `MEDSYNC_PHI_KEY`, Sentry/Africa's Talking creds).
- **`client:`** `NEXT_PUBLIC_*` vars that are safe to inline at build time (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SENTRY_DSN`).

Why t3-env:

- Validates on first import — fail fast, with a Zod error pointing at the missing/invalid var.
- Won't let server vars accidentally cross the client boundary (build-time guard).
- Standard in the Next.js ecosystem; small (~3 KB) and well-maintained.

Escape hatch: `SKIP_ENV_VALIDATION=1` lets `npm run build` succeed during scaffolding before creds exist. Never set this on Vercel — production builds must validate.

Fields not yet consumed in this sub-phase (`MEDSYNC_PHI_KEY`, Sentry, Africa's Talking) are marked optional so the build doesn't demand them until the sub-phase that wires them.

### 2. Three Supabase clients, one per auth posture

Imported from explicit paths so the auth intent is visible at the call site:

| Client                                                 | Use from                                          | Auth                                                      | RLS applies? |
| ------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------- | ------------ |
| [`createClient`](../../lib/supabase/client.ts)         | Client Components                                 | Anon (browser cookies)                                    | Yes          |
| [`createClient`](../../lib/supabase/server.ts)         | Server Components, Route Handlers, Server Actions | Anon → user session (cookies threaded via `next/headers`) | Yes          |
| [`createServiceClient`](../../lib/supabase/service.ts) | Edge Functions, trusted server code               | Service role                                              | **Bypassed** |

Key rules baked into the file headers:

- **Always use `getUser()` (server-validates JWT), never `getSession()`** — same guidance as the kickoff. `getSession()` returns the cookie without verifying the signature; can be forged.
- `service.ts` imports `"server-only"` so a client component importing it fails at build time, not in production.
- Next.js 16: `cookies()` is async — `await createClient()` from the server, not synchronous.

### 3. Drizzle + postgres-js, pooler-aware

- **`db/index.ts`** uses `DATABASE_URL` (the Supabase connection pooler on port 6543) with `prepare: false`. The pooler runs in _Transaction_ mode by default which doesn't support prepared statements.
- **`drizzle.config.ts`** uses `DATABASE_DIRECT_URL` (port 5432) — drizzle-kit's introspect/push/migrate flows need prepared statements.
- `schemaFilter: ["public"]` — we never touch Supabase's `auth`, `storage`, `realtime` schemas. Those are managed by Supabase itself; trying to migrate them via Drizzle would corrupt the project.
- Singleton client cached on `globalThis` in dev (survives HMR; avoids the dev-server connection leak you hit a few saves in).
- `out: "./supabase/migrations"` — migrations land in the folder the kickoff specified. drizzle-kit writes plain `.sql` files plus a `meta/` journal; both are committed.

### 4. Schema-as-code, schema barrel

[`db/schema/index.ts`](../../db/schema/index.ts) is a barrel export. Phase 0.4 adds the six Phase 0 tables (users, user_roles, hospitals, hospital_departments, audit_log, consent_records) as separate files re-exported here. The barrel keeps `import { db, schema } from "@/db"` clean from the call site.

### 5. Dev-only health endpoint as the smoke test

[`app/api/health/route.ts`](../../app/api/health/route.ts) runs three checks on GET:

1. `db.execute(sql\`SELECT now(), current_database()\`)` — proves the Drizzle/postgres pool reaches the pooler.
2. `createClient` (server, anon) → `getUser()` — proves the SSR client reaches Supabase auth.
3. `createServiceClient` → `auth.admin.listUsers({ perPage: 1 })` — proves the service-role key works.

Gated to non-production (`env.NODE_ENV !== "production"`). For real production health checks we'll add a hardened endpoint behind a shared-secret header in a later phase.

### npm scripts added

| Script        | Purpose                                               |
| ------------- | ----------------------------------------------------- |
| `db:generate` | Diff schema → SQL migration in `supabase/migrations/` |
| `db:migrate`  | Apply pending migrations to the target database       |
| `db:push`     | Push schema directly without a migration (dev only)   |
| `db:studio`   | Open Drizzle Studio in browser                        |
| `db:check`    | Verify migration consistency / no drift               |

## Consequences

**Positive**

- Three import paths make auth posture explicit. Code review can flag any service-role usage outside of Edge Functions / Edge Function helpers.
- Env validation cannot be bypassed accidentally (build fails clearly without it; the escape hatch is named and documented).
- `prepare: false` on the pooler avoids the most common "works locally, breaks in prod" Supabase failure.
- `/api/health` route gives the user a one-click verification that all three integrations work. (Originally proposed as `/api/_health`; Next.js App Router treats underscore-prefixed folders as private and excludes them from routing — bug caught on first smoke test, route renamed.)

**Negative / trade-offs**

- Two connection URLs (`DATABASE_URL` for runtime, `DATABASE_DIRECT_URL` for migrations). Easy to mix up. Mitigated by Zod refine() rules in `lib/env.ts` that check the URL host/port.
- t3-env adds a small dependency (~3 KB) and an additional layer to learn. Worth the safety.
- The schema barrel is empty in Phase 0.3. Phase 0.4 lands the real tables.
- Drizzle-kit and Supabase CLI both target `supabase/migrations/`. We use only Drizzle-kit; if someone runs `supabase db push` here they'll fight Drizzle. Documented in README.

## Alternatives considered

- **Plain `process.env` + manual null checks.** Rejected — too easy to forget, no static typing, no schema, no client/server separation.
- **`pg` (node-postgres) instead of `postgres-js`.** Rejected — `postgres-js` is smaller, faster, has built-in support for Supabase pooler's quirks, and the Drizzle docs list it first.
- **Use Supabase CLI for migrations (not drizzle-kit).** Rejected — schema-as-TypeScript is the whole reason we picked Drizzle; running `supabase db diff` would force us to maintain two sources of truth.
- **Skip the env validation library, use Zod directly.** Rejected — t3-env handles the client-side build-time bundling concerns; rolling our own is busy-work.
- **Single Supabase client with role swapped per call.** Rejected — auth posture should be a property of the import, not a per-call argument; mixing them invites RLS-bypass mistakes.

## Follow-ups

- Phase 0.4 ships the actual tables → first real `db:generate` run.
- Phase 0.9 adds the proxy/middleware that calls `auth.getUser()` per request to refresh the session cookie (the `setAll` fallback in `lib/supabase/server.ts` depends on this happening).
- Phase 0.12 (deployment) → wire env vars in Vercel + Supabase secrets; verify build no longer needs `SKIP_ENV_VALIDATION`.
- Consider adding a `db:reset` helper later for local dev iteration.
