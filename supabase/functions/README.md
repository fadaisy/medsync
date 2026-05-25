# MedSync Edge Functions

Supabase Edge Functions run on Deno, not Node. Imports use `npm:` specifiers (e.g. `npm:zod@4.4.3`, `npm:@supabase/supabase-js@2.106.1`) which the Edge runtime caches reliably. Avoid `https://esm.sh/...` URL imports — they re-fetch on cold start and cause intermittent `BOOT_ERROR` when the CDN hiccups. These functions cannot see the Next-side `@/lib/...` modules; share code via `_shared/`.

## Structure

```
supabase/functions/
├── _shared/         # cross-function helpers (cors, auth, logger, errors)
│   ├── auth.ts      # getCaller, hasRole, serviceClient
│   ├── cors.ts      # preflight + corsHeaders
│   ├── errors.ts    # ok/badRequest/unauthorized/forbidden/conflict/serverError
│   └── logger.ts    # PII-redacted JSON log (mirrors lib/logger.ts)
├── assign-role/     # reference function (Phase 0.10)
│   └── index.ts
└── deno.json
```

## The mandatory pattern

Every Edge Function follows the same arc (see ADR-0011):

1. CORS preflight (`preflight(request)`)
2. Method gate (POST only unless documented otherwise)
3. Zod input validation
4. Authentication (`getCaller(request)`)
5. Role authorisation (`hasRole(...)`)
6. Action
7. PII-redacted structured log
8. Audit-log entry (automatic via the Phase 0.6 trigger if the action mutates an audited table)
9. Typed response envelope (`ok` / `badRequest` / `forbidden` / etc.)

Skipping a step in code review = blocking the PR.

## Local development

```bash
# Install Supabase CLI (Homebrew):
brew install supabase/tap/supabase

# Run a function locally against your dev project:
supabase functions serve assign-role --env-file .env.local

# Deploy:
supabase link --project-ref <ref>
supabase functions deploy assign-role
supabase secrets set MEDSYNC_PHI_KEY=... SENTRY_DSN=...   # one-time
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase at deploy time (no need to set them).

## Calling from the Next side

```ts
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
const { data, error } = await supabase.functions.invoke("assign-role", {
  body: { target_user_id, role, hospital_id },
});
```

`supabase.functions.invoke` automatically attaches the caller's `Authorization: Bearer <jwt>` header. The function's `getCaller()` validates it.

## Why we don't share modules with the Next app

- Deno's module resolution is incompatible with Next's bundler (`@/` aliases, `node:` imports vs Deno globals).
- Edge Functions ship as standalone Deno bundles; pulling in Next-side code would 10× the bundle and break.
- The duplication is small: `_shared/logger.ts` mirrors `lib/logger.ts`'s PII redaction. Keep them in sync when new sensitive fields land.
