# ADR-0001: Stack choice

- **Status:** Accepted
- **Date:** 2026-05-21
- **Phase:** 0.1
- **Deciders:** Usama Fadhul

## Context

MedSync is a digital hospital operating system for Uganda, built to run Mulago-scale national referral hospitals. Phase 0 ships a production-grade empty shell — deployed, secured, audited — before any clinical features begin in Phase 1. The stack is fixed by the project kickoff document. This ADR records the choices for posterity and names the trade-offs.

## Decision

| Layer              | Choice                                                      | Why                                                                               |
| ------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| App framework      | Next.js 16 (App Router, Turbopack, React 19.2)              | Server Components, Cache Components, mature ecosystem, native Vercel support      |
| Language           | TypeScript strict; `any` banned via ESLint                  | Hospital-grade safety — every value typed at the boundary                         |
| Backend            | Supabase (Postgres + Auth + Edge Functions)                 | RLS at the DB layer, integrated auth, free tier covers Phase 0                    |
| ORM                | Drizzle                                                     | Schema-as-code, typed queries, no decorator/runtime overhead, plays well with RLS |
| SSR auth           | `@supabase/ssr`                                             | Required Supabase pattern for cookie-based session handling in Next.js            |
| Styling            | Tailwind CSS v4 + shadcn/ui (Nova preset, `@base-ui/react`) | Composable design system we own end-to-end                                        |
| Forms / validation | React Hook Form + Zod 4                                     | Performant forms; Zod schemas double as DTOs at Edge Function boundaries          |
| Animation          | Framer Motion                                               | Mature, accessible motion primitives                                              |
| Monitoring         | Sentry + Vercel Analytics                                   | Industry-standard error tracking; first-class Vercel integration                  |
| SMS                | Africa's Talking                                            | Uganda-first, MNO-direct, supports premium shortcodes                             |
| Hosting / CI       | Vercel                                                      | Preview deploys per PR, edge network, native Next.js                              |
| Domain             | `medsync.health`                                            | Commits to the production identity from day one                                   |

## Consequences

**Positive**

- One vendor (Supabase) for DB + auth + functions reduces integration surface area in Phase 0.
- TypeScript strict + ban-`any` catches a class of bugs before runtime; cost is upfront ceremony, paid back in production correctness.
- Drizzle is reversible — typed migrations plus raw SQL escape hatch when RLS or trigger logic needs hand-tuning.

**Negative / trade-offs**

- **Single-vendor concentration on Supabase.** Mitigation: schema-as-code (Drizzle) keeps portability tractable; we can move off Postgres providers without rewriting application code.
- **Next.js 16 is recent (Nov 2025).** Breaking changes from older versions: caching is opt-in (Cache Components, `use cache`), middleware was renamed/repurposed (proxy) in 16.2, route `params`/`searchParams` are async. Mitigation: always check `node_modules/next/dist/docs/` before assuming an API exists.
- **Framer Motion has been renamed `motion`.** We pinned `framer-motion@^12` because the npm package still resolves to the same library. Re-evaluate at next major upgrade.
- **App-level PHI encryption (AES-256-GCM) is not queryable/indexable by content.** Operational fields stay plaintext; only the highest-sensitivity values are encrypted. Documented further in the encryption ADR (Phase 0.7).

## Alternatives considered

- **tRPC / GraphQL** — rejected for Phase 0. Supabase RLS plus typed Drizzle queries plus typed Edge Function responses (Zod) cover the contract without an extra runtime layer.
- **Prisma** — rejected in favor of Drizzle's lighter runtime and better RLS interop.
- **Clerk for auth** — rejected for Phase 0. Supabase Auth gives us TOTP + AAL2 + native JWT integration with RLS for free. Revisit if Supabase Auth limitations bite later.
- **pgsodium / Transparent Column Encryption** — rejected because Supabase no longer recommends it for new projects (pending deprecation). We use app-level AES-256-GCM as the highest-sensitivity layer on top of Supabase's at-rest encryption.
