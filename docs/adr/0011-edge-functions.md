# ADR-0011: Edge Functions foundation + `assign-role` reference

- **Status:** Accepted
- **Date:** 2026-05-22
- **Phase:** 0.10
- **Deciders:** Usama Fadhul

## Context

Supabase Edge Functions are the right tier for any sensitive mutation that needs to run server-side outside of Next's request lifecycle (cron jobs, webhook receivers, third-party integrations, admin operations that need service-role privilege). The kickoff mandates a **fixed nine-step pattern** for every such function — locked in here so a future contributor under deadline pressure can't half-do it.

## Decisions

### 1. The mandatory pattern (every Edge Function follows this)

Order matters; skipping a step blocks review.

| #   | Step                                      | Helper                                                                          |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | CORS preflight                            | `preflight(request)` from `_shared/cors.ts`                                     |
| 2   | Method gate (POST only unless documented) | `methodNotAllowed(init)`                                                        |
| 3   | Zod input validation                      | `InputSchema.safeParse(body)`                                                   |
| 4   | Authentication (Bearer JWT)               | `getCaller(request)` from `_shared/auth.ts`                                     |
| 5   | Role authorisation                        | `hasRole(userId, role, hospitalId?)`                                            |
| 6   | Action (the actual mutation)              | `serviceClient().from('...').insert/update/delete`                              |
| 7   | PII-redacted structured log               | `makeLogger('fn-name')` from `_shared/logger.ts`                                |
| 8   | Audit log entry                           | Automatic via the Phase 0.6 trigger if mutating an audited table                |
| 9   | Typed response envelope                   | `ok` / `badRequest` / `unauthorized` / `forbidden` / `conflict` / `serverError` |

The reference implementation is [`supabase/functions/assign-role/index.ts`](../../supabase/functions/assign-role/index.ts) — copy the structure for new functions.

### 2. Shared helpers in `_shared/`

- **`cors.ts`** — `preflight()` short-circuits OPTIONS; `corsHeaders(origin)` allowlists `medsync.health`, `localhost:3000`, and any `*.vercel.app` (preview deploys).
- **`auth.ts`** — `getCaller(request)` validates Bearer JWT via `getUser()` (never `getSession()`); `hasRole()` queries via service-role (bypasses RLS) so callers see all roles, not just their own; `serviceClient()` is the one-and-only path to service-role-privileged operations from inside an Edge Function.
- **`logger.ts`** — PII-redacted JSON log; field-name redaction list mirrors `lib/logger.ts` on the Next side. **Keep them in sync** when a new sensitive field lands.
- **`errors.ts`** — typed `{ ok, error?, data? }` envelope generators. Status codes baked in (`ok`=200, `badRequest`=400, `unauthorized`=401, `forbidden`=403, `conflict`=409, `methodNotAllowed`=405, `serverError`=500). `X-Request-Id` echoes back so callers can correlate logs.

### 3. Why duplicate `_shared/logger.ts` from `lib/logger.ts`

Edge Functions run on Deno, not Node. Module resolution is incompatible (`@/` aliases, `node:` imports, the Next bundler's tree-shaking). Pulling in the Next-side `lib/logger.ts` would either fail to resolve or 10× the function bundle. The 80-line duplicate is the cost of running on two runtimes. The redaction `PII_FIELD_NAMES` set is small and shared mentally via the README + this ADR.

### 4. `assign-role` reference function (Phase 0.10's deliverable)

**Body shape:** `{ target_user_id: uuid, role: enum, hospital_id?: uuid }`

**Authorisation matrix:**
| Caller role | Target role | hospital_id requirement | Allowed? |
| --- | --- | --- | --- |
| superadmin | any | required for non-superadmin; null for superadmin | ✓ |
| hospital_admin | any non-superadmin | must equal the caller's hospital_admin scope | ✓ |
| hospital_admin | superadmin | — | ✗ |
| any other | any | — | ✗ |

**Audit:** the `INSERT INTO user_roles` fires the `public.audit_log_changes()` trigger from Phase 0.6 automatically; the function itself doesn't write to `audit_log`. This is the whole reason the audit infrastructure exists — function code can't forget to audit.

**Duplicate-grant handling:** the `user_roles_unique` index on `(user_id, role, hospital_id)` (Phase 0.4) makes a repeat call return Postgres SQLSTATE `23505`. We catch it and return `{ ok: true, data: { already_held: true } }` rather than a 409 — granting an already-held role is idempotent from the caller's perspective.

### 5. Deployment

Edge Functions deploy via the Supabase CLI (`brew install supabase/tap/supabase`):

```bash
supabase link --project-ref <ref>
supabase functions deploy assign-role
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase at deploy time — we don't need to configure them. Other secrets (MEDSYNC_PHI_KEY, SENTRY_DSN if used inside a function) go through `supabase secrets set`.

Phase 0.10 only writes the code; actual deploy is part of Phase 0.12's deployment work.

### 6. tsconfig and lint scoping

- `tsconfig.json` excludes `supabase/functions/` — Next's TS compiler shouldn't try to typecheck Deno code. Deno has its own typechecker invoked via `deno check`.
- ESLint runs over the directory (no separate ignore). Our rules are mostly Deno-friendly; the one `no-console` exception in `_shared/logger.ts` matches the Node-side pattern.

## Consequences

**Positive**

- The nine-step pattern is enforced by helper API design: skipping `getCaller()` means no `caller` variable to pass to `hasRole()`; skipping the typed response means manually writing JSON+headers (visible in review). It's annoying to write a bad function by accident.
- Audit is automatic — function code doesn't need to remember it.
- The duplicate-grant idempotent path means callers don't need to pre-check.
- `X-Request-Id` correlation makes server-log + audit-log + function-log triage possible.

**Negative / trade-offs**

- Two runtimes (Node + Deno) → two PII redaction lists to keep in sync. Documented; next sensitive field added to both in the same PR or it stays out of both.
- We can't unit-test Edge Functions with vitest without a Deno harness. Integration tests would call the deployed function via HTTP from the existing test suite. Deferred to Phase 1+ when there's a non-reference function with real test value.
- `hasRole()` runs a service-role query — one round-trip per role check. The reference function makes two (`superadmin` check + conditional `hospital_admin`); acceptable for an infrequent admin op, would need batching for high-frequency calls.
- Edge Function bundles can't import Next-side code, so any new sensitive primitive (encryption, etc.) needs a Deno-compatible counterpart. Mitigated by the small set of cross-cutting concerns: logging, errors, auth, CORS.

## Alternatives considered

- **Server Actions instead of Edge Functions.** Rejected for mutations that need service-role privilege from outside the user's session lifecycle (cron, webhook). Server Actions are fine for "this user does X to their own data"; Edge Functions are the right tier for "admin grants role to other user" — clearer mental model + the function URL is callable from any client (Studio, curl, future mobile app).
- **Vercel Functions / Routes for the same job.** Rejected — Edge Functions run inside Supabase's perimeter, share the auth ecosystem, can use the service-role key without exposing it to the Next runtime. Cleaner blast radius.
- **Drop CORS entirely (server-to-server only).** Rejected — Supabase Studio uses the same endpoints for inspection, and curl + `Origin: null` won't help in dev.
- **Use Hono / Fresh / Oak for routing in Edge Functions.** Rejected — `Deno.serve` + one route per function is the Supabase-native pattern; introducing a framework for single-route functions is over-engineering.

## Follow-ups

- Phase 0.12: deploy `assign-role` to the live Supabase project via `supabase functions deploy assign-role`.
- Phase 1+: integration test that calls the deployed function over HTTPS and asserts the audit row + user_roles row both exist.
- Phase 1+: second reference function for a write that doesn't audit (e.g. queue a notification) so we exercise the "no automatic audit row" code path.
- Phase 5+: when SMS lands, an Edge Function will be the right home for the Africa's Talking webhook receiver.
