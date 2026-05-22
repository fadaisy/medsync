# Changelog

All notable changes to MedSync are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning will follow [SemVer](https://semver.org/spec/v2.0.0.html) once we tag.

## [Unreleased]

### Added — Phase 0.12 (Vercel deployment) — 2026-05-22

- **MedSync is live: https://medsync-bice.vercel.app** (Vercel default URL; custom domain `medsync.health` deferred per session decision).
- New Vercel project `medsync` created and linked under `fadhulusama-gmailcoms-projects`.
- [`scripts/push-env-to-vercel.mjs`](scripts/push-env-to-vercel.mjs) — reads `.env.local` via `@next/env`, pushes each var to Vercel via `vercel env add KEY ENV --value V --force`. Idempotent. Used to push 5 required vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DATABASE_DIRECT_URL`) to Production + Development.
- Preview env vars deferred — Vercel CLI's `--yes` flag is currently ignored for `vercel env add KEY preview --value V`, which prompts for a git branch even with `--yes`. Workaround documented in ADR-0012: set preview vars via dashboard if/when we cut a preview branch.
- Vercel CLI installed as a dev dep (`vercel@54.3.0`) — sandbox blocked the global install.
- Build pipeline auto-detected (Next.js 16, `next build`, output dir default). Build took 53s. Emitted 8 routes (`/`, `/_not-found`, `/sign-up`, `/sign-in`, `/sign-in/mfa`, dynamic `/dashboard`, `/onboarding/mfa-setup`, `/sign-out`, `/api/health`) plus the proxy middleware.
- Smoke verified live: `/` → 200, `/styleguide` → 200, `/api/health` → 404 (correctly env-gated to non-production).
- ADR-0012 documents the deploy decisions, the preview-env CLI bug workaround, the GitHub-remote / CI / custom-domain / separate-prod-Supabase-project follow-ups.

### Added — Phase 0.11 (Phase 0 seed) — 2026-05-22

- [`supabase/migrations/0005_seed_phase_0.sql`](supabase/migrations/0005_seed_phase_0.sql) — idempotent SQL seed:
  - 1 hospital: **Mulago National Referral Hospital** (`mulago-national`, level `national_referral`, Kampala, Central region).
  - 1 top-level department: **Internal Medicine** (`internal-medicine`).
  - 13 IM sub-specialties under it: Cardiology, Nephrology, Endocrinology/Diabetology, Pulmonology, Gastroenterology, Hepatology, Neurology, Infectious Diseases, Oncology, Haematology, Rheumatology, Dermatology, Geriatrics.
- Fixed UUIDs (`00000000-0000-0000-0000-0000000000Nx`) so later phases can rely on them in FKs / fixtures.
- Every INSERT uses `ON CONFLICT DO NOTHING` on its natural key (slug for hospital; `(hospital_id, parent_id, slug)` for departments). The migration journal also gates re-application — belt-and-braces.
- Verified live via SQL: 1 hospital + 14 department rows.

### Added — Phase 0.10 (Edge Functions foundation) — 2026-05-22

- [`supabase/functions/_shared/`](supabase/functions/_shared/) — four helpers that make the mandatory nine-step pattern uniform:
  - `cors.ts` — `preflight()` + `corsHeaders()`; origin allowlist includes `medsync.health`, `localhost:3000`, `*.vercel.app`.
  - `auth.ts` — `getCaller(request)` validates Bearer JWT via `getUser()`; `hasRole(userId, role, hospitalId?)` queries via service-role (bypasses RLS); `serviceClient()` is the one path to service-role mutations from inside Edge Functions.
  - `logger.ts` — Deno-side PII-redacted JSON logger that mirrors `lib/logger.ts`.
  - `errors.ts` — typed `{ ok, error?, data? }` envelope: `ok`/`badRequest`/`unauthorized`/`forbidden`/`conflict`/`methodNotAllowed`/`serverError`. `X-Request-Id` echoed back for triage correlation.
- [`supabase/functions/assign-role/index.ts`](supabase/functions/assign-role/index.ts) — reference function implementing the full nine-step pattern: CORS preflight → POST gate → Zod input → authn → role authz (superadmin OR hospital_admin scoped) → service-role INSERT → log → audit (automatic via 0.6 trigger) → typed response. Duplicate grants return idempotent `{ already_held: true }` rather than 409.
- [`supabase/functions/deno.json`](supabase/functions/deno.json) — Deno strict config, fmt rules.
- [`supabase/functions/README.md`](supabase/functions/README.md) — local serve + deploy commands.
- `tsconfig.json` excludes `supabase/functions/` (Deno typechecks its own).
- ADR-0011 locks in the nine-step pattern, the two-runtime duplication trade-off, and the Supabase-CLI-based deployment path.

### Added — Phase 0.9 (auth + MFA + route protection) — 2026-05-22

- [`supabase/migrations/0004_auth_user_mirror.sql`](supabase/migrations/0004_auth_user_mirror.sql) — `AFTER INSERT ON auth.users` trigger (`SECURITY DEFINER`) auto-mirrors into `public.users` with `id`, `email`, `full_name` from metadata (or email as fallback). Atomic with the auth insert; survives Server Action signups, admin API creates, and test setup.
- [`lib/auth.ts`](lib/auth.ts) — single `getAuthState()` helper returns `{ user, roles, mfaRequired, aal, nextAal }`. `MFA_REQUIRED_ROLES = { clinician, nurse, pharmacist, lab_tech, hospital_admin, superadmin }`. Always uses `getUser()` (validated), never `getSession()`.
- [`lib/supabase/proxy.ts`](lib/supabase/proxy.ts) + [`proxy.ts`](proxy.ts) — Next 16 proxy. Three responsibilities per request: (1) refresh Supabase session cookie via `updateSession()`, (2) gate public vs protected routes, (3) enforce AAL2 for users with MFA enrolled / redirect clinical-role holders to `/onboarding/mfa-setup` if not enrolled. Matcher skips `_next`, `/monitoring`, favicon, image extensions.
- Auth pages (route group `(auth)`):
  - [`/sign-up`](<app/(auth)/sign-up/>) — email / full_name / password; Zod-validated server action; trigger does the public.users mirror.
  - [`/sign-in`](<app/(auth)/sign-in/>) — email / password; honours `?redirect=<path>`.
  - [`/sign-in/mfa`](<app/(auth)/sign-in/mfa/>) — 6-digit TOTP challenge; elevates session to AAL2.
  - [`/onboarding/mfa-setup`](<app/(auth)/onboarding/mfa-setup/>) — TOTP enrolment; QR code rendered server-side via `qrcode` package (secret never leaves the server response); sweeps stale unverified factors on every visit.
- [`/dashboard`](app/dashboard/) — placeholder protected page showing user roles + MFA status.
- [`/sign-out`](app/sign-out/) — POST-only route handler (avoids GET-link CSRF logout).
- [`<AuthCard>`](components/medsync/auth-card.tsx), `<FieldError>`, `<FormError>` — shared auth-form primitives.
- Forms use React 19 `useActionState` + Server Actions; work without JavaScript (progressive enhancement).
- Tests: [`tests/auth/auth-flow.test.ts`](tests/auth/auth-flow.test.ts) — 4 cases (mirror with metadata, mirror without metadata, duplicate-email rejection, fresh user AAL state). `tests/rls/users.test.ts` updated — the trigger now creates public.users rows for us, the test seeds `full_name` via UPDATE only. Total suite **71/71 across 10 files** (~70s).
- Dependency: `qrcode` + `@types/qrcode`.
- ADR-0010 documents the trigger choice, `getAuthState` single-seam pattern, Server Action + `useActionState` over react-hook-form, the proxy logic, and per-request DB-query cost (acceptable for Phase 0; move roles to JWT `app_metadata` in Phase 1 if needed).

### Added — Phase 0.8 (logging + Sentry) — 2026-05-22

- [`lib/logger.ts`](lib/logger.ts) — structured JSON logger with field-name PII redaction. `logger.debug/info/warn/error`; `debug` no-ops in prod. Every context object passes through `redactPII()` before serialization. Redacts the kickoff-mandated set + extensions: `name`, `first_name`, `last_name`, `full_name`, `email`, `phone`, `phone_number`, `nin`, `national_id`, `date_of_birth`, `dob`, `address`, `password`, plus auth tokens / cookies / authorization. Case-insensitive; recurses through nested objects + arrays; handles `Error` (collapses to `{name, message, stack}`); circular references → `"[CIRCULAR]"`.
- `@sentry/nextjs` + `@vercel/analytics` installed.
- [`instrumentation.ts`](instrumentation.ts) (Next.js 16 pattern) — Sentry init for Node + Edge runtimes. `beforeSend` runs `redactPII()` over `extra`/`contexts`/`tags`/breadcrumbs; collapses `event.user` to `{id}`; strips cookies; allowlists request headers. `tracesSampleRate: 0.1` in prod.
- [`instrumentation-client.ts`](instrumentation-client.ts) — browser SDK with minimal `beforeSend` (lib/logger is server-only so can't ride along; patterns kept in sync).
- [`next.config.ts`](next.config.ts) — wraps with `withSentryConfig()` only when `SENTRY_DSN` is set, so contributors without a Sentry account get clean builds. Source-map upload restricted to prod. `tunnelRoute: "/monitoring"` to bypass ad-blockers.
- [`app/layout.tsx`](app/layout.tsx) — `<Analytics />` from `@vercel/analytics/next` (no-ops outside Vercel; pageview-only).
- Tests: [`tests/logger/logger.test.ts`](tests/logger/logger.test.ts) — 9 cases covering every claim in the redaction contract. Total suite **67/67 across 9 files** (~108s).
- ADR-0009 documents the design, the over-eager-by-design field-name approach, Sentry's conditional wiring, and follow-ups.

### Added — Phase 0.7 (PHI encryption) — 2026-05-22

- [`lib/encryption.ts`](lib/encryption.ts) — AES-256-GCM PHI encryption library:
  - `encrypt(plaintext)` returns `iv:authTag:ciphertext` (3 base64 segments). Fresh random 12-byte IV per call.
  - `decrypt(payload)` validates segment count + IV/tag length, then runs `decipher.final()` which throws if GCM's 16-byte auth tag doesn't validate (= any tamper rejected).
  - `generateKey()` mints a 32-byte base64 key.
  - `ciphertextsEqual()` timing-safe byte compare.
  - Imports `"server-only"` so a client component using it fails Next's build.
  - Reads `MEDSYNC_PHI_KEY` env var per call; explicit, helpful errors when missing or wrong-length.
- 0 callers in 0.7 by design — encrypted columns land in Phase 1+ clinical tables. Shipping the lib + tests now forces us to nail the wire format and key handling before there's data to migrate.
- Trade-offs encoded into the API: random IV per call → same plaintext yields different ciphertext → content is NOT queryable/indexable. Operational columns stay plaintext; only highest-sensitivity stored values get encrypted. Documented in ADR-0008 + the lib header.
- Key rotation: documented procedure in ADR-0008 §6 (decrypt-old + re-encrypt-new pass). Not automated in 0.7 — `keyId` wire-format prefix deferred until rotation is actually needed.
- Tests: [`tests/encryption/encryption.test.ts`](tests/encryption/encryption.test.ts) — 16 tests covering round-trip (ASCII / empty / UTF-8), IV uniqueness, tamper detection per segment (IV, auth tag, ciphertext), wrong-key, malformed payloads, missing key, wrong-length key, `generateKey()`. Vitest alias added (`server-only` → no-op stub) so the library imports in test context.
- Total suite: **58/58 across 8 files** (~70s).
- ADR-0008 documents algorithm/format choice, key handling, rotation procedure, the queryability trade-off, and alternatives considered (pgsodium / CBC+HMAC / XChaCha20 / AES-SIV / envelope).

### Added — Phase 0.6 (audit infrastructure) — 2026-05-22

- [`supabase/migrations/0003_audit.sql`](supabase/migrations/0003_audit.sql) — two trigger functions:
  - `public.audit_log_changes()` — `AFTER INSERT/UPDATE/DELETE` on `users`, `hospitals`, `hospital_departments`, `user_roles`, `consent_records`. `SECURITY DEFINER` so it can INSERT regardless of caller role. Captures `auth.uid()` as `actor_id`, full `to_jsonb(OLD/NEW)` as `before_data`/`after_data`, lowercased `TG_OP` as `action`, optional `app.request_id` GUC as `request_id`.
  - `public.audit_log_block_modify()` — `BEFORE UPDATE OR DELETE` on `audit_log`; always raises with SQLSTATE `insufficient_privilege`. Defence in depth via `REVOKE UPDATE, DELETE` on `audit_log` from `anon`/`authenticated`/`PUBLIC`. Service-role is intentionally NOT REVOKEd (it has `bypassrls`) but the trigger still raises for it — service-role is held to the same append-only standard as everyone else.
- `audit_log` is intentionally NOT audited (would recurse).
- Tests: [`tests/audit/audit.test.ts`](tests/audit/audit.test.ts) — 6 tests covering INSERT/UPDATE/DELETE trigger fires, before/after capture, and that UPDATE/DELETE on `audit_log` raises with the expected message. Total suite now 42/42 (~63s).
- Test cleanup paths updated: `audit_log` rows are now intentionally leaked from test suites because the append-only trigger blocks DELETE. Documented inline; manual purge via `TRUNCATE` available to the table owner.
- ADR-0007 documents the trigger design, the two-layer append-only lockdown, the table coverage, and follow-ups (Phase 0.9 request-id GUC, retention policy).

### Added — Phase 0.5 (RLS + tests) — 2026-05-22

- [`supabase/migrations/0002_rls.sql`](supabase/migrations/0002_rls.sql) — RLS policies for all 6 Phase 0 tables. `ENABLE` + `FORCE ROW LEVEL SECURITY` (defence in depth so even the table owner is subject), explicit `GRANT` of table privileges to `anon` / `authenticated`, deny-by-default with permissive policies per `(command, role)` combination.
- `public.user_has_role(role_name [, hospital_id])` — `SECURITY DEFINER STABLE` helper with hardened search_path. Lives in `public.*` (the pooler user lacks `CREATE` on `auth.*`).
- vitest + `@vitest/coverage-v8` installed; configured in [`vitest.config.ts`](vitest.config.ts) with `fileParallelism: false` for Supabase admin rate limits, env injected into workers via `test.env`.
- **`@next/env` + `NODE_ENV=test` workaround**: vitest sets `NODE_ENV=test`, and `@next/env`'s loader deliberately skips `.env.local` in test mode (silently — `loadedEnvFiles: []`). Config now overrides `NODE_ENV='development'` around the `loadEnvConfig()` call, then restores. Documented inline + ADR.
- Test helpers in [`tests/rls/_helpers.ts`](tests/rls/_helpers.ts): `createTestUser`, `serviceSupabase`, `serviceSql`, `grantRole`, `createTestHospital`, `cleanup`. Test-user emails follow `rls-<suite>-<role>-<rand>@medsync.local` for easy manual cleanup if a run crashes.
- RLS test suite: 36 tests across 6 files, one per table — positive + negative cases per `(role × command × scope)`. **All pass against live Supabase**, ~50s runtime (dominated by `auth.admin.createUser` round-trips on free tier).
- npm scripts: `test`, `test:watch`.
- ADR-0006 documents the policy model, helper function, vitest choice, the env-loading workaround, and the per-table coverage map.

### Added — Phase 0.4 (Phase 0 schema) — 2026-05-22

- Schema proposal: [`docs/schema-phase-0.md`](docs/schema-phase-0.md) — six Phase 0 tables with column types, FKs, indexes, RLS intent, what's encrypted, what's audited. Drizzle implementation matches the proposal verbatim.
- Drizzle schema files in [`db/schema/`](db/schema/):
  - [`_auth.ts`](db/schema/_auth.ts) — phantom `auth.users` for FK type-resolution (Supabase manages the real one).
  - [`users.ts`](db/schema/users.ts) — 1:1 with `auth.users` via shared uuid PK; PHI deferred to Phase 1+.
  - [`hospitals.ts`](db/schema/hospitals.ts) — Uganda MoH facility taxonomy via CHECK constraint on `level`.
  - [`hospital-departments.ts`](db/schema/hospital-departments.ts) — self-referential `parent_id` for IM → 13 sub-specialty trees.
  - [`user-roles.ts`](db/schema/user-roles.ts) — m:n with `role` + `hospital_id`; CHECK enforces superadmin-is-global, every other role hospital-scoped.
  - [`consent-records.ts`](db/schema/consent-records.ts) — versioned, immutable consent log with `consent_text_sha256` for non-repudiation.
  - [`audit-log.ts`](db/schema/audit-log.ts) — append-only system log; populated by trigger only (0.6).
- Generated SQL migration: [`supabase/migrations/0000_nosy_thunderbird.sql`](supabase/migrations/0000_nosy_thunderbird.sql). Header documents that the auto-generated `CREATE SCHEMA "auth"` / `CREATE TABLE "auth"."users"` block must be hand-stripped on every regeneration (Drizzle's `schemaFilter` only filters introspection, not generation).
- Hand-written migration: [`supabase/migrations/0001_updated_at_trigger.sql`](supabase/migrations/0001_updated_at_trigger.sql) — shared `public.set_updated_at()` function attached to every mutable table.
- Custom migrator: [`scripts/migrate.ts`](scripts/migrate.ts) — replaces `drizzle-kit migrate` (which needs prepared-statement support → IPv6-only direct hostname on free tier, unreachable from most networks). Runs each `.sql` file via the transaction pooler with `prepare: false`, wraps each in a transaction, tracks applied state in `public._medsync_migrations`. Drizzle's official migrator preserved as `npm run db:migrate:drizzle` for Pro / IPv6 setups.
- Live state verified: all 6 tables present in `public` (plus the `_medsync_migrations` journal).
- ADR-0005 captures the schema decisions, the auth-phantom workaround, and the pooler-migrator trade-off.

### Added — Phase 0.3 (Supabase + Drizzle + clients) — 2026-05-21

- [`lib/env.ts`](lib/env.ts) — `@t3-oss/env-nextjs` + Zod validation, split into `server` (service role key, DB URLs, `MEDSYNC_PHI_KEY`, Sentry, Africa's Talking) and `client` (`NEXT_PUBLIC_*` Supabase + Sentry) schemas. Fail-fast on missing/invalid required vars; `SKIP_ENV_VALIDATION=1` escape hatch for local scaffolding (never set on Vercel).
- Three Supabase clients, one per auth posture:
  - [`lib/supabase/client.ts`](lib/supabase/client.ts) — browser anon (`createBrowserClient`).
  - [`lib/supabase/server.ts`](lib/supabase/server.ts) — SSR with cookie threading via `next/headers` (`await cookies()` for Next 16 async API). Always use `getUser()`, never `getSession()`.
  - [`lib/supabase/service.ts`](lib/supabase/service.ts) — service role; `"server-only"` import guards prevent it from ever reaching the client bundle.
- [`drizzle.config.ts`](drizzle.config.ts) — Drizzle Kit configured against `DATABASE_DIRECT_URL` (port 5432) with `schemaFilter: ["public"]` so Supabase's `auth`/`storage`/`realtime` schemas are off-limits. Migrations land in [`supabase/migrations/`](supabase/migrations/).
- [`db/index.ts`](db/index.ts) — `postgres-js` client + Drizzle instance. Uses pooled `DATABASE_URL` (port 6543) with `prepare: false` (required for Supabase's transaction-mode pooler). Singleton on `globalThis` in dev to survive HMR without leaking connections.
- [`db/schema/index.ts`](db/schema/index.ts) — barrel export, empty for 0.3 (tables land in 0.4).
- npm scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:check`.
- [`app/api/health/route.ts`](app/api/health/route.ts) — dev-only smoke endpoint: runs `SELECT now()` via Drizzle, calls `getUser()` via the server client, calls `auth.admin.listUsers` via the service client. Gated to non-production. The Phase 0.3 acceptance check.
- ADR-0004 documents the data-layer choices.

### Added — Phase 0.2-dark (dark mode) — 2026-05-21

- Dark mode shipped (supersedes the "no dark mode" decision recorded in ADR-0002; full rationale in ADR-0003).
- [`next-themes`](https://github.com/pacocoursey/next-themes) wired via [`app/providers.tsx`](app/providers.tsx) with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, storage key `medsync-theme`.
- [`<html suppressHydrationWarning>`](app/layout.tsx) + `color-scheme` CSS hint for native form controls; `<meta name="theme-color">` per `prefers-color-scheme` for matching mobile browser chrome.
- [`app/globals.css`](app/globals.css) restructured: every semantic token, clinical-status pair, and shadow lives as a plain CSS variable in `:root` (light) and `.dark` (dark) blocks; `@theme inline` references those vars so utilities like `bg-primary`, `text-status-critical-fg`, `shadow-card` resolve to the right colour per theme at runtime. Scale tokens (`gray-*`, `teal-*`) also flip — components that say `bg-gray-50` automatically render the dark spec's `#111111` in dark.
- [`ThemeToggle`](components/theme-toggle.tsx) — Sun/Moon crossfade switch; added to `/` and `/styleguide` headers.
- Primitives refactored to use semantic tokens (`bg-primary`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`) instead of direct gray-N/teal-N references so they flip cleanly. `dark:` variants reserved for the few asymmetric cases (Button `emergency` shifts to a soft-red outline; Button `secondary` upgrades its border in dark).
- `/styleguide` updated: ThemeToggle in header, palette swatches use static inline `style={{backgroundColor: hex}}` so reference display stays accurate in either mode; added separate sections for dark neutral scale + dark teal scale (now 13 sections total).
- DESIGN-medsync.md gained a full "## Dark Mode" section (verbatim from the dark-mode handoff) covering surface mapping, dark neutral/teal/status palettes, dark-specific shadows, button/input/card overrides, and dark anti-patterns.
- ADR-0003 (dark mode adoption); ADR-0002 status updated to "Accepted (no-dark-mode part superseded by ADR-0003)"; ADR README index updated.

### Added — Phase 0.2 (design system) — 2026-05-21

- [`DESIGN-medsync.md`](DESIGN-medsync.md) authored as the authoritative visual contract — monochrome neutral base with teal-600 (`#0D9488`) as clinical accent, six clinical-status pairs, 12-step type scale, restrained shadow/radii scales.
- [`app/globals.css`](app/globals.css) rebuilt as a Tailwind v4 `@theme` block: full neutrals (`gray-50`–`gray-950`), teal scale, clinical status pairs (`bg-status-*-bg`/`text-status-*-fg`), semantic shadcn mappings, type scale utilities (`text-display-xl`…`text-overline`), radii (`xs`–`3xl`), shadows (`xs`,`sm`,`md`,`lg`,`card`,`popover`,`focus`), easing (`ease-expo-out`), durations.
- shadcn primitives added: `card`, `input`, `label`, `badge`, `separator`, `dialog`, `dropdown-menu` (Form deferred to Phase 0.9 sign-up/sign-in flows).
- Button rewritten with MedSync-spec variants: `primary`, `secondary`, `ghost`, `tealSoft`, `emergency`, `alert`, `link` × sizes `sm`/`md`/`lg`/`iconSm`/`icon`/`iconLg`; expo-out 150ms transition; teal focus ring.
- Input rewritten to spec (13px font, `rounded-sm`, teal-tinted focus, alert-bg on `aria-invalid`).
- Card rewritten with three tones: `standard`, `muted`, `tealTinted`; replaced `ring-1` with `border` for consistency with the design language.
- Custom MedSync components:
  - [`ClinicalBadge`](components/medsync/clinical-badge.tsx) — six clinical statuses with strict bg/fg pairings.
  - [`VitalStat`](components/medsync/vital-stat.tsx) — monospace, tabular-nums vital display with normal/critical/success tones.
  - [`SectionNumber`](components/medsync/section-number.tsx) — `[NN]` bracket pattern.
  - [`ClinicalPath`](components/medsync/clinical-path.tsx) — monospace breadcrumb (`/ patient → vitals`).
- [`app/page.tsx`](app/page.tsx) replaced the create-next-app landing with a minimal MedSync splash (wordmark, hero, link to `/styleguide`, founder/CSO attribution).
- [`app/styleguide/page.tsx`](app/styleguide/page.tsx) — 12-section visual contract: neutrals, teal scale, clinical status, typography, buttons (every variant × size), inputs (default/focused/disabled/error), cards (3 tones), vital-stat strip with critical patient example, section numbers, clinical paths, spacing scale, radii reference, shadow reference.
- [`app/layout.tsx`](app/layout.tsx) — MedSync metadata (title template, applicationName, theme color), viewport config, font fallback chain applied at `<body>`.
- ADR-0002 (design system adoption + font-license deferral).

### Changed

- `globals.css` semantic tokens (`--color-primary`, `--color-foreground`, …) now resolve to MedSync palette; all shadcn primitives inherit the theme automatically.
- shadcn `Dialog` close/cancel button references migrated from the removed `outline`/`icon-sm` variants to `secondary`/`iconSm`.

### Notes / deferred

- **Fonts:** Neue Haas Grotesk Display/Text Pro are commercial. The CSS fallback chain (`"Helvetica Neue", Helvetica, Arial, sans-serif`) renders the correct character on macOS/iOS today; `next/font/local` swap-in pending license files.
- **Dark mode:** intentionally not shipped — see ADR-0002.
- **Form primitive:** picked up in Phase 0.9 where sign-up/sign-in flows make it concrete.

### Added — Phase 0.1 (scaffold + tooling) — 2026-05-21

- Next.js 16.2 App Router scaffold (Turbopack, React 19.2, TypeScript strict).
- TypeScript: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `useUnknownInCatchVariables`; `target: ES2022`.
- ESLint 9 flat config extending `eslint-config-next` with `@typescript-eslint/no-explicit-any: error`, typed-import enforcement, and unused-var rule.
- Prettier 3 with `@ianvs/prettier-plugin-sort-imports` and `prettier-plugin-tailwindcss`.
- Tailwind CSS v4 via `@tailwindcss/postcss`.
- shadcn/ui initialized (Nova preset, `@base-ui/react` primitives). Theme tokens deferred to Phase 0.2.
- Husky 9 + lint-staged pre-commit (`eslint --fix`, `prettier --write`).
- commitlint with Conventional Commits — types allowed: `feat`, `fix`, `chore`, `docs`, `security`, `style`, `refactor`, `test`, `perf`, `build`, `ci`, `revert`.
- npm scripts: `dev`, `build`, `start`, `lint`, `lint:fix`, `typecheck`, `format`, `format:check`.
- Runtime deps installed (wired but not exercised this sub-phase): `@supabase/ssr`, `@supabase/supabase-js`, `drizzle-orm`, `postgres`, `framer-motion`, `react-hook-form`, `@hookform/resolvers`, `zod 4`.
- Folder structure: `app/`, `components/`, `lib/`, `db/`, `supabase/{migrations,functions/_shared}/`, `docs/adr/`, `prompts/`, `tests/rls/`.
- ADR-0001 (stack choice).
