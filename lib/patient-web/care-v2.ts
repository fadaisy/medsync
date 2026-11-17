import "server-only";

import type { CareAlert, CarePlanItem, DoseTick, TeamAsk } from "@patient-core/care-plan";
import type { TeamRow } from "@patient-core/my-care";
import { planItemsOf } from "@patient-core/care-plan";

import { createClient } from "@/lib/supabase/server";

/**
 * Care mode reads on the web, v2 (Step 9), under the patient's own session and RLS (0301), the same rows the
 * phone reads (`mobile/src/data/care-v2.ts`, `my-care.ts`). Behind `careModeOn()`. Fails soft to null.
 */
export interface CareWeb {
  enrolmentId: string;
  programme: string;
  planVersionId: string | null;
  items: CarePlanItem[];
  intervals: Record<string, number>;
  ticks: DoseTick[];
  alerts: CareAlert[];
  asks: TeamAsk[];
}

export async function loadCareWeb(now: Date = new Date()): Promise<CareWeb | null> {
  try {
    const sb = await createClient();
    const { data: mode } = await sb
      .from("patient_mode")
      .select("enrolment_id, programme")
      .limit(1)
      .maybeSingle();
    if (!mode) return null;
    const enrolmentId = mode.enrolment_id as string;
    const since = new Date(now.getTime() - 8 * 86_400_000).toISOString();
    const [plan, ticks, alerts, thread] = await Promise.all([
      sb
        .from("care_plan_versions")
        .select("id, items, check_intervals")
        .eq("enrolment_id", enrolmentId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("dose_events")
        .select("medicine_key, due_at, status, recorded_at")
        .gte("due_at", since),
      sb
        .from("care_alerts")
        .select("kind, created_at, acknowledged_at")
        .eq("enrolment_id", enrolmentId)
        .gte("created_at", since),
      sb
        .from("care_messages")
        .select("id, created_at, from_patient, kind")
        .eq("enrolment_id", enrolmentId)
        .gte("created_at", since)
        .order("created_at", { ascending: true }),
    ]);
    const t = (thread.data ?? []) as {
      id: string;
      created_at: string;
      from_patient: boolean;
      kind: string;
    }[];
    const lastMine = t.filter((m) => m.from_patient).at(-1)?.created_at ?? "";
    const raw = (plan.data?.check_intervals ?? {}) as Record<string, unknown>;
    return {
      enrolmentId,
      programme: mode.programme as string,
      planVersionId: (plan.data?.id as string | undefined) ?? null,
      items: planItemsOf(plan.data?.items),
      intervals: Object.fromEntries(
        Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === "number"),
      ),
      ticks: ((ticks.data ?? []) as Record<string, string>[]).map((x) => ({
        medicineKey: x.medicine_key!,
        dueAtIso: x.due_at!,
        status: x.status as DoseTick["status"],
        recordedAtIso: x.recorded_at!,
      })),
      alerts: ((alerts.data ?? []) as Record<string, string | null>[]).map((a) => ({
        kind: a.kind as CareAlert["kind"],
        atIso: a.created_at!,
        acknowledged: a.acknowledged_at !== null,
      })),
      asks: t
        .filter((m) => !m.from_patient && m.kind === "request" && m.created_at > lastMine)
        .map((m) => ({ id: m.id, from: "team", atIso: m.created_at })),
    };
  } catch {
    return null;
  }
}

export interface WebMessage {
  id: string;
  fromPatient: boolean;
  kind: "text" | "auto_reply" | "request";
  body: string;
  atIso: string;
}

export async function loadTeamAndThread(
  enrolmentId: string,
): Promise<{ team: TeamRow[]; names: Map<string, string>; messages: WebMessage[] }> {
  const sb = await createClient();
  const [team, messages] = await Promise.all([
    sb
      .from("care_team_view")
      .select("id, role, first_contact, next_step, member_user_id")
      .eq("enrolment_id", enrolmentId),
    sb
      .from("care_messages")
      .select("id, from_patient, kind, body, created_at")
      .eq("enrolment_id", enrolmentId)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  const rows: TeamRow[] = ((team.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    role: r.role as TeamRow["role"],
    firstContact: Boolean(r.first_contact),
    nextStep: (r.next_step as string | null) ?? null,
    memberUserId: (r.member_user_id as string | null) ?? null,
  }));
  const ids = rows.flatMap((r) => (r.memberUserId ? [r.memberUserId] : []));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await sb.from("clinician_directory").select("id, full_name").in("id", ids);
    for (const d of (data ?? []) as { id: string; full_name: string | null }[])
      if (d.full_name) names.set(d.id, d.full_name);
  }
  return {
    team: rows,
    names,
    messages: ((messages.data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m.id as string,
      fromPatient: Boolean(m.from_patient),
      kind: m.kind as WebMessage["kind"],
      body: m.body as string,
      atIso: m.created_at as string,
    })),
  };
}
