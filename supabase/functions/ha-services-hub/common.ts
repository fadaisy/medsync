import type { SaAuditAction } from "../_shared/sa-audit.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.106.1";

export interface Ctx {
  sb: SupabaseClient;
  hospitalId: string;
  callerId: string;
  /** "ward_staff": a nurse running a live bed op; ops-wards checks the ward (ADR 0194 §3). */
  role: "hospital_admin" | "superadmin" | "head" | "ward_staff";
  requestId: string;
}

export interface OpPlan {
  audit: {
    action: SaAuditAction;
    /** ≥ 8 characters (sa_audit_log). Routine edits carry a generated sentence; sensitive ones the admin's. */
    reason: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  apply: () => Promise<Record<string, unknown> | void>;
}

// Each handler receives its own Zod-parsed op; the union is narrowed by the dispatch map, not by
// the signature, so the parameter is loose on purpose.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpHandler = (ctx: Ctx, input: any) => Promise<OpPlan>;

/** A refusal the admin can act on: 400 by default, 409 for a state conflict, 403 for scope. */
export class HubError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 409 = 400,
  ) {
    super(message);
  }
}

/** Throw on a supabase-js error; return the data otherwise. */
export function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

/** A typed reason, or the generated one for routine edits. */
export function reasonOr(typed: string | undefined, generated: string): string {
  const t = typed?.trim();
  return t && t.length >= 8 ? t : generated;
}

/** The department row, tenant-checked (a uuid from another hospital is "not found"). */
export async function loadDepartment(ctx: Ctx, id: string) {
  const d = must(
    await ctx.sb
      .from("hospital_departments")
      .select(
        "id, hospital_id, parent_id, name, slug, kind, catalogue_code, medsync_live_at, archived_at, is_start, place_id, service_hours",
      )
      .eq("id", id)
      .eq("hospital_id", ctx.hospitalId)
      .maybeSingle(),
    "department lookup",
  );
  if (!d) throw new HubError("Department not found at this hospital.");
  return d as {
    id: string;
    hospital_id: string;
    parent_id: string | null;
    name: string;
    slug: string;
    kind: string;
    catalogue_code: string | null;
    medsync_live_at: string | null;
    archived_at: string | null;
    is_start: boolean;
    place_id: string | null;
    service_hours: string | null;
  };
}

/** D-SVC-16: a head may act only on a department they currently head (or its units). */
export async function assertHeadOf(ctx: Ctx, departmentId: string) {
  if (ctx.role !== "head") return;
  const dept = await loadDepartment(ctx, departmentId);
  const ids = [dept.id, ...(dept.parent_id ? [dept.parent_id] : [])];
  const now = new Date().toISOString();
  const rows = must(
    await ctx.sb
      .from("department_heads")
      .select("id, ends_at")
      .eq("user_id", ctx.callerId)
      .eq("hospital_id", ctx.hospitalId)
      .in("department_id", ids)
      .lte("starts_at", now),
    "head lookup",
  ) as { id: string; ends_at: string | null }[];
  if (!rows.some((r) => r.ends_at === null || r.ends_at > now)) {
    throw new HubError("Only a hospital admin or this department's current head can do that.", 403);
  }
}

/** A head reporting availability must head something at this hospital right now. */
export async function assertAnyHead(ctx: Ctx) {
  if (ctx.role !== "head") return;
  const now = new Date().toISOString();
  const rows = must(
    await ctx.sb
      .from("department_heads")
      .select("id, ends_at")
      .eq("user_id", ctx.callerId)
      .eq("hospital_id", ctx.hospitalId)
      .lte("starts_at", now),
    "head lookup",
  ) as { id: string; ends_at: string | null }[];
  if (!rows.some((r) => r.ends_at === null || r.ends_at > now)) {
    throw new HubError(
      "Only a hospital admin or a current head of department can report this.",
      403,
    );
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
