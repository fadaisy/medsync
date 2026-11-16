/**
 * Care mode data on the phone, v2 (patient app v2 §5.6 to §5.7; Step 7). Behind `careMode`, which stays off in
 * production until Gate CG (MR11). Reads go through the patient's own RLS (0301): the mode, the newest plan
 * version, the week's dose ticks, unacknowledged alerts and the care team's open requests. Writes go through
 * the Edge Functions with a client key and queue offline (MR13): a tick or a reading is saved once, however
 * often it is sent (S18). Every read fails soft: before 0301 the screens fall back to the patient's own log.
 */
import type { NewLog } from "@/data/health-log";
import type { SaveResult } from "@/offline/outbox";
import type { CareAlert, CarePlanItem, DoseTick, TeamAsk } from "@patient-core/care-plan";
import type { ReadingInput } from "@patient-core/readings";

import { addLog } from "@/data/health-log";
import { currentUserId, enqueue, newId } from "@/offline/outbox";

export interface CareData {
  enrolmentId: string;
  programme: string;
  planVersionId: string | null;
  items: CarePlanItem[];
  ticks: DoseTick[];
  alerts: CareAlert[];
  asks: TeamAsk[];
}

async function db() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/supabase") as typeof import("@/lib/supabase")).supabase;
}

/** Plan items as the care team wrote them; anything malformed is left out, never guessed (MR3). */
export function planItemsOf(raw: unknown): CarePlanItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((i) => {
    const o = i as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.name !== "string" || !Array.isArray(o.times)) return [];
    const times = o.times.filter((t): t is string => typeof t === "string" && /^\d{2}:\d{2}$/.test(t));
    const kind = o.kind === "check" || o.kind === "walk" ? o.kind : "dose";
    return [{ key: o.key, name: o.name, why: typeof o.why === "string" ? o.why : null, kind, times }];
  });
}

/** The patient's live programme and today's working set, or null when not in Care mode (or before 0301). */
export async function loadCare(now: Date = new Date()): Promise<CareData | null> {
  try {
    const sb = await db();
    const { data: mode } = await sb.from("patient_mode").select("enrolment_id, programme").limit(1).maybeSingle();
    if (!mode) return null;
    const enrolmentId = mode.enrolment_id as string;
    const since = new Date(now.getTime() - 8 * 86_400_000).toISOString();
    const [plan, ticks, alerts, asks] = await Promise.all([
      sb
        .from("care_plan_versions")
        .select("id, items")
        .eq("enrolment_id", enrolmentId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb.from("dose_events").select("medicine_key, due_at, status, recorded_at").gte("due_at", since),
      sb.from("care_alerts").select("kind, created_at, acknowledged_at").eq("enrolment_id", enrolmentId).gte("created_at", since),
      sb
        .from("care_messages")
        .select("id, created_at")
        .eq("enrolment_id", enrolmentId)
        .eq("from_patient", false)
        .eq("kind", "request")
        .is("read_at", null),
    ]);
    return {
      enrolmentId,
      programme: mode.programme as string,
      planVersionId: (plan.data?.id as string | undefined) ?? null,
      items: planItemsOf(plan.data?.items),
      ticks: ((ticks.data ?? []) as Record<string, string>[]).map((t) => ({
        medicineKey: t.medicine_key!,
        dueAtIso: t.due_at!,
        status: t.status as DoseTick["status"],
        recordedAtIso: t.recorded_at!,
      })),
      alerts: ((alerts.data ?? []) as Record<string, string | null>[]).map((a) => ({
        kind: a.kind as CareAlert["kind"],
        atIso: a.created_at!,
        acknowledged: a.acknowledged_at !== null,
      })),
      // The team's name is never shown here; "Your care team" is the screen's words (MR names-with-consent).
      asks: ((asks.data ?? []) as Record<string, string>[]).map((m) => ({ id: m.id!, from: "team", atIso: m.created_at! })),
    };
  } catch {
    return null;
  }
}

/** Loaded on first use, like the outbox's client: importing readings must not need a backend (tests, helpers). */
function callEdge(fn: string, body: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/edge") as typeof import("@/lib/edge")).callEdge(fn, body);
}

/** Send now, or queue on this phone for the outbox to replay with the same key. */
async function sendOrQueue(kind: "reading" | "dose", body: Record<string, unknown>): Promise<SaveResult> {
  const fn = kind === "reading" ? "pt-care-reading" : "pt-dose-event";
  const res = await callEdge(fn, body);
  if (res.ok) return "sent";
  if (res.code !== "offline") return "failed";
  const owner = await currentUserId().catch(() => null);
  if (!owner) return "failed";
  await enqueue(kind, { owner, body });
  return "queued";
}

/** Tick a dose: taken, skipped (with a reason) or snoozed. Offline it waits on this phone (MR13). */
export function tickDose(input: {
  planVersionId: string;
  medicineKey: string;
  dueAtIso: string;
  status: "taken" | "skipped" | "snoozed";
  skipReason?: "felt_unwell" | "ran_out" | "forgot" | "side_effects" | "other";
  clientKey?: string;
}): Promise<SaveResult> {
  return sendOrQueue("dose", {
    clientKey: input.clientKey ?? newId(),
    planVersionId: input.planVersionId,
    medicineKey: input.medicineKey,
    dueAt: input.dueAtIso,
    status: input.status,
    ...(input.skipReason ? { skipReason: input.skipReason } : {}),
  });
}

/** What `pt-care-reading` takes for a reading; null when the reading is not complete. */
export function careReadingBody(input: ReadingInput, clientKey: string, at: Date): Record<string, unknown> | null {
  const recordedAt = at.toISOString();
  if (input.kind === "bp")
    return input.top && input.bottom ? { kind: "bp", clientKey, top: input.top, bottom: input.bottom, recordedAt } : null;
  if (input.value === null) return null;
  if (input.kind === "sugar") return { kind: "sugar", clientKey, value: input.value, context: input.context, recordedAt };
  return { kind: input.kind, clientKey, value: input.value, recordedAt };
}

/**
 * Care mode's reading save: the row goes into the patient's own log with its id as the client key (it shows at
 * once and queues offline, as every reading does), and the same key goes to `pt-care-reading`, which finds that
 * row (or makes it, if it arrives first) and tells the team when it is a danger reading. One row either way.
 */
export async function saveCareReading(input: ReadingInput, row: NewLog, at: Date = new Date()): Promise<SaveResult> {
  const clientKey = newId();
  const body = careReadingBody(input, clientKey, at);
  if (!body) return "failed";
  const saved = await addLog(row, at, { clientKey });
  if (saved === "failed") return saved;
  const told = await sendOrQueue("reading", body);
  return saved === "queued" || told === "queued" ? "queued" : saved;
}
