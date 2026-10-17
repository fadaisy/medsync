/**
 * Connections (Lab Phase 4 §6.4 EX-10, §6.7 FX-2, FX-3, FX-7; gate-a-proposal §7, A14). Pure.
 *
 * Every connection — a partner's FHIR system, an analyser bridge, a national system past GATE N — implements one
 * interface. This file holds the interface and the FHIR adapter's parsing half; transports live in the route
 * handlers and the outbox worker. A message that parses under the partner's profile but is not base-R4
 * conformant is accepted and flagged (FX-7; H5 shows this is common).
 */
import type { InboundResult, TaskStatus, TaskStatusUpdate } from "@/lib/exchange/types";

export type Parsed =
  | { kind: "result"; result: InboundResult; referralNumber: string | null }
  | { kind: "status"; update: TaskStatusUpdate }
  | { kind: "unreadable"; error: string };

/** EX-10: one interface for every connection; mappings are versioned, signed data. */
export interface Adapter {
  readonly channel: "fhir" | "hl7v2" | "astm" | "file";
  /** The signed mapping version this adapter reads with. */
  readonly mappingVersion: number | null;
  /** Build what goes out (stored in the outbox before any transport runs). */
  send(bundle: unknown): { contentType: string; body: string; about: string };
  receive(raw: string): Parsed[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** The elements we read per resource; anything else marks the message not base-conformant (FX-7). */
const KNOWN: Readonly<Record<string, ReadonlySet<string>>> = {
  Bundle: new Set(["resourceType", "id", "meta", "type", "entry", "timestamp", "identifier"]),
  Task: new Set([
    "resourceType",
    "id",
    "meta",
    "status",
    "statusReason",
    "businessStatus",
    "intent",
    "identifier",
    "basedOn",
    "focus",
    "for",
    "owner",
    "input",
    "output",
    "lastModified",
    "authoredOn",
    "executionPeriod",
  ]),
  DiagnosticReport: new Set([
    "resourceType",
    "id",
    "meta",
    "status",
    "code",
    "identifier",
    "subject",
    "specimen",
    "issued",
    "effectiveDateTime",
    "performer",
    "resultsInterpreter",
    "result",
    "conclusion",
    "basedOn",
  ]),
  Observation: new Set([
    "resourceType",
    "id",
    "meta",
    "status",
    "code",
    "subject",
    "valueQuantity",
    "valueString",
    "valueCodeableConcept",
    "referenceRange",
    "interpretation",
    "effectiveDateTime",
    "issued",
    "specimen",
    "performer",
  ]),
  Patient: new Set(["resourceType", "id", "meta", "identifier", "name", "birthDate", "gender"]),
  Specimen: new Set([
    "resourceType",
    "id",
    "meta",
    "identifier",
    "accessionIdentifier",
    "type",
    "subject",
    "collection",
    "parent",
  ]),
};
const TASK_STATUSES = new Set<TaskStatus>([
  "draft",
  "requested",
  "received",
  "accepted",
  "rejected",
  "ready",
  "cancelled",
  "in-progress",
  "on-hold",
  "failed",
  "completed",
  "entered-in-error",
]);

const firstCoding = (cc: unknown) => {
  const c = arr(isObj(cc) ? cc.coding : undefined).find(isObj);
  return { code: str(c?.code), system: str(c?.system), text: str(isObj(cc) ? cc.text : undefined) };
};
const identifierWith = (ids: unknown, pattern: RegExp) =>
  arr(ids)
    .filter(isObj)
    .find((i) => pattern.test(String(i.system ?? "")))?.value as string | undefined;

/**
 * FX-2, FX-3: a partner's FHIR message → Task status updates and results, by our referral number. `referralSystem`
 * is our own identifier system for referrals (lib/emr/fhir.ts referralSystems); `formSystem` the partner's.
 */
export function fhirReceive(
  raw: string,
  o: { referralSystem: string; formSystem: string },
): Parsed[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [{ kind: "unreadable", error: "not JSON" }];
  }
  if (!isObj(doc)) return [{ kind: "unreadable", error: "not an object" }];
  const resources =
    doc.resourceType === "Bundle"
      ? arr(doc.entry).map((e) => (isObj(e) ? e.resource : undefined))
      : [doc];
  const rs = resources.filter(isObj);
  if (rs.length === 0) return [{ kind: "unreadable", error: "no resources" }];
  let conformant = !(
    doc.resourceType === "Bundle" && Object.keys(doc).some((k) => !KNOWN.Bundle!.has(k))
  );
  for (const r of rs) {
    const known = KNOWN[String(r.resourceType)];
    if (!known || Object.keys(r).some((k) => !known.has(k))) conformant = false;
  }
  const byRef = new Map(rs.map((r) => [`${String(r.resourceType)}/${String(r.id)}`, r]));
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refPattern = new RegExp(`^${escape(o.referralSystem)}$`);
  const formPattern = new RegExp(`^${escape(o.formSystem)}$`);
  const out: Parsed[] = [];
  const patient = rs.find((r) => r.resourceType === "Patient");
  const task = rs.find((r) => r.resourceType === "Task");
  const referralNumber = task ? (identifierWith(task.identifier, refPattern) ?? null) : null;

  for (const report of rs.filter((r) => r.resourceType === "DiagnosticReport")) {
    if (!str(report.status) || !isObj(report.code)) conformant = false;
    const specimen = arr(report.specimen).filter(isObj)[0];
    const specimenRes =
      specimen && str(specimen.reference) ? byRef.get(String(specimen.reference)) : undefined;
    const theirNumber =
      (specimen &&
      isObj(specimen.identifier) &&
      formPattern.test(String(specimen.identifier.system ?? ""))
        ? str(specimen.identifier.value)
        : undefined) ??
      (specimenRes ? identifierWith(specimenRes.identifier, formPattern) : undefined);
    const components = arr(report.result)
      .filter(isObj)
      .map((ref) => byRef.get(String(ref.reference)))
      .filter(isObj)
      .map((obs, n) => {
        if (!str(obs.status) || !isObj(obs.code)) conformant = false;
        const code = firstCoding(obs.code);
        const q = isObj(obs.valueQuantity) ? obs.valueQuantity : undefined;
        const value =
          q && typeof q.value === "number"
            ? String(q.value)
            : (str(obs.valueString) ??
              firstCoding(obs.valueCodeableConcept).text ??
              firstCoding(obs.valueCodeableConcept).code ??
              "");
        const range = arr(obs.referenceRange).filter(isObj)[0];
        const rangeText =
          str(range?.text) ??
          (range && isObj(range.low) && isObj(range.high)
            ? `${String(range.low.value)}-${String(range.high.value)}`
            : undefined);
        return {
          key: str(obs.id) ?? `c${n + 1}`,
          code: code.code ?? "",
          codeSystem: code.system,
          value,
          unit: q ? str(q.unit) : undefined,
          ucum: q && q.system === "http://unitsofmeasure.org" ? str(q.code) : undefined,
          rangeText,
          flagText: firstCoding(arr(obs.interpretation)[0]).code,
          observedAt: str(obs.effectiveDateTime) ?? str(obs.issued),
        };
      });
    const name = patient ? arr(patient.name).filter(isObj)[0] : undefined;
    out.push({
      kind: "result",
      referralNumber,
      result: {
        identifiers: { theirNumber },
        patient: patient
          ? {
              name:
                str(name?.text) ??
                ([...arr(name?.given), name?.family]
                  .filter((x) => typeof x === "string")
                  .join(" ") ||
                  undefined),
              birthDate: str(patient.birthDate),
              hospitalNumber: identifierWith(patient.identifier, /mrn/i),
            }
          : undefined,
        report: {
          number: identifierWith(report.identifier, /./),
          issued: str(report.issued),
          status: str(report.status),
          authorisedBy: str(arr(report.resultsInterpreter).filter(isObj)[0]?.display),
        },
        components,
        conformant,
      },
    });
  }
  if (task && referralNumber && !out.some((p) => p.kind === "result")) {
    const status = String(task.status) as TaskStatus;
    if (!TASK_STATUSES.has(status)) return [{ kind: "unreadable", error: "Task.status" }];
    const at =
      str(task.lastModified) ??
      str(isObj(task.executionPeriod) ? task.executionPeriod.start : undefined);
    if (!at || Number.isNaN(Date.parse(at))) return [{ kind: "unreadable", error: "Task time" }];
    out.push({
      kind: "status",
      update: {
        referralNumber,
        status,
        businessStatus:
          firstCoding(task.businessStatus).text ?? firstCoding(task.businessStatus).code,
        statusReason: firstCoding(task.statusReason).text ?? firstCoding(task.statusReason).code,
        eventAt: new Date(at),
      },
    });
  }
  return out.length ? out : [{ kind: "unreadable", error: "no Task status or DiagnosticReport" }];
}
