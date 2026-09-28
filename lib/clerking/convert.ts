import type {
  Complaint,
  ConversionLine,
  History,
  HistoryHeader,
  PendingChoice,
  PropValue,
  YesNo,
} from "./answers";
import type { Catalogue, PatientSex } from "./catalogue";
import type { Flag } from "./flags";
import type { ConversionFlagDefs, LegacyTable } from "./legacy";
import type { NoteContent } from "@/lib/emr/note-rules";

import { emptyHistory } from "./answers";
import { isRestricted } from "./catalogue";

/**
 * "Continue in the new format" (gate-a §4): a v1 clerking draft → payload v2, as the signed table
 * says (data/clerking/legacy-conversion.v1.json; proposal §7). The table is the only mapping read.
 *   - complaints (s01) and the review of systems (every `ros_grid`) are converted answer by answer;
 *     "not asked" stays not asked;
 *   - a broad code is never narrowed silently: the clinician picks (a PendingChoice), and until
 *     then it counts as not asked (a complaint keeps its words as text);
 *   - answers on one symptom merge: any yes → yes, all no → no, yes against no → yes with the
 *     contradiction listed; multi-choice presets combine; clashing single-choice presets become a
 *     choice (D7);
 *   - an answer whose symptom does not apply to the patient's sex is dropped and listed (D14);
 *   - every answer leaves one line on the review list, which opens the first time (#12).
 * The header, the story and Examination, Summary, Impression and Plan (s11–s14) carry unchanged.
 * Pure.
 */

type V1Answer = {
  token: string;
  label: string;
  answer: YesNo;
  from: "complaint" | "ros";
  days: number | null;
};

const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);

/** The v1 answers in draft order: complaints first, then every review-of-systems grid. */
export function v1Answers(v1: NoteContent): V1Answer[] {
  const out: V1Answer[] = [];
  for (const item of v1.sections.s01?.items ?? []) {
    if (item.kind !== "complaint_token") continue;
    const token = str(item.token);
    const label = str(item.label) ?? token;
    if (!label) continue;
    const days =
      typeof item.durationDays === "number" && item.durationDays >= 1
        ? Math.round(item.durationDays)
        : null;
    out.push({ token: token ?? "", label, answer: "yes", from: "complaint", days });
  }
  for (const section of Object.values(v1.sections))
    for (const item of section?.items ?? []) {
      if (item.kind !== "ros_grid" || !Array.isArray(item.items)) continue;
      for (const e of item.items as { token?: unknown; label?: unknown; presence?: unknown }[]) {
        const token = str(e.token);
        if (!token || (e.presence !== "present" && e.presence !== "absent")) continue;
        out.push({
          token,
          label: str(e.label) ?? token,
          answer: e.presence === "present" ? "yes" : "no",
          from: "ros",
          days: null,
        });
      }
    }
  return out;
}

const mismatch = (want: "female" | "male" | null | undefined, sex: PatientSex) =>
  !!want && !!sex && want !== sex;

export function convertV1Draft(
  cat: Catalogue,
  table: LegacyTable,
  v1: NoteContent,
  sex: PatientSex,
): NoteContent {
  const h: History = emptyHistory();
  const lines: ConversionLine[] = [];
  const pending: PendingChoice[] = [];
  const text: { label: string; answer: YesNo; restricted?: boolean }[] = [];
  let keyN = 0;
  let pendN = 0;

  const yesBy = new Map<
    string,
    { props: Record<string, PropValue>; complaint: Complaint | null; ros: boolean }
  >();
  const noBy = new Map<string, number[]>(); // symptom → line indexes of its "no"
  const clash: { symptom: string; property: string; values: string[]; line: V1Answer }[] = [];

  const line = (
    a: V1Answer,
    result: ConversionLine["result"],
    extra: Partial<ConversionLine> = {},
  ) =>
    lines.push({
      token: a.token,
      label: a.label,
      answer: a.answer,
      from: a.from,
      result,
      ...extra,
    }) - 1;
  const restricted = (ids: readonly string[]) =>
    ids.some((id) => isRestricted(cat.symptom(id)?.sensitivity));
  const textComplaint = (a: V1Answer): Complaint => {
    const c: Complaint = {
      key: `v1-${keyN++}`,
      symptom: null,
      text: a.label,
      ...(a.days ? { duration: { value: a.days, unit: "days" as const } } : {}),
      props: {},
      flags: {},
    };
    h.complaints.push(c);
    return c;
  };
  const choice = (
    a: V1Answer,
    p: Omit<PendingChoice, "id" | "token" | "label" | "answer" | "from">,
  ) => {
    pending.push({
      id: `c${pendN++}`,
      token: a.token,
      label: a.label,
      answer: a.answer,
      from: a.from,
      ...p,
    });
  };

  /** A yes on one symptom (merged, with its preset). */
  const yes = (a: V1Answer, id: string, preset: Record<string, PropValue> = {}) => {
    let e = yesBy.get(id);
    if (!e) {
      e = { props: {}, complaint: null, ros: false };
      yesBy.set(id, e);
    }
    for (const [k, v] of Object.entries(preset)) {
      const cur = e.props[k];
      if (cur === undefined) e.props[k] = v;
      else if (Array.isArray(cur) && Array.isArray(v)) e.props[k] = [...new Set([...cur, ...v])];
      else if (cur !== v) {
        const c = clash.find((x) => x.symptom === id && x.property === k);
        if (c) c.values.push(String(v));
        else clash.push({ symptom: id, property: k, values: [String(cur), String(v)], line: a });
      }
    }
    if (a.from === "complaint") {
      if (e.complaint) {
        if (a.days && (e.complaint.duration?.value ?? 0) < a.days)
          e.complaint.duration = { value: a.days, unit: "days" };
      } else {
        e.complaint = {
          key: `v1-${keyN++}`,
          symptom: id,
          ...(a.days ? { duration: { value: a.days, unit: "days" as const } } : {}),
          props: {},
          flags: {},
        };
        h.complaints.push(e.complaint);
      }
    } else e.ros = true;
  };

  for (const a of v1Answers(v1)) {
    const row = a.token ? table.row(a.token) : undefined;
    if (!row) {
      // Not in the table: words only, never a finding.
      if (a.from === "complaint") textComplaint(a);
      else text.push({ label: a.label, answer: a.answer });
      line(a, "text");
      continue;
    }
    if (a.answer === "yes") {
      const y = row.yes;
      if ("set" in y) {
        if (mismatch(cat.symptom(y.set)?.applies_to_sex, sex)) {
          line(a, "wrong_sex", { to: [y.set] });
          continue;
        }
        yes(a, y.set, y.preset);
        line(a, "converted", {
          to: [y.set],
          ...(y.review ? { review: true } : {}),
          ...(y.flag ? { flag: y.flag } : {}),
          ...(y.prompt ? { ask: [y.prompt] } : {}),
        });
      } else if ("choose" in y || "bySex" in y) {
        const options =
          "choose" in y
            ? y.choose.filter((id) => !mismatch(cat.symptom(id)?.applies_to_sex, sex))
            : sex
              ? []
              : [y.bySex.male, y.bySex.female];
        if ("bySex" in y && sex) {
          yes(a, y.bySex[sex]);
          line(a, "converted", { to: [y.bySex[sex]] });
          continue;
        }
        if (!options.length) {
          line(a, "wrong_sex");
          continue;
        }
        const placeholder = a.from === "complaint" ? textComplaint(a) : null;
        choice(a, {
          kind: "symptom",
          options,
          ...("choose" in y && y.preset ? { preset: y.preset } : {}),
          ...("choose" in y && y.text ? { text: true } : {}),
          ...("choose" in y && y.flag ? { flag: y.flag } : {}),
          ...(placeholder ? { complaintKey: placeholder.key } : {}),
          ...(restricted(options) ? { restricted: true } : {}),
        });
        line(a, "choose", { to: options });
      } else if ("property" in y) {
        const s = cat.symptom(y.property.symptom);
        if (mismatch(s?.applies_to_sex, sex)) {
          line(a, "wrong_sex", { to: [y.property.symptom] });
          continue;
        }
        const prop = cat.properties(y.property.symptom).find((p) => p.id === y.property.property);
        const placeholder = a.from === "complaint" ? textComplaint(a) : null;
        choice(a, {
          kind: "property",
          symptom: y.property.symptom,
          property: y.property.property,
          options: prop?.options.map((o) => o.id) ?? [],
          ...(placeholder ? { complaintKey: placeholder.key } : {}),
          ...(isRestricted(s?.sensitivity) ? { restricted: true } : {}),
        });
        line(a, "choose", { to: [y.property.symptom] });
      } else if ("route" in y) {
        if (sex === "male") {
          line(a, "wrong_sex");
          continue;
        }
        choice(a, {
          kind: y.route,
          options:
            y.route === "pregnancy" ? ["pregnant", "postpartum", "not_pregnant", "unknown"] : [],
          ...(y.propose ? { propose: y.propose } : {}),
          restricted: true,
        });
        line(a, "proposed");
      } else if ("activity" in y) {
        choice(a, { kind: "activity", options: y.activity });
        line(a, "choose");
      } else {
        if (a.from === "complaint") textComplaint(a);
        else text.push({ label: a.label, answer: "yes" });
        line(a, "text");
      }
      continue;
    }

    // A "no" (review of systems only).
    const n = row.no;
    if (n && ("set" in n || "bySex" in n)) {
      const ids = "set" in n ? n.set : sex ? [n.bySex[sex]] : [n.bySex.male, n.bySex.female];
      const fits = ids.filter((id) => !mismatch(cat.symptom(id)?.applies_to_sex, sex));
      if (!fits.length) {
        line(a, "wrong_sex", { to: ids });
        continue;
      }
      const at = line(a, "converted", { to: fits });
      for (const id of fits) noBy.set(id, [...(noBy.get(id) ?? []), at]);
    } else if (n && "notAsked" in n)
      line(
        a,
        "set" in row.yes && mismatch(cat.symptom(row.yes.set)?.applies_to_sex, sex)
          ? "wrong_sex"
          : "not_asked",
      );
    else if (n && "route" in n) {
      if (sex === "male") {
        line(a, "wrong_sex");
        continue;
      }
      choice(a, {
        kind: "pregnancy",
        options: ["pregnant", "postpartum", "not_pregnant", "unknown"],
        propose: n.propose,
        restricted: true,
      });
      line(a, "proposed");
    } else if (n && "activity" in n) {
      choice(a, { kind: "activity", options: n.activity, propose: n.activity[0] });
      line(a, "proposed");
    } else line(a, "left_out");
  }

  // Merge: a yes wins over a no on the same symptom, and the no is listed as a contradiction.
  for (const [id, e] of yesBy) {
    const props = { ...e.props };
    for (const c of clash.filter((x) => x.symptom === id)) {
      delete props[c.property];
      choice(c.line, {
        kind: "property",
        symptom: id,
        property: c.property,
        options: [...new Set(c.values)],
        ...(e.complaint ? { complaintKey: e.complaint.key } : {}),
        ...(isRestricted(cat.symptom(id)?.sensitivity) ? { restricted: true } : {}),
      });
    }
    if (e.complaint) e.complaint.props = props;
    else if (e.ros) {
      h.ros[id] = "yes";
      if (Object.keys(props).length) h.rosDetail[id] = { props, flags: {} };
    }
    for (const at of noBy.get(id) ?? []) lines[at]!.result = "contradiction";
    noBy.delete(id);
  }
  for (const id of noBy.keys()) h.ros[id] = "no";
  if (h.complaints.length > 20)
    for (const c of h.complaints.splice(20))
      text.push({ label: c.text ?? cat.symptom(c.symptom ?? "")?.label ?? "", answer: "yes" });

  const story = [v1.sections.s02?.narrative, v1.sections.s01?.narrative]
    .filter((x) => x?.trim())
    .join("\n\n");
  if (story) h.story = story;
  if (lines.length) h.converted = { table: table.ref, lines, pending, text };

  const header = (v1.header ?? {}) as Record<string, unknown>;
  const pick = (k: keyof HistoryHeader) =>
    typeof header[k] === "string" ? (header[k] as string) : undefined;
  const sections = Object.fromEntries(
    Object.entries(v1.sections).filter(([id]) => ["s11", "s12", "s13", "s14"].includes(id)),
  );
  return {
    schema: 2,
    catalogueVersion: cat.version,
    header: {
      historian: pick("historian"),
      language: pick("language"),
      interpreter: pick("interpreter"),
    },
    history: h as unknown as NoteContent["history"],
    sections,
    edited: {},
  };
}

/* ─── The clinician finishes a conversion ─────────────────────────── */

export type Resolution =
  /** kind symptom: the targets picked (one or more; picking one says nothing of the others). */
  | { kind: "symptoms"; symptoms: string[] }
  /** Keep the v1 words as text. */
  | { kind: "text" }
  /** kind property: the options picked. */
  | { kind: "options"; options: string[] }
  /** kind activity: the activity confirmed. */
  | { kind: "activity"; value: string }
  /** kind pregnancy / lnmp: written to the pregnancy record by the desk. */
  | { kind: "recorded" };

export function resolveChoice(cat: Catalogue, h: History, id: string, r: Resolution): History {
  const conv = h.converted;
  const p = conv?.pending.find((x) => x.id === id);
  if (!conv || !p) return h;
  let complaints = h.complaints;
  const ros = { ...h.ros };
  const rosDetail = { ...h.rosDetail };
  const social = { ...h.social };
  const text = [...conv.text];
  const holder = p.complaintKey ? complaints.find((c) => c.key === p.complaintKey) : undefined;

  /** The symptom as present, with these props; a complaint where the v1 answer was one. */
  const present = (symptom: string, props: Record<string, PropValue>, first: boolean) => {
    const existing = complaints.find((c) => c.symptom === symptom);
    if (existing) {
      complaints = complaints.map((c) =>
        c === existing ? { ...c, props: mergeProps(c.props, props) } : c,
      );
      if (first && holder && holder.key !== existing.key)
        complaints = complaints.filter((c) => c.key !== holder.key);
      return;
    }
    if (p.from === "complaint") {
      if (first && holder)
        complaints = complaints.map((c) =>
          c.key === holder.key ? { ...c, symptom, text: undefined, props } : c,
        );
      else
        complaints = [
          ...complaints,
          { key: `${p.id}-${symptom}`, symptom, props, flags: {}, duration: holder?.duration },
        ];
      return;
    }
    ros[symptom] = "yes";
    const d = rosDetail[symptom] ?? { props: {}, flags: {} };
    if (Object.keys(props).length) rosDetail[symptom] = { ...d, props: mergeProps(d.props, props) };
  };

  if (r.kind === "symptoms" && p.kind === "symptom") {
    const picks = r.symptoms.filter((s) => p.options.includes(s) && cat.symptom(s));
    if (!picks.length) return h;
    picks.forEach((s, i) => present(s, presetFor(cat, s, p.preset), i === 0));
  } else if (r.kind === "options" && p.kind === "property" && p.symptom && p.property) {
    const prop = cat.properties(p.symptom).find((x) => x.id === p.property);
    const picks = r.options.filter((o) => prop?.options.some((x) => x.id === o));
    if (!prop || !picks.length) return h;
    present(p.symptom, { [p.property]: prop.kind === "many" ? picks : picks[0]! }, true);
  } else if (r.kind === "text") {
    if (!p.text) return h;
    if (p.from === "ros") text.push({ label: p.label, answer: p.answer });
  } else if (r.kind === "activity" && p.kind === "activity") {
    if (!p.options.includes(r.value)) return h;
    social.activity = r.value;
  } else if (r.kind === "recorded" && (p.kind === "pregnancy" || p.kind === "lnmp")) {
    // Written through recordPregnancy; nothing more in the note.
  } else return h;

  return {
    ...h,
    complaints,
    ros,
    rosDetail,
    social,
    converted: { ...conv, pending: conv.pending.filter((x) => x.id !== id), text },
  };
}

function mergeProps(
  a: Record<string, PropValue>,
  b: Record<string, PropValue>,
): Record<string, PropValue> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = Array.isArray(cur) && Array.isArray(v) ? [...new Set([...cur, ...v])] : (cur ?? v);
  }
  return out;
}

/** A shared preset applies only where the symptom has that property (urgency on LUTS). */
function presetFor(
  cat: Catalogue,
  symptom: string,
  preset: Record<string, PropValue> | undefined,
): Record<string, PropValue> {
  if (!preset) return {};
  const ids = new Set(cat.properties(symptom).map((p) => p.id));
  return Object.fromEntries(Object.entries(preset).filter(([k]) => ids.has(k)));
}

export function markReviewed(h: History): History {
  return h.converted ? { ...h, converted: { ...h.converted, reviewed: true } } : h;
}

/* ─── Conversion flags (signed wording in the table) ──────────────── */

/**
 * CONV-PR-BLEED while its choice is open; CONV-RISK while a converted risk yes has no timing,
 * plan or action answered (FLAG-SELF-HARM takes over once one is). Decision support only.
 */
export function conversionFlags(cat: Catalogue, defs: ConversionFlagDefs, h: History): Flag[] {
  const conv = h.converted;
  if (!conv) return [];
  const out: Flag[] = [];
  const make = (id: string, where: string, section: Flag["section"]) => {
    const f = defs[id];
    if (f)
      out.push({
        ruleId: id,
        level: f.level,
        badge: f.badge,
        reason: f.reason,
        where,
        section,
        restricted: f.restricted,
      });
  };
  for (const p of conv.pending)
    if (p.flag) make(p.flag, p.label, p.from === "complaint" ? "complaint" : "systems");
  for (const l of conv.lines) {
    const sym = l.to?.[0];
    if (!l.review || !l.flag || l.answer !== "yes" || !sym) continue;
    const c = h.complaints.find((x) => x.symptom === sym);
    if (!c && h.ros[sym] !== "yes") continue;
    const props: Record<string, PropValue> = c?.props ?? h.rosDetail[sym]?.props ?? {};
    const detailed = cat
      .properties(sym)
      .some((p) => props[p.id] !== undefined && p.id !== "associated");
    if (!detailed) make(l.flag, cat.symptom(sym)?.label ?? l.label, c ? "complaint" : "systems");
  }
  return out;
}
