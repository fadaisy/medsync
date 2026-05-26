# Hospital-Admin Workspace — Integration Contract

> This document is the contract every feature prompt for the
> `/hospital-admin/*` workspace inherits. Read it before writing a
> feature; do not deviate without an ADR.

The shell at `/hospital-admin` is intentionally feature-empty. Its job
is to be the **stable frame** every feature plugs into. This file is
the surface area features may touch, and the rules they must follow.

---

## 1. The single security boundary

The hospital admin operates on **exactly one hospital — their own**. The
shell resolves "the current admin's hospital" once and exposes it to
every feature. Features never re-derive that scope from a URL parameter,
a form field, or a client-side value. The cost of getting this wrong is
cross-tenant data leakage.

Three layers enforce it:

1. **Database (RLS)** — every table that carries `hospital_id` has an
   RLS policy gated by `public.user_has_role('hospital_admin',
hospital_id)`. A query that escapes JS still gets filtered at the
   wire.
2. **Edge Functions** — every mutation calls
   `requireHospitalAdminScope(callerId, hospitalId)` from
   `supabase/functions/_shared/hospital-admin-scope.ts` after the
   standard `getCaller()` + `hasRole()` checks. This re-pins the role
   to the requested hospital and refuses non-reachable lifecycle
   states (suspended / offboarded / agreement_expired).
3. **Next.js layout** — `app/hospital-admin/layout.tsx` calls
   `requireHospitalAdminScope()` from `lib/hospital-admin/scope.ts`
   before rendering. Any non-admin / unscoped access bounces to `/`.

If a feature would touch data outside its scope, **it is a bug**, and
the right fix is at the scope helper or the RLS policy — never at the
call site.

---

## 2. Tenant scope accessor — server-side

```ts
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";

export default async function MyFeaturePage() {
  const scope = await requireHospitalAdminScope();
  // scope.hospitalId   — for every feature query
  // scope.hospitalName — for chrome
  // scope.userId       — convenience (saves a round-trip)
  // scope.designation  — "primary" | "backup" | null
}
```

Rules:

- Call it in **every** Server Component, Server Action, and route
  handler that touches hospital-scoped data. It's idempotent and
  cheap (one read of cached auth state + one JOIN query).
- Treat the returned `hospitalId` as the **only** valid hospital id
  for this request. Do not pass `hospital_id` into a function from
  outside — pass `scope`.
- The helper **redirects** on no-scope; it never returns null. There
  is no "what if scope is missing" branch to write at the call site.

For Server Actions that receive a `hospital_id` field in form data
(rare — most actions can read scope), use:

```ts
import { assertScopeOwnsHospital, requireHospitalAdminScope } from "@/lib/hospital-admin/scope";

const scope = await requireHospitalAdminScope();
assertScopeOwnsHospital(scope, formData.get("hospital_id") as string);
// throws ScopeViolationError on mismatch
```

---

## 3. Tenant scope accessor — client-side

```tsx
"use client";

import { useHospitalScope } from "@/app/hospital-admin/_components/scope-provider";

export function MyClientWidget() {
  const scope = useHospitalScope();
  // scope.hospitalId, hospitalName, hospitalSlug, level, state, designation
}
```

Rules:

- Hook **throws** if called outside the workspace shell — that's a
  programmer error, not a runtime case to defend.
- The client scope intentionally omits `userId` and `userEmail` — keep
  identity out of client bundles unless a feature explicitly needs it.
- Feature client components never receive `hospitalId` as a prop. Read
  the scope, derive what you need.

---

## 4. Feature registration

The shell's sidebar, mobile sheet, and ⌘K palette are all driven by
**one array** in `app/hospital-admin/_lib/features.ts`:

```ts
export const FEATURE_AREAS = [
  { slug: "", label: "Overview", iconKey: "overview", hint: "...", placeholder: true },
  { slug: "staff", label: "Staff", iconKey: "staff", hint: "...", placeholder: true },
  // ...
];
```

To plug in a feature:

1. Edit the matching `FeatureArea` entry: flip `placeholder: false` if
   the surface is real; refine `label` / `hint` if needed.
2. Build the page at `app/hospital-admin/<slug>/page.tsx`.
3. (Optional) Add a sidebar badge by extending
   `_lib/staff-pending-count.ts` for your feature's pending count and
   wiring it into `HospitalShell` the same way `staffPendingCount` is
   threaded today.
4. (Optional) Add ⌘K entity / action entries — see section 6.

**Do NOT** add a sidebar entry by editing the shell directly. The
registry is the contract; the shell is the consumer.

---

## 5. Slide-out panel API

The shell exposes the existing `<Sheet>` primitive from
`components/ui/sheet.tsx`. No new wrapper. Features open detail panels
exactly like the superadmin approvals queue does today:

```tsx
<Sheet open={!!selected} onOpenChange={(o) => setSelected(o ? selected : null)}>
  <SheetContent widthClassName="w-full sm:max-w-[600px]">
    <SheetHeader>{/* ... */}</SheetHeader>
    <SheetBody>{/* ... */}</SheetBody>
    <SheetFooter>{/* approve / reject buttons */}</SheetFooter>
  </SheetContent>
</Sheet>
```

The primitive handles focus trap, Esc-to-close, backdrop dismiss, and
reduced-motion safely. Features supply content + buttons.

---

## 6. ⌘K command palette — entries from features

The palette currently surfaces only navigation entries (the
`FEATURE_AREAS` registry). The contract for adding entity / action
entries from a feature, **to be implemented in the first feature
prompt that needs it**:

```ts
// app/hospital-admin/<feature>/_palette.ts
export interface FeaturePaletteRegistration {
  group: string;                       // "People" | "Departments" | ...
  fetchEntities: () => Promise<...>;   // pre-scoped to current hospital_id
  buildItem: (entity) => CommandItem;  // shape matches the palette's CommandItem
}
```

The first feature to wire entity search will land both the registration
helper and the consumer wiring in `hospital-command-palette.tsx`. Until
then the palette is nav-only — and that's enough for the shell to feel
correct.

Sensitive-action entries (anything that mutates significant state) get
the same amber treatment used in the superadmin palette and route
through the feature's own confirmation flow. The palette never bypasses
a safeguard.

---

## 7. Action pattern — Edge Functions

Every mutation that touches hospital-scoped state ships as a Supabase
Edge Function with this exact shape. **No exceptions.** The shape exists
so audit, logging, scope-check, and CORS are uniform across the
codebase.

```ts
import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-<feature-action>");

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  // ...
  reason: z.string().min(8),
});

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };

  // 1. CORS + method gate
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);

  // 2. Zod parse (never trust input)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());
  const input = parsed.data;

  // 3. Auth (JWT-validated)
  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  // 4. Role check
  if (!(await hasRole(caller.id, "hospital_admin", input.hospital_id))) {
    return forbidden(init, "hospital_admin required for this hospital");
  }

  // 5. Scope check (rejects suspended / offboarded / agreement_expired tenants)
  const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
  if (!scope.ok) return forbidden(init, scope.reason);

  // 6. Audit FIRST (so a failure here aborts the mutation)
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      /* ...action, targetKind, reason, before, after */
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // 7. Mutation

  // 8. PII-redacted log + typed response
  log.info("action completed", { requestId, hospital_id: scope.hospital.id });
  return ok(
    {
      /* typed payload */
    },
    init,
  );
});
```

Reasons the order matters:

- **CORS / method first** so a misshapen request can't waste DB cycles.
- **Zod before auth** so we never look up users from unvalidated input.
- **Auth before role** so role-check sees a real `caller.id`.
- **Role before scope** so the scope helper can assume the caller
  belongs (it re-pins anyway, but layered checks are cheap).
- **Audit before mutation** so a missing audit row aborts the action,
  not vice versa.
- **PII-redacted log** because `makeLogger()` filters known PII fields
  by default — never log raw `body` or `input`.

---

## 8. Data + audit rules (non-negotiable)

- **No decrypted PHI in admin surfaces.** The admin is an
  administrator, not a clinician. Aggregate operational stats are
  fine; individual patients' clinical records are not. Any feature
  prompt that proposes otherwise is rejected at design time.
- **Every staff / structural / admin action gets an `sa_audit_log`
  row.** If you can name the action ("approve affiliation", "transfer
  primary admin", "archive department"), it gets a row — with reason,
  before, after, requestId, IP, UA.
- **Honest empty states.** A KPI you don't yet have data for renders
  "—" with the source, not a fabricated number. The kickoff is
  explicit about this.
- **No silent fallback to `/`** when scope can't be resolved. Use the
  helper; let it redirect. Bouncing to `/` with no logged reason hides
  bugs.

---

## 9. What's deliberately out of scope for the SHELL

The shell prompt explicitly does NOT build:

- The Overview KPIs.
- The staff-approval queue UI (only the badge plumbing).
- Ward management, scheduling logic, audit views, profile edit forms.
- A workspace switcher (multi-hospital admin sees their
  most-recently-designated primary hospital).
- A `/clinical` workspace (separate later).

Each feature ships in its own prompt, each one referencing this
contract. Adding a new feature area is one line in
`FEATURE_AREAS` + one new route folder — the shell does not change.

---

## 10. References

- `lib/hospital-admin/scope.ts` — server scope accessor
- `app/hospital-admin/_components/scope-provider.tsx` — client scope context
- `app/hospital-admin/_lib/features.ts` — feature registry
- `app/hospital-admin/_components/hospital-shell.tsx` — shell composition
- `app/hospital-admin/_components/hospital-command-palette.tsx` — ⌘K palette
- `supabase/functions/_shared/hospital-admin-scope.ts` — Edge Function scope helper
- `components/ui/sheet.tsx` — slide-out primitive (reused as-is)
- `docs/adr/0019-hospital-admin-workspace-shell.md` — why we split from `/admin`
- `docs/adr/0020-tenant-scope-resolution.md` — why scope is resolved by helper, not URL
