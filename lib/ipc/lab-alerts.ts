/**
 * The infection prevention feed (Lab Phase 5 §6.6, IC-1..IC-14; ADR 0335). Pure: the alert list entry, which released
 * results and referrals raise an alert, one alert per patient per condition per episode, the minimum dataset, the
 * state an alert's actions give it, escalation, the patient flag, and IDSR epi-week counts. `lib/ipc/**` is a module
 * of its own (E-LAB5-03). No entry, precaution or route is written here: the list is signed data.
 */
import { z } from "zod";

/* ─── IC-1: an alert list entry ────────────────────────────────────── */
export const PRECAUTIONS = [
  "airborne",
  "droplet",
  "contact",
  "contact_if_incontinent",
  "isolation",
  "standard",
] as const;
export const ROUTES = ["notify_now", "weekly_item", "programme_route", "none"] as const;
export type Route = (typeof ROUTES)[number];

export const AlertEntryPayload = z
  .object({
    condition: z.string().trim().min(3).max(120),
    trigger: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("result"),
        testCode: z.string().regex(/^test\.[a-z0-9_]+$/),
        concept: z.string().regex(/^obs\.[a-z0-9_]+$/),
        /** The coded answers that raise the alert. */
        answers: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1),
      }),
      z.object({ kind: z.literal("outbreak_referral") }),
      /** After GATE M (Step 10): editable now, never evaluated until microbiology exists. */
      z.object({
        kind: z.literal("organism"),
        organism: z.string().min(2),
        phenotype: z.string().nullable(),
      }),
    ]),
    scope: z.enum(["every_ward", "high_risk_units"]),
    precaution: z.object({
      type: z.enum(PRECAUTIONS),
      stopLine: z.string().trim().min(5).max(300),
      source: z.string().trim().min(3).max(300),
    }),
    ipcAlert: z.boolean(),
    route: z.object({
      kind: z.enum(ROUTES),
      idsrItem: z.string().trim().min(2).max(120).nullable(),
      reference: z.string().trim().min(3).max(200).nullable(),
    }),
    /** IC-11: a screening result needs confirmation. */
    confirmationNeeded: z.boolean(),
    source: z.string().trim().min(3).max(300),
  })
  .refine(
    (e) =>
      !["notify_now", "weekly_item"].includes(e.route.kind) ||
      (e.route.idsrItem && e.route.reference),
    {
      message: "An IDSR route names its item and the IDSR table it comes from.",
    },
  );
export type AlertEntry = z.infer<typeof AlertEntryPayload>;
export interface SignedEntry {
  key: string;
  configId: string;
  entry: AlertEntry;
}

/* ─── IC-2: what raises an alert ───────────────────────────────────── */
export interface ReleasedResult {
  testCode: string;
  components: readonly { concept: string; answer: string | null }[];
}
/** The entries a released result matches (typed, interfaced, by rule, bedside, or a referred result filed). */
export function matchResult(list: readonly SignedEntry[], r: ReleasedResult): SignedEntry[] {
  return list.filter(
    ({ entry: e }) =>
      raises(e) &&
      e.trigger.kind === "result" &&
      e.trigger.testCode === r.testCode &&
      r.components.some(
        (c) =>
          e.trigger.kind === "result" &&
          c.concept === e.trigger.concept &&
          c.answer !== null &&
          e.trigger.answers.includes(c.answer),
      ),
  );
}
/** IC-2: an outbreak referral (Phase 4 RF-7) raises its entries at referral, before any result. */
export const matchReferral = (list: readonly SignedEntry[]) =>
  list.filter(({ entry: e }) => raises(e) && e.trigger.kind === "outbreak_referral");
/** An entry raises an alert when IPC acts on it, or when it is routed to the surveillance focal person. */
export const raises = (e: Pick<AlertEntry, "ipcAlert" | "route">) =>
  e.ipcAlert || e.route.kind === "notify_now" || e.route.kind === "weekly_item";
/** IDSR-only: no IPC decision is needed; a notification closes it (IC-6). */
export const idsrOnly = (e: Pick<AlertEntry, "ipcAlert" | "route">) => !e.ipcAlert && raises(e);
/** IC-2: an amendment that removes the triggering answer closes the alert with "Result corrected". */
export const correctionCloses = (entry: AlertEntry, r: ReleasedResult) =>
  matchResult([{ key: "x", configId: "x", entry }], r).length === 0;
/** A14: entries whose test is not on this hospital's menu are signed but never fire. */
export const onMenu = (entry: AlertEntry, menuTestCodes: readonly string[]) =>
  entry.trigger.kind !== "result" || menuTestCodes.includes(entry.trigger.testCode);

/* ─── IC-3: one alert per patient per condition per episode ────────── */
export function episodeKey(p: {
  admissionId: string | null;
  encounterId: string | null;
  referralId?: string | null;
}): string {
  if (p.admissionId) return `admission:${p.admissionId}`;
  if (p.encounterId) return `encounter:${p.encounterId}`;
  return `referral:${p.referralId ?? "none"}`;
}

/* ─── IC-5: the minimum dataset (Law 8: no values, no chart) ───────── */
export interface MinimumDataset {
  patientName: string;
  patientCode: string;
  sex: string;
  ageYears: number;
  place: string;
  admittedAt: Date | null;
  condition: string;
  specimenAt: Date | null;
  releasedAt: Date | null;
  precaution: string;
  stopLine: string;
  screening: boolean;
}

/* ─── IC-6, IC-7: state from actions; closing; escalation ──────────── */
export type ActionKind =
  | "precautions_started"
  | "already_in_precautions"
  | "not_needed"
  | "contacts_listed"
  | "notified"
  | "escalated"
  | "result_corrected"
  | "attached"
  | "viewed";
export interface Action {
  kind: ActionKind;
  at: Date;
  detail?: Record<string, unknown>;
}
export type AlertState =
  | { state: "new" }
  | { state: "escalated" }
  | { state: "precautions_started"; at: Date }
  | { state: "already_in_precautions"; at: Date }
  | { state: "not_needed"; reason: string }
  | { state: "notified"; at: Date }
  | { state: "result_corrected"; at: Date };
const CLOSING: readonly ActionKind[] = [
  "precautions_started",
  "already_in_precautions",
  "not_needed",
];
/** The latest closing action decides; otherwise escalated or new. Contacts-to-trace is shown beside, not a state. */
export function alertState(
  entry: Pick<AlertEntry, "ipcAlert" | "route">,
  actions: readonly Action[],
): AlertState {
  const sorted = [...actions].sort((a, b) => a.at.getTime() - b.at.getTime());
  const corrected = sorted.find((a) => a.kind === "result_corrected");
  if (corrected) return { state: "result_corrected", at: corrected.at };
  const close = [...sorted].reverse().find((a) => CLOSING.includes(a.kind));
  if (close?.kind === "precautions_started") return { state: "precautions_started", at: close.at };
  if (close?.kind === "already_in_precautions")
    return { state: "already_in_precautions", at: close.at };
  if (close?.kind === "not_needed")
    return { state: "not_needed", reason: String(close.detail?.reason ?? "") };
  const notified = sorted.find((a) => a.kind === "notified");
  // An IDSR-only alert closes on notification; one that needs precautions still needs an IPC decision.
  if (notified && idsrOnly(entry)) return { state: "notified", at: notified.at };
  if (sorted.some((a) => a.kind === "escalated")) return { state: "escalated" };
  return { state: "new" };
}
export const isClosed = (s: AlertState) => s.state !== "new" && s.state !== "escalated";
/** IC-6: closing needs a precaution decision, or a notification for an IDSR-only alert. */
export function closeErrors(kind: ActionKind, detail: Record<string, unknown>) {
  const e: string[] = [];
  if (
    kind === "not_needed" &&
    !(typeof detail.reason === "string" && detail.reason.trim().length >= 3)
  )
    e.push("reason_required");
  if (
    kind === "precautions_started" &&
    !(typeof detail.type === "string" && typeof detail.where === "string")
  )
    e.push("type_and_place_required");
  if (kind === "contacts_listed" && !(typeof detail.count === "number" && detail.count >= 0))
    e.push("count_required");
  if (kind === "notified" && !(typeof detail.to === "string" && typeof detail.channel === "string"))
    e.push("whom_and_how_required");
  return e;
}
/** Operational (IC-7): minutes without an action before an alert escalates. */
export const ESCALATE_AFTER_MINUTES = 60;
export function escalationDue(
  createdAt: Date,
  actions: readonly Action[],
  now: Date,
  minutes = ESCALATE_AFTER_MINUTES,
) {
  if (actions.some((a) => a.kind !== "viewed" && a.kind !== "attached")) return false;
  return now.getTime() - createdAt.getTime() >= minutes * 60_000;
}

/* ─── IC-8: the patient flag ───────────────────────────────────────── */
export interface FlagEvent {
  entryKey: string;
  condition: string;
  precaution: string;
  kind: "set" | "clear";
  at: Date;
}
/** The flags in force: per entry, the latest event is a set. */
export function activeFlags(events: readonly FlagEvent[]): FlagEvent[] {
  const last = new Map<string, FlagEvent>();
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime()))
    last.set(e.entryKey, e);
  return [...last.values()].filter((e) => e.kind === "set");
}

/* ─── IC-10: IDSR epi-weeks (Monday to Sunday, Kampala) and counts ─── */
export function epiWeekStart(at: Date): string {
  const local = new Date(at.getTime() + 3 * 3_600_000);
  const day = (local.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day),
  );
  return monday.toISOString().slice(0, 10);
}
export function idsrCounts(
  rows: readonly {
    idsrItem: string | null;
    route: Route;
    releasedAt: Date | null;
    createdAt: Date;
  }[],
  weekStart: string,
) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.idsrItem || (r.route !== "notify_now" && r.route !== "weekly_item")) continue;
    if (epiWeekStart(r.releasedAt ?? r.createdAt) !== weekStart) continue;
    counts.set(r.idsrItem, (counts.get(r.idsrItem) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([item, n]) => ({ item, n }));
}
