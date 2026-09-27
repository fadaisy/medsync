import type { ExamAttribute, ExamCatalogue, ExamItem } from "./catalogue";
import type { ClassifierResult } from "./classifiers";
import type { ExamContext, VitalValues } from "./context";
import type { AttrValue, ExamEntry } from "./payload";
import type { News2Result } from "@/lib/triage/types";

import { amts, gcsP, gcsText, mrcNumber, orientation } from "./scores";
import { bmiOf, whtrOf } from "./vitals";

/**
 * The examination paragraph (PROMPT-CLERKING-EXAM-V2 §5.13, catalogue `composer.rules`). Fixed
 * rules, no AI: vital signs, anthropometry, then General and the systems in catalogue order;
 * positives first with their attributes, then negatives; links and mirrors written once, by their
 * owner; hints never; unrecorded items simply absent; restricted items and options only in the
 * clinical note. Pure.
 */

export interface ExamBlock {
  /** "vitals", "anthropometry", a system id, or "not_examined". */
  id: string;
  text: string;
}

/** The saved set the note reads (D-EX-11), with its qualifiers. */
export interface SavedSet {
  values: VitalValues;
  arm?: string | null;
  position?: string | null;
  rhythm?: string | null;
  site?: string | null;
  glucoseContext?: string | null;
  oxygen?: "air" | "oxygen" | null;
  oxygenModality?: string | null;
  news2?: News2Result | null;
  /** Fields whose implausible value was confirmed. */
  confirmed?: readonly string[];
}

export interface ComposeInput {
  x: ExamContext;
  results: ReadonlyMap<string, ClassifierResult>;
  saved: SavedSet | null;
  audience: "clinician" | "patient";
}

const lc = (s: string) =>
  /^[A-Z]{2}|^(FiO|SpO)|^[A-Z][a-z]*'s\b|^(Kernig|Brudzinski|Romberg|Hoffmann|Murphy|Rovsing|Erb|Levine|Hackett|Schamroth|Kussmaul|Dupuytren|Kaposi|Charcot)/.test(
    s,
  )
    ? s
    : s.charAt(0).toLowerCase() + s.slice(1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[], joiner = "and") =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${joiner} ${xs.at(-1)}`;
const head = (label: string) => label.split(" · ")[0]!;
const RESTRICTED = (s: string | undefined) => !!s && s !== "standard";

/* ─── Attributes ──────────────────────────────────────────────────── */

const PREFIXED = /\b(at|to|in|by|from|on|of|over|with)$/i;
/** Option words that need their attribute's name to read ("median sulcus felt"). */
const BARE = new Set([
  "felt",
  "not felt",
  "obliterated",
  "present",
  "absent",
  "normal",
  "reduced",
  "increased",
  "equal",
  "different",
  "yes",
  "no",
]);

function zoneWords(cat: ExamCatalogue, a: ExamAttribute, ids: string[]): string {
  const zones = cat.zones(a);
  const name = (id: string) => zones.find((z) => z.id === id)?.label ?? id;
  if (a.body_map === "spine") return `at ${list(ids.map(name))}`;
  if (a.body_map === "lungs") {
    const words = ids.map((id) => {
      const z = name(id); // "R lower", "L upper back"
      const [side, level, back] = z.split(" ");
      return `${side === "R" ? "right" : "left"} ${level} zone${back ? " (back)" : ""}`;
    });
    return `in the ${list(words)}`;
  }
  return `in the ${list(ids.map((id) => lc(name(id))))}`;
}

function attrText(
  cat: ExamCatalogue,
  item: ExamItem,
  a: ExamAttribute,
  v: AttrValue,
  audience: ComposeInput["audience"],
): string {
  if (a.kind === "number" || a.kind === "scale") {
    const n = Number(v);
    const unit = a.unit ?? (a.kind === "scale" ? "/10" : "");
    if (unit === "days") return `day ${n}`;
    const label = lc(a.label);
    const u = unit === "/10" || unit === "%" || unit === "°" ? unit : ` ${unit}`;
    if (/^(below|above|from)\b/i.test(a.label)) return `${n}${u} ${label}`;
    return `${label} ${n}${u}`.trim();
  }
  if (a.kind === "shared") return "";
  const ids = Array.isArray(v) ? v : [String(v)];
  if (a.kind === "zones" && (a.body_map || !a.options?.length)) return zoneWords(cat, a, ids);
  const opts = ids
    .map((id) => a.options?.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .filter((o) => !o.mirror_of) // mirrors are written by their owner
    .filter((o) => !(audience === "patient" && RESTRICTED(o.sensitivity)));
  if (!opts.length) return "";
  const words = opts.map((o) => lc(head(o.label)));
  if (/grade|stage/i.test(a.label) && !/grade|stage/i.test(words.join(" ")))
    return `${/stage/i.test(a.label) ? "stage" : "grade"} ${list(words)}`;
  if (a.id === "side") return words[0] === "both" ? "bilateral" : list(words);
  if (PREFIXED.test(a.label) || words.every((w) => BARE.has(w)))
    return `${lc(a.label)} ${list(words)}`;
  return list(words);
}

function attrsClause(
  cat: ExamCatalogue,
  item: ExamItem,
  e: ExamEntry,
  audience: ComposeInput["audience"],
): string {
  const attrs = e.attrs ?? {};
  const defs =
    item.response.type === "choice"
      ? (item.response.options.find((o) => o.id === e.choice)?.attributes ?? [])
      : (item.attributes ?? []);
  return defs
    .filter((a) => attrs[a.id] !== undefined)
    .map((a) => attrText(cat, item, a, attrs[a.id]!, audience))
    .filter(Boolean)
    .join(", ");
}

/* ─── Items ───────────────────────────────────────────────────────── */

function itemText(
  i: ComposeInput,
  item: ExamItem,
  e: ExamEntry,
): { positive: boolean; text: string } | null {
  const { x, results, audience } = i;
  const cat = x.cat;
  const r = item.response;
  if (r.type === "link") return null;
  if (e.state === "not_examined") return null;
  const clause = e.state === "positive" ? attrsClause(cat, item, e, audience) : "";
  const withClause = (base: string) => (clause ? `${base}, ${clause}` : base);

  if (r.type === "device")
    return e.state === "positive" ? { positive: true, text: withClause(lc(item.label)) } : null;
  if (r.type === "choice") {
    const o = r.options.find((p) => p.id === e.choice);
    if (!o) return null;
    if (item.id === "ex.general.oxygen")
      return o.expected
        ? { positive: false, text: "on room air" }
        : { positive: true, text: `on supplemental oxygen${clause ? ` (${clause})` : ""}` };
    return { positive: !o.expected, text: withClause(lc(head(o.label))) };
  }
  if (r.type === "classified") {
    const c = results.get(r.classifier);
    if (e.state === "negative") return { positive: false, text: item.phrase?.negative ?? "" };
    if (!c || c.status === "none") return null;
    if (c.status === "not_graded")
      return { positive: true, text: c.inputs.join(", ") || (item.phrase?.positive ?? "") };
    if (c.status !== "result") return { positive: true, text: c.inputs.join(", ") };
    if (c.result === "none") return { positive: false, text: item.phrase?.negative ?? lc(c.text) };
    return { positive: true, text: `${lc(c.text)} (GTFCC: ${c.inputs.join(", ")})` };
  }
  if (r.type === "measured") {
    // MUAC is written on the anthropometry line; here only the signs and the oedema caution.
    const signs = attrText(
      cat,
      item,
      cat.attribute(item.id, "signs")!,
      e.attrs?.signs ?? [],
      audience,
    );
    return signs ? { positive: true, text: `nutrition: ${signs}` } : null;
  }
  if (e.state === "negative")
    return item.phrase ? { positive: false, text: item.phrase.negative } : null;
  if (item.id === "ex.general.distress") {
    const d = results.get("distress_severity");
    const parts = ["respiratory_distress_severity", "pain_severity", "agitation_severity"]
      .map((id) => results.get(id))
      .filter((c): c is ClassifierResult => !!c?.result)
      .map((c) =>
        c.id === "pain_severity"
          ? `${c.reason}, ${c.result}`
          : c.id === "agitation_severity"
            ? `agitation ${c.reason}, ${c.result}`
            : `respiratory, ${c.result}`,
      );
    return {
      positive: true,
      text: `${d?.result ? `in ${d.result} distress` : "in distress"}${parts.length ? ` (${parts.join("; ")})` : ""}`,
    };
  }
  return { positive: true, text: withClause(item.phrase?.positive ?? lc(item.label)) };
}

/* ─── Blocks ──────────────────────────────────────────────────────── */

function consciousnessText(x: ExamContext): string | null {
  const c = x.exam.blocks.consciousness;
  if (!c) return null;
  const base =
    c.method === "acvpu"
      ? c.acvpu
        ? `ACVPU: ${{ A: "alert", C: "new confusion", V: "responds to voice", P: "responds to pain", U: "unresponsive" }[c.acvpu]}`
        : null
      : gcsText(c);
  if (!base) return null;
  const o = orientation(c);
  const orient =
    o.full === true
      ? "oriented to time, place and person"
      : o.full === false
        ? `not oriented to ${list(o.not, "or")}`
        : "";
  const p = gcsP(x.exam);
  return [base + (c.baseline ? " (known baseline)" : ""), p?.show ? `GCS-P ${p.value}` : "", orient]
    .filter(Boolean)
    .join(", ");
}

function motorText(x: ExamContext): { pos: string[]; neg: string[] } {
  const b = x.exam.blocks;
  const pos: string[] = [];
  const neg: string[] = [];
  const power = Object.entries(b.power ?? {});
  if (power.length) {
    const weak = power.filter(
      ([, c]) =>
        (c.R !== undefined && mrcNumber(c.R) !== 5) ||
        (c.L !== undefined && mrcNumber(c.L) !== 5) ||
        c.R === "4+" ||
        c.L === "4+",
    );
    if (weak.length)
      pos.push(
        `power: ${weak.map(([row, c]) => `${lc(row)} right ${c.R ?? "?"}/5, left ${c.L ?? "?"}/5`).join("; ")}`,
      );
    else
      neg.push(
        power.length === x.cat.grids.power.length && power.every(([, c]) => c.R && c.L)
          ? "power 5/5 throughout"
          : "power 5/5 where tested",
      );
  }
  const reflexes = Object.entries(b.reflexes ?? {});
  if (reflexes.length) {
    const odd = reflexes.filter(
      ([, c]) => (c.R !== undefined && c.R !== 2) || (c.L !== undefined && c.L !== 2),
    );
    if (odd.length)
      pos.push(
        `reflexes: ${odd.map(([row, c]) => `${lc(row)} right ${c.R ?? "?"}, left ${c.L ?? "?"}`).join("; ")}`,
      );
    else neg.push("reflexes 2 and symmetrical");
  }
  const p = b.plantars;
  if (p?.R || p?.L) {
    const w = (v?: string) => (v ?? "not recorded").replace(/_/g, " ");
    const text = p.R === p.L ? `plantars ${w(p.R)}` : `plantars right ${w(p.R)}, left ${w(p.L)}`;
    (p.R === "extensor" || p.L === "extensor" || p.R === "equivocal" || p.L === "equivocal"
      ? pos
      : neg
    ).push(text);
  }
  return { pos, neg };
}

function pulsesText(x: ExamContext): { pos: string[]; neg: string[] } {
  const cells = Object.entries(x.exam.blocks.pulses ?? {});
  if (!cells.length) return { pos: [], neg: [] };
  const odd: string[] = [];
  for (const [row, c] of cells)
    for (const [side, word] of [
      ["R", "right"],
      ["L", "left"],
    ] as const)
      if (c[side] && c[side] !== "present") odd.push(`${c[side]} ${word} ${lc(row)}`);
  if (odd.length) return { pos: [`pulses: ${odd.join(", ")}`], neg: [] };
  const all = cells.length === x.cat.grids.pulses.length && cells.every(([, c]) => c.R && c.L);
  return {
    pos: [],
    neg: [all ? "all peripheral pulses present" : "peripheral pulses present where felt"],
  };
}

function resultLine(c: ClassifierResult | undefined): string | null {
  if (!c || c.status !== "result") return null;
  return `${c.text} (${c.reason})`;
}

/* ─── Paragraphs ──────────────────────────────────────────────────── */

function systemParagraph(i: ComposeInput, systemId: string): string | null {
  const { x, results, audience } = i;
  const system = x.cat.system(systemId)!;
  if (x.exam.systems?.[systemId]?.notExamined) return null;
  const pos: string[] = [];
  const neg: string[] = [];
  for (const part of system.parts) {
    for (const id of part.items) {
      const item = x.cat.item(id)!;
      if (audience === "patient" && RESTRICTED(item.sensitivity)) continue;
      const e = x.exam.entries[id];
      if (!e) continue;
      const t = itemText(i, item, e);
      if (!t?.text) continue;
      (t.positive ? pos : neg).push(t.text);
    }
    if (part.block === "motor_grids") {
      const m = motorText(x);
      pos.push(...m.pos);
      neg.push(...m.neg);
    }
    if (part.block === "pulses_grid") {
      const p = pulsesText(x);
      pos.push(...p.pos);
      neg.push(...p.neg);
    }
    if (part.block === "amts") {
      const a = amts(x.exam);
      if (a?.complete) {
        const cut = x.cat.refNumber("REF-EX-AMTS-IMPAIRED") ?? 6;
        (a.score <= cut ? pos : neg).push(`AMTS ${a.score}/10`);
      }
    }
  }
  if (systemId === "general") {
    const c = consciousnessText(x);
    if (c) pos.unshift(c);
  }
  const extra = {
    respiratory: ["acute_asthma_severity", "crb65"],
    nervous: ["rosier"],
    feet: ["iwgdf_risk", "dfi_iwgdf_idsa", "sinbad"],
  }[systemId];
  for (const id of extra ?? []) {
    const line = resultLine(results.get(id));
    if (line) pos.push(line);
  }
  if (systemId === "abdomen" && x.exam.panels?.westHaven)
    pos.push(`West Haven grade ${x.exam.panels.westHaven} (clinician's grade)`);
  if (!pos.length && !neg.length) return null;
  const sentences = [
    ...(pos.length ? [pos.map(cap).join(". ")] : []),
    ...(neg.length ? [cap(neg.join("; "))] : []),
  ];
  let text = `${system.name}: ${sentences.join(". ")}.`;
  if (system.gate && x.exam.gate) {
    const g = x.exam.gate;
    const consent = g.consent === "verbal" ? "Verbal consent" : "Best-interests decision recorded";
    const chap =
      g.chaperone === "present"
        ? `Chaperone: ${g.name ?? ""}${g.role ? `, ${g.role}` : ""}.`
        : g.chaperone === "declined"
          ? "Chaperone offered and declined."
          : "No chaperone: emergency.";
    text = `${chap} ${consent}. ${text}`;
  }
  return text;
}

function vitalsLine(i: ComposeInput): string | null {
  const s = i.saved;
  if (!s) return null;
  const v = s.values;
  const bits: string[] = [];
  const missing: string[] = [];
  const conf = (k: string) => (s.confirmed?.includes(k) ? " (confirmed)" : "");
  const quals = (xs: (string | null | undefined)[]) => {
    const q = xs.filter(Boolean) as string[];
    return q.length ? ` (${q.join(", ")})` : "";
  };
  if (v.sbp !== null)
    bits.push(
      `BP ${v.sbp}/${v.dbp ?? "?"}${quals([s.arm ? `${s.arm} arm` : null, s.position?.replace("supine", "lying")])}${conf("bp_systolic")}`,
    );
  else missing.push("BP");
  if (v.pulse !== null)
    bits.push(
      `pulse ${v.pulse}${s.rhythm ? ` ${s.rhythm.replace(/_/g, " ")}` : ""}${conf("pulse")}`,
    );
  else missing.push("pulse");
  if (v.rr !== null) bits.push(`RR ${v.rr}${conf("rr")}`);
  else missing.push("respiratory rate");
  if (v.spo2 !== null)
    bits.push(
      `SpO₂ ${v.spo2}%${s.oxygen === "air" ? " on room air" : s.oxygen === "oxygen" ? ` on oxygen${s.oxygenModality ? ` (${s.oxygenModality})` : ""}` : ""}${conf("spo2")}`,
    );
  else missing.push("SpO₂");
  if (v.temp !== null) bits.push(`temperature ${v.temp} °C${quals([s.site])}${conf("temp")}`);
  else missing.push("temperature");
  if (v.glucose !== null)
    bits.push(
      `glucose ${v.glucose} mmol/L${quals([s.glucoseContext?.replace(/_/g, " ").replace("two hours", "2 hours")])}${conf("glucose")}`,
    );
  if (!bits.length) return null;
  const n = s.news2;
  const news = n ? ` NEWS2 ${n.total}${n.provisional ? " (incomplete)" : ""}.` : "";
  return `Vital signs: ${bits.join(", ")}.${news}${missing.length ? ` Not measured: ${list(missing)}.` : ""}`;
}

function anthropometryLine(i: ComposeInput): string | null {
  const { x, results } = i;
  const v = i.saved?.values;
  const bits: string[] = [];
  if (v?.weight != null) bits.push(`weight ${v.weight} kg`);
  if (v?.height != null) bits.push(`height ${v.height} cm`);
  const bmi = v ? bmiOf(v.weight, v.height) : null;
  const bc = results.get("bmi_who");
  if (bmi !== null) bits.push(`BMI ${bmi}${bc?.status === "result" ? ` (${lc(bc.text)})` : ""}`);
  const second: string[] = [];
  const wr = results.get("waist_risk");
  if (v?.waist != null)
    second.push(`waist ${v.waist} cm${wr?.status === "result" ? ` (${lc(wr.text)})` : ""}`);
  const w = v ? whtrOf(v.waist, v.height) : null;
  if (w !== null) second.push(`waist-to-height ${w.toFixed(2)}`);
  const cm = x.exam.entries["ex.general.nutrition"]?.attrs?.muac;
  const m = results.get("muac_uganda_imam");
  const muac =
    typeof cm === "number"
      ? `MUAC ${cm} cm${m?.status === "result" ? ` (${lc(m.text)})` : ""}`
      : null;
  const sentences = [bits, second, muac ? [muac] : []]
    .filter((s) => s.length)
    .map((s) => cap(s.join(", ")));
  if (m?.note) sentences.push(m.note);
  return sentences.length ? `${sentences.join(". ")}.` : null;
}

function notExaminedLine(i: ComposeInput): string | null {
  const { x, audience } = i;
  const reasons = new Map(x.cat.data.not_examined.reasons.map((r) => [r.id, r.label]));
  const why = (r: { id: string; detail?: string; equipment?: string }) =>
    r.equipment
      ? `no ${r.equipment.toLowerCase()}`
      : r.detail
        ? `${lc(reasons.get(r.id) ?? r.id)}: ${r.detail}`
        : lc(reasons.get(r.id) ?? r.id);
  const out: string[] = [];
  for (const s of x.cat.systems) {
    const n = x.exam.systems?.[s.id]?.notExamined;
    if (n) out.push(`${lc(s.name)} (${why(n)})`);
  }
  for (const [id, e] of Object.entries(x.exam.entries)) {
    if (e.state !== "not_examined" || !e.reason) continue;
    const item = x.cat.item(id);
    if (!item || (audience === "patient" && RESTRICTED(item.sensitivity))) continue;
    if (x.exam.systems?.[x.cat.placeOf(id)!.system.id]?.notExamined) continue;
    out.push(`${lc(item.label)} (${why(e.reason)})`);
  }
  return out.length ? `Not examined: ${out.join("; ")}.` : null;
}

export function composeExam(i: ComposeInput): ExamBlock[] {
  const blocks: ExamBlock[] = [];
  const push = (id: string, text: string | null) => text && blocks.push({ id, text });
  push("vitals", vitalsLine(i));
  push("anthropometry", anthropometryLine(i));
  for (const s of i.x.cat.systems) push(s.id, systemParagraph(i, s.id));
  push("not_examined", notExaminedLine(i));
  return blocks;
}

export const examText = (blocks: readonly ExamBlock[]) => blocks.map((b) => b.text).join("\n");
