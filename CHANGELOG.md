# Changelog

All notable changes to MedSync are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning will follow [SemVer](https://semver.org/spec/v2.0.0.html) once we tag.

## [Unreleased]

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
