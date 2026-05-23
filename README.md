# MedSync

> Digital hospital operating system for Uganda. Built for hospitals up to national-referral scale.

**Status:** Phase 1 onboarding — `/signup/{patient,clinical,hospital}` are end-to-end (account → email OTP → lifecycle transition → MS-ID for patients, pending-review for staff + hospitals). The superadmin and hospital-admin review queues live at [`/admin`](app/admin/). Phase 0 (foundation rebuild) shipped the public landing page at `/` (17-section Attio-archetype, see [`components/landing/`](components/landing/)), the audience-funnel express-interest routes at `/onboarding/{patient,clinical,hospital}`, and the authentication scaffold with mandatory MFA for clinical roles. No actual clinical features yet — Phase 2 begins after Phase 1 sign-off.

**Designated Clinical Safety Officer:** Usama Fadhul (founder).

---

## Stack

- **Next.js 16** (App Router, Turbopack, React 19.2)
- **TypeScript strict** — `any` banned via ESLint
- **Supabase** (Postgres, Auth, Edge Functions) + **Drizzle ORM**
- **Tailwind CSS v4** + **shadcn/ui** (Nova preset, `@base-ui/react` primitives)
- **Fraunces** (display) + **Geist Sans** (body) + **Geist Mono** (tabular labs/vitals) via `next/font/google`
- **React Hook Form** + **Zod 4** for forms and runtime validation
- **Framer Motion** for animation (landing uses CSS-only motion + `IntersectionObserver`; reserved for app-shell animation in Phase 1+)
- **Sentry + Vercel Analytics** for monitoring (wired in Phase 0.8)
- **Africa's Talking** for SMS (wired in Phase 0, exercised Phase 5+)
- **Vercel** hosting + CI/CD; production domain `medsync.health` (live in Phase 0.12)

See [`docs/adr/0001-stack-choice.md`](docs/adr/0001-stack-choice.md) for rationale and trade-offs.

## Onboarding (Phase 1)

Four audiences enter through `/get-started`. Each path enforces a different verification gradient.

| Path               | Approval gate              | Lifecycle ladder                                               | MFA       |
| ------------------ | -------------------------- | -------------------------------------------------------------- | --------- |
| `/signup/patient`  | Email OTP                  | `unverified → verified → active` (MS-YYYY-NNNNN issued)        | Optional  |
| `/signup/clinical` | Email OTP + hospital admin | `unverified → verified → pending_approval → approved → active` | Mandatory |
| `/signup/hospital` | Email OTP + superadmin     | `unverified → verified → pending_approval → approved → active` | Mandatory |
| Superadmin         | seeded by migration        | n/a                                                            | Mandatory |

The lifecycle state machine lives in [`db/schema/lifecycle.ts`](db/schema/lifecycle.ts); the valid transitions are enforced by [`lib/lifecycle.ts`](lib/lifecycle.ts) which is the only sanctioned mutator for state columns. The end-to-end shape (PHI handling, draft cookies, approval flow, form primitives) is recorded in [`docs/adr/0013-onboarding-architecture.md`](docs/adr/0013-onboarding-architecture.md).

Reviewers approve from [`/admin`](app/admin/):

- `/admin/applications` — superadmin queue of hospital applications
- `/admin/affiliations` — staff affiliations (superadmin sees all; hospital_admin sees their hospital's queue)

Reference catalogs (councils, cadres, specialties, roles, geography) are seeded via migrations `0010` and `0011`. Status of every catalog + outstanding upstream pulls in [`docs/reference-data-sources.md`](docs/reference-data-sources.md).

The seven shared form primitives that power every signup path live in [`components/form/`](components/form/) and are interactive on `/styleguide §14`.

## Local development

```bash
npm install
cp .env.example .env.local      # fill in your local values
npm run dev                     # http://localhost:3000
```

### Scripts

| Script                 | Purpose                        |
| ---------------------- | ------------------------------ |
| `npm run dev`          | Next.js dev server (Turbopack) |
| `npm run build`        | Production build               |
| `npm run start`        | Production server              |
| `npm run lint`         | ESLint                         |
| `npm run lint:fix`     | ESLint with `--fix`            |
| `npm run typecheck`    | `tsc --noEmit`                 |
| `npm run format`       | Prettier write                 |
| `npm run format:check` | Prettier check                 |

Pre-commit hook (Husky) runs `lint-staged` (eslint + prettier on changed files). `commit-msg` hook enforces Conventional Commits via commitlint.

## Project structure

```
app/                    Next.js App Router (routes, layouts, route handlers)
components/             Shared UI; shadcn primitives in components/ui/
lib/                    App utilities, Supabase clients, encryption, logger
db/                     Drizzle schema + typed queries
supabase/
  migrations/           Postgres migrations (Drizzle-generated)
  functions/            Edge Functions
    _shared/            cors, auth, logger, errors helpers
docs/
  adr/                  Architecture Decision Records
prompts/                Prompt templates (AI-assisted features, future)
tests/
  rls/                  RLS policy test suite (Phase 0.5)
```

## Security posture (all in from Phase 0 — non-negotiable)

- **RLS on every table**, deny-by-default. App-level enforcement is a second layer, never the only one.
- **App-level PHI encryption** (`lib/encryption.ts`, AES-256-GCM) for highest-sensitivity fields.
- **Append-only `audit_log`** — DB triggers + revoked privileges, tamper-evident.
- **MFA mandatory** for clinical/admin roles (TOTP, AAL2 enforced).
- **Edge Functions for sensitive writes** — Zod input → authn → role authz → action → PII-redacted log → audit entry → typed response.
- **PII-redacted structured logging** + Sentry `beforeSend` scrubbing.

Target: HIPAA-equivalent technical controls + Uganda Data Protection and Privacy Act 2019 compliance. Not pursuing formal HIPAA certification.

## Contributing

Conventional commits are required (enforced by commitlint on `commit-msg`):

- `feat:`, `fix:`, `chore:`, `docs:`, `security:`, `style:`, `refactor:`, `test:`, `perf:`, `build:`, `ci:`, `revert:`

## Documentation

- Decisions: [`docs/adr/`](docs/adr/)
- Sub-phase progress: [`CHANGELOG.md`](CHANGELOG.md)
