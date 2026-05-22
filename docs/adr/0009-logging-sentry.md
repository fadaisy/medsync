# ADR-0009: PII-redacted logging + Sentry wiring

- **Status:** Accepted
- **Date:** 2026-05-22
- **Phase:** 0.8
- **Deciders:** Usama Fadhul

## Context

Two things we need before any code starts touching real patients:

1. A single logging primitive used everywhere on the server, with PII redaction baked in so a careless `logger.info("user signed up", { user })` doesn't leak full name + email to Vercel runtime logs.
2. Sentry wired with the same PII scrubbing on the way out, so production exceptions don't ship PHI to a third party.

## Decisions

### 1. `lib/logger.ts` is the only sanctioned server log path

- `logger.debug / info / warn / error`. `debug` no-ops in production.
- Emits structured JSON to stdout/stderr (Vercel runtime logs ingest that natively).
- Every context object passes through `redactPII()` before serialization.
- `console.log` is banned by the lint rule (already in place from Phase 0.1); `console.warn` / `console.error` are allowed but discouraged. Direct `console.log` is permitted only inside the logger itself, with a disable comment.

### 2. Field-name redaction (over-eager by design)

`PII_FIELD_NAMES` is a `Set<string>` of lowercase field names. Any field whose key (case-insensitive) is in the set has its value replaced with `[REDACTED]`. Initial set (kickoff §2.6 + obvious extensions):

`name`, `first_name`, `firstname`, `last_name`, `lastname`, `full_name`, `fullname`, `email`, `email_address`, `phone`, `phone_number`, `phonenumber`, `mobile`, `nin`, `national_id`, `nationalid`, `date_of_birth`, `dateofbirth`, `dob`, `address`, `street`, `password`, `passwd`, `token`, `access_token`, `refresh_token`, `session`, `authorization`, `cookie`.

This will produce false positives (a non-PII `name` field gets redacted too). That's a tolerable cost. False negatives — PHI silently sent to logs or Sentry — are not. When a new sensitive field name lands in the schema (Phase 1+), it goes into this set immediately.

Walk semantics:

- Recurse into plain objects and arrays.
- `Error` objects collapse to `{ name, message, stack }` (preserves debuggability without dumping prototypes).
- Maps/Sets/Buffers pass through (not expected in log payloads; we don't want to mangle them).
- Circular references resolve to `"[CIRCULAR]"` (vs throwing).
- Input is never mutated.

### 3. Sentry — wired through Next 16 instrumentation, conditional on DSN

- [`instrumentation.ts`](../../instrumentation.ts) runs `Sentry.init()` in both Node and Edge runtimes when `SENTRY_DSN` is set. If absent, register() returns immediately — local dev without Sentry is a no-op.
- [`instrumentation-client.ts`](../../instrumentation-client.ts) initializes the browser SDK gated on `NEXT_PUBLIC_SENTRY_DSN`.
- `next.config.ts` wraps with `withSentryConfig()` only when `SENTRY_DSN` exists — keeps build clean for contributors without a Sentry account.
- `beforeSend` runs `redactPII()` over `event.extra`, `event.contexts`, `event.tags`, every breadcrumb's `data`; collapses `event.user` to `{ id }`; strips cookies; allowlists request headers (`host`, `user-agent`, `referer`, `x-forwarded-for` only).
- `sourcemaps.disable: process.env.NODE_ENV !== "production"` — only upload source maps for prod builds.
- `tunnelRoute: "/monitoring"` — routes Sentry events through `/monitoring` to bypass ad-blockers (no PHI risk; the tunnel is server-side).
- `tracesSampleRate: 0.1` in prod, `0` everywhere else. Phase 0 has nothing meaningful to trace yet; bump when first real flows ship.

### 4. Vercel Analytics

`@vercel/analytics/next` `<Analytics />` component sits in `app/layout.tsx`. Auto no-ops outside Vercel deployments; no DSN to set; no PHI risk (pageview-only).

### 5. Tests

[`tests/logger/logger.test.ts`](../../tests/logger/logger.test.ts) — 9 tests covering:

- Every required field name redacts at the top level.
- Nested objects (3 levels deep).
- Array elements.
- Case-insensitive matching (`FullName`, `Email`, `NIN`).
- Error objects → `{ name, message, stack }` (no prototype walk).
- Circular reference → `"[CIRCULAR]"`.
- Input is not mutated.
- Primitives pass through unchanged.
- `PII_FIELD_NAMES` includes the kickoff-mandated set.

Total suite: 67/67 across 9 files (~108s).

## Consequences

**Positive**

- Single sanctioned log path. Code review just has to look for `console.log` (banned by lint) to flag direct stdout writes.
- Over-eager redaction means the default outcome of "log everything I have" is safe. The cost is occasional `[REDACTED]` next to a non-PII field; cheap.
- Sentry config is contributor-friendly: no DSN, no Sentry, no problem. The same code ships to production.
- `Error` collapsing keeps stack traces actionable without dumping prototype chains.

**Negative / trade-offs**

- Field-name matching, not value pattern matching. A field literally named `notes` containing a NIN won't be caught. Mitigated by team discipline + the redaction set growing as new sensitive fields land.
- `event.message` and `exception.values[*].value` are NOT scrubbed by our `beforeSend` — Sentry's own UI-side data scrubbing rules layer on top. Engineers must not concatenate PII into Error messages.
- Client-side Sentry uses its own minimal scrubbing (lib/logger imports `server-only`, can't load in the browser bundle). Patterns are duplicated; comment in `instrumentation-client.ts` reminds whoever edits one to update the other.
- Test logs from the live suite go through this redactor too (we don't put PHI in test data, but the layer is there).

## Alternatives considered

- **Pino / Winston.** Rejected — overkill for Phase 0. The 60-line logger does everything we need and pins zero deps.
- **Field-value regex scrubbing (NIN format, phone format).** Rejected for now — adds complexity, false positive rate is harder to reason about, and field-name matching covers the common cases.
- **Sentry alone (no separate logger).** Rejected — Sentry is for _errors_; we also want structured logs of normal operations. Two layers.
- **Vercel Log Drains for structured ingest.** Deferred — for Phase 0 the Vercel-runtime JSON line view is enough. Add log drain in Phase 5+ when we have a SIEM destination.

## Follow-ups

- Phase 0.10 reference Edge Function reuses this redactor in its own log step.
- Phase 0.9 sign-up/sign-in flows are the first real consumers — first chance to validate that PHI never makes it into a log line.
- When a new sensitive field ships (Phase 1+), add the field name to `PII_FIELD_NAMES` in the same PR.
- Sentry data-scrubbing UI rules (org-level) should be configured as belt-and-braces — separate config in Sentry, not in this repo.
