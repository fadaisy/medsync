# ADR 0223 — One pure landing resolver; `?redirect=` only for paths the user may open

**Status:** Accepted — 2026-10-10, Lab Phase 0 GATE A, E-LAB0-03, D-LAB0-05.

## Context

Sign-in's landing was inline branching over database calls, shared by the password and authenticator steps. A
`lab_tech` role without a lab affiliation landed on `/lab` and bounced to `/`; any same-origin `?redirect=` won.

## Decision

1. `lib/auth/landing.ts` `resolveLanding(facts, next)` decides; `app/(auth)/sign-in/landing.ts` gathers five facts in
   parallel and calls it. A 37-row table test pins every landing.
2. Every landing keeps its result except one: a `lab_tech` role without an active lab affiliation lands on
   `/clinician`.
3. `next` wins only when it is a same-origin path and, for `/admin`, `/hospital-admin`, `/doctor` and `/lab`, the facts
   say the user may open it. A refused `next` is logged with its first path segment only.
4. Several staff workspaces keep today's precedence (doctor, lab, clinician); no stored "last used" workspace yet
   (the resolver's input can carry it later).

## Consequences

Landing is testable without a database. Other workspaces' gates still run on their own pages.
