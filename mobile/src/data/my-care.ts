/**
 * My care data on the phone, v2 (Step 8), behind `careMode`. Under the patient's own RLS (0301): the team from
 * `care_team_view` (a person only where they consented, S20), names from `clinician_directory`, the plan's
 * check intervals, and the message thread. Sending goes through `pt-care-message` with a client key and waits
 * on this phone when offline (MR13). Fails soft to empty.
 */
import type { SaveResult } from "@/offline/outbox";
import type { TeamRow } from "@patient-core/my-care";

import { currentUserId, enqueue, newId } from "@/offline/outbox";

async function db() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/supabase") as typeof import("@/lib/supabase")).supabase;
}

export interface CareMessage {
  id: string;
  fromPatient: boolean;
  kind: "text" | "auto_reply" | "request";
  body: string;
  atIso: string;
  /** Still on this phone, not yet sent. */
  queued?: boolean;
}

export interface MyCareData {
  team: TeamRow[];
  names: Map<string, string>;
  intervals: Record<string, number>;
  messages: CareMessage[];
}

export async function loadMyCare(enrolmentId: string): Promise<MyCareData> {
  const empty: MyCareData = { team: [], names: new Map(), intervals: {}, messages: [] };
  try {
    const sb = await db();
    const [team, plan, messages] = await Promise.all([
      sb.from("care_team_view").select("id, role, first_contact, next_step, member_user_id").eq("enrolment_id", enrolmentId),
      sb
        .from("care_plan_versions")
        .select("check_intervals")
        .eq("enrolment_id", enrolmentId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
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
      for (const d of (data ?? []) as { id: string; full_name: string | null }[]) if (d.full_name) names.set(d.id, d.full_name);
    }
    const raw = (plan.data?.check_intervals ?? {}) as Record<string, unknown>;
    const intervals = Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === "number"),
    );
    return {
      team: rows,
      names,
      intervals,
      messages: ((messages.data ?? []) as Record<string, unknown>[]).map((m) => ({
        id: m.id as string,
        fromPatient: Boolean(m.from_patient),
        kind: m.kind as CareMessage["kind"],
        body: m.body as string,
        atIso: m.created_at as string,
      })),
    };
  } catch {
    return empty;
  }
}

/** Send a message to the care team, or keep it on this phone until online (the outbox replays the same key). */
export async function sendCareMessage(body: string, clientKey: string = newId()): Promise<SaveResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { callEdge } = require("@/lib/edge") as typeof import("@/lib/edge");
  const payload = { clientKey, body };
  const res = await callEdge("pt-care-message", payload);
  if (res.ok) return "sent";
  if (res.code !== "offline") return "failed";
  const owner = await currentUserId().catch(() => null);
  if (!owner) return "failed";
  await enqueue("message", { owner, body: payload });
  return "queued";
}
