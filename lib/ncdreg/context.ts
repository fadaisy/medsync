/**
 * The context every NCD read and write runs in (§8.1 layer 1): who, where, as which principal, with
 * which capabilities, and at what entry time. Roles are resolved by the database
 * (`private.ncd_current_roles()`), so the server-side check and the policies can never disagree on
 * who someone is.
 *
 * Entry time (§10.3): a value carried in the context, not a process-wide clock. Only the
 * `demo_loader` principal and tests may supply it; everyone else gets the server's receipt time.
 */
import type { Capability, GrantRole } from "./capabilities";
import type { NcdDb, NcdIdentity } from "./db";
import type { ConditionModule } from "./standard/types";
import { sql } from "drizzle-orm";

import { capabilitiesOf } from "./capabilities";
import { rows, withNcd } from "./db";
import { CONDITION_CATALOGUE } from "./standard/conditions";

export type NcdContext = NcdIdentity & {
  roles: GrantRole[];
  caps: Set<Capability>;
  /** Server-side entry time for this request. */
  enteredAt: Date;
  /** The facility's local date at `enteredAt`. */
  today: string;
  timeZone: string;
  demoLoadId: string | null;
  /** Display label for synthetic rows (demo actors); null for every real write. */
  actorLabel: (
    role: "triage_nurse" | "clinician" | "registry_officer" | "registry_lead",
  ) => string | null;
  /** The condition catalogue in force; tests inject a throwaway module through it (§5.6). */
  catalogue: readonly ConditionModule[];
  db?: NcdDb;
};

export class NcdError extends Error {
  constructor(
    public code:
      | "forbidden"
      | "invalid"
      | "not_found"
      | "conflict"
      | "interlock"
      | "needs_confirmation"
      | "duplicates",
    message: string,
    public detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export type ResolveOptions = {
  enteredAt?: Date;
  demoLoadId?: string | null;
  demoActors?: Record<string, string>;
  catalogue?: readonly ConditionModule[];
  db?: NcdDb;
};

export async function resolveContext(id: NcdIdentity, o: ResolveOptions = {}): Promise<NcdContext> {
  if (o.enteredAt && id.principal !== "demo_loader" && process.env.NODE_ENV !== "test")
    throw new NcdError("forbidden", "Only the demo loader may supply an entry time.");
  const [r] = await withNcd(
    id,
    "app",
    (tx) =>
      rows<{ roles: string[]; tz: string | null }>(
        tx,
        sql`SELECT private.ncd_current_roles() AS roles,
                   (SELECT time_zone FROM public.ncd_facility_settings WHERE facility_id = ${id.facilityId}) AS tz`,
      ),
    o.db,
  );
  const roles = (r?.roles ?? []) as GrantRole[];
  const enteredAt = o.enteredAt ?? new Date();
  const timeZone = r?.tz ?? "Africa/Kampala";
  const synthetic = id.principal === "demo_loader";
  return {
    ...id,
    roles,
    caps: capabilitiesOf(roles),
    enteredAt,
    today: localDate(enteredAt, timeZone),
    timeZone,
    demoLoadId: o.demoLoadId ?? null,
    actorLabel: (role) => (synthetic ? (o.demoActors?.[role] ?? null) : null),
    catalogue: o.catalogue ?? CONDITION_CATALOGUE,
    db: o.db,
  };
}

export function can(ctx: NcdContext, ...caps: Capability[]): boolean {
  return caps.some((c) => ctx.caps.has(c));
}

/** Layer 1 of §8.1: refuse before touching the database. */
export function authorize(ctx: NcdContext, ...caps: Capability[]): void {
  if (!can(ctx, ...caps)) throw new NcdError("forbidden", `Needs one of: ${caps.join(", ")}`);
}

export function moduleOf(ctx: NcdContext, code: string): ConditionModule {
  const m = ctx.catalogue.find((x) => x.code === code);
  if (!m) throw new NcdError("invalid", `Unknown condition: ${code}`);
  return m;
}
