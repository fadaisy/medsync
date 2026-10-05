"use client";

import type { ExamView, SaveSet } from "./model";
import type { VitalValues } from "@/lib/clerking/exam/context";
import type { ExamDraft, Panels, VitalsDraft } from "@/lib/clerking/exam/payload";
import type { News2Result, ParameterScore } from "@/lib/triage/types";
import type { JSX, KeyboardEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { CheckIcon, ChevronDownIcon, Link2Icon, TriangleAlertIcon } from "lucide-react";

import { Chip, FieldRow, Segmented } from "@/components/clerking/controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pefPercent } from "@/lib/clerking/exam/context";
import { acvpuOf, acvpuSuggestion, gcsText } from "@/lib/clerking/exam/scores";
import {
  airOrOxygen,
  bmiOf,
  draftAfterSave,
  isPlausible,
  news2Band,
  parseBp,
  parseDecimal,
  saveLines,
  scale2,
  whtrOf,
} from "@/lib/clerking/exam/vitals";
import { cn } from "@/lib/utils";
import { Pill, ResultPill } from "./result-pill";

/**
 * Vital signs in the examination (PROMPT-CLERKING-EXAM-V2 §5.1, E6, E8): the previous set beside
 * the "Now" inputs in clinical order, live NEWS2 points from the triage engine, air or oxygen and
 * consciousness read from General (never asked twice), anthropometry with its classes, the
 * on-demand panels, and "Save as a new set" through the observation action. Enter moves to the
 * next field (§5.16). Amber is caution and teal is done; NEWS2 urgency belongs to the Flags panel,
 * so nothing here is painted in the emergency colour.
 */

type Num = "bp" | "pulse" | "rr" | "spo2" | "temp" | "glucose" | "weight" | "height" | "waist";
type PanelId = "postural" | "bothArms" | "peakFlow" | "ketones";
type Bp = { sbp: number; dbp: number };

export interface VitalsCardProps {
  v: ExamView;
  editable: boolean;
  /** Save allowed (clinical actions permitted). */
  act: boolean;
  onExam: (fn: (d: ExamDraft) => ExamDraft) => void;
  onSave: SaveSet;
  /** Open a system/part of the examination (the air-or-oxygen and consciousness links). */
  onGo: (system: string, part?: string) => void;
  /** The previous set: values from `v.x` is NOT it — use `triage` below. */
  triage: {
    label: string;
    at: string | null;
    values: VitalValues;
    news2: News2Result | null;
    acvpu: string | null;
    oxygen: string | null;
  };
  /** "16:10" from an ISO time. */
  time: (iso: string) => string;
  /** A panel to open (from a suggestion). */
  openPanel?: PanelId | null;
}

const AMBER = "text-amber-800 dark:text-status-caution-fg";
const BADGE = "bg-status-caution-bg text-amber-800 dark:text-status-caution-fg";
const LINK = "text-indigo-700 dark:text-indigo-300";
const TAP = "max-sm:min-h-11";
const NUM = "w-24 text-right font-mono tabular-nums max-sm:min-h-11 max-sm:w-full max-sm:text-base";
/** The input's invalid state is the error colour; a vital sign that needs a look is a caution. */
const INVALID =
  "aria-invalid:border-amber-600 aria-invalid:bg-status-caution-bg aria-invalid:shadow-none dark:aria-invalid:shadow-none";

const ACVPU: Record<string, string> = {
  A: "Alert",
  C: "New confusion",
  V: "Voice",
  P: "Pain",
  U: "Unresponsive",
};
const OXYGEN: Record<string, string> = { air: "Room air", oxygen: "Supplemental oxygen" };
const WORDS: Record<string, string> = {
  two_hours_after_food: "2 hours after food",
  two_hours_after_glucose: "2 hours after 75 g glucose",
};
const word = (id: string) =>
  WORDS[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ");
const lc = (s: string) =>
  /^[A-Z][a-z]*(?:[\s-]|$)/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
const fmt = (n: number | null, dp = 0) => (n === null ? null : dp ? n.toFixed(dp) : String(n));

/* ─── Pure helpers (tested) ───────────────────────────────────────── */

const PARAM: Record<string, { label: string; unit: string; dp?: number }> = {
  respiratory_rate: { label: "Respiratory rate", unit: "/min" },
  spo2: { label: "SpO₂", unit: "%" },
  systolic_bp: { label: "Systolic BP", unit: " mmHg" },
  pulse: { label: "Pulse", unit: "/min" },
  temperature: { label: "Temperature", unit: " °C", dp: 1 },
  consciousness: { label: "Consciousness", unit: "" },
  supplemental_oxygen: { label: "Oxygen", unit: "" },
};
const MISSING: Record<string, string> = {
  respiratory_rate: "respiratory rate",
  spo2: "SpO₂",
  systolic_bp: "blood pressure",
  pulse: "pulse",
  temperature: "temperature",
  consciousness: "consciousness",
  oxygen: "air or oxygen",
};

export interface News2Summary {
  /** "NEWS2 5 · Urgent response threshold". */
  text: string;
  tone: "strong" | "caution" | "neutral";
  threes: string[];
  /** "Temperature up from 32.5 to 35.8 °C; it no longer scores." */
  messages: string[];
  /** "Missing: air or oxygen and consciousness." */
  missing: string | null;
}

/** The NEWS2 line under the table: the draft's total and band, any parameter scoring 3, what
 *  changed from the previous set for each value typed now, and what is missing, in words. */
export function news2Summary(
  draft: News2Result,
  previous: News2Result | null,
  typed: ReadonlySet<string>,
): News2Summary {
  const messages: string[] = [];
  for (const q of draft.parameters) {
    const f = PARAM[q.parameter];
    const t = previous?.parameters.find((x) => x.parameter === q.parameter);
    if (!f || !typed.has(q.parameter) || typeof q.value !== "number") continue;
    if (typeof t?.value !== "number" || t.value === q.value || (!q.points && !t.points)) continue;
    const n = (x: number) => (f.dp ? x.toFixed(f.dp) : String(x));
    const now = !q.points
      ? "it no longer scores"
      : q.points === t.points
        ? `it still scores ${q.points}`
        : `it now scores ${q.points}`;
    messages.push(
      `${f.label} ${q.value > t.value ? "up" : "down"} from ${n(t.value)} to ${n(q.value)}${f.unit}; ${now}.`,
    );
  }
  return {
    text: `NEWS2 ${draft.total} · ${news2Band(draft)}`,
    tone:
      draft.total >= 7
        ? "strong"
        : draft.total >= 5 || draft.hasSingleParameterThree
          ? "caution"
          : "neutral",
    threes: draft.parameters
      .filter((q) => q.points === 3)
      .map((q) => `${PARAM[q.parameter]?.label ?? q.parameter} scores 3 on its own.`),
    messages,
    missing: draft.missing.length
      ? `Missing: ${list(draft.missing.map((m) => MISSING[m] ?? m))}.`
      : null,
  };
}

/** What `saveLines` says is missing, as the card shows it. */
export const toSaveText = (missing: readonly string[]) => `To save: ${missing.join(", ")}.`;

const VS: [keyof VitalValues, string][] = [
  ["sbp", "vs.bp"],
  ["pulse", "vs.pulse"],
  ["rr", "vs.rr"],
  ["spo2", "vs.spo2"],
  ["temp", "vs.temp"],
  ["glucose", "vs.glucose"],
  ["weight", "vs.weight"],
  ["height", "vs.height"],
  ["waist", "vs.waist"],
];
/** The vs.* ids a saved set held (so a suggestion to measure them reads as done). */
export const savedFields = (x: VitalValues) =>
  VS.filter(([k]) => x[k] !== null).map(([, id]) => id);

/* ─── Small parts ─────────────────────────────────────────────────── */

/** A NEWS2 parameter's points: nothing at 0; the number (with words for a screen reader) in
 *  amber from 1, stronger at 3. */
function Score({ q }: { q: ParameterScore | undefined }) {
  if (!q?.present || !q.points) return null;
  return (
    <span
      title={`NEWS2 score ${q.points}`}
      data-news2={q.points}
      className={cn(
        "text-caption inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-xs px-1 font-mono tabular-nums",
        BADGE,
        q.points === 3 && "font-semibold ring-1 ring-amber-600 ring-inset",
      )}
    >
      <span className="sr-only">NEWS2 score </span>
      {q.points}
    </span>
  );
}

const Unit = ({ children }: { children: ReactNode }) => (
  <span className="text-caption text-muted-foreground whitespace-nowrap">{children}</span>
);

function Caution({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={cn("text-caption inline-flex flex-wrap items-center gap-2", AMBER)}>
      <TriangleAlertIcon aria-hidden className="size-3 shrink-0" />
      {children}
    </p>
  );
}

function Row({
  label,
  htmlFor,
  prev,
  previous,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** The previous set's column heading, repeated on a phone where the header row is hidden. */
  prev: string;
  previous: ReactNode;
  children: ReactNode;
}) {
  return (
    <tr className="border-border/60 border-b align-top last:border-b-0 max-sm:flex max-sm:flex-col max-sm:gap-2 max-sm:py-3">
      <th
        scope="row"
        className="text-body-s text-foreground max-sm:text-body-m py-3 pr-3 text-left font-normal max-sm:p-0 max-sm:font-medium sm:w-40 sm:pt-4"
      >
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </th>
      <td className="py-3 pr-3 max-sm:p-0 sm:w-36 sm:pt-4">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-muted-foreground sm:hidden">{`${prev}:`}</span>
          {previous}
        </span>
      </td>
      <td className="py-3 max-sm:p-0">
        <div className="flex flex-col gap-2">{children}</div>
      </td>
    </tr>
  );
}

/** A panel field ("sbp/dbp" or L/min): what is typed stays in the field; the draft holds the
 *  number only once it reads as one. */
function PanelInput<T>({
  label,
  unit,
  initial,
  read,
  onValue,
  disabled,
  bp,
}: {
  label: string;
  unit: string;
  initial: string;
  read: (s: string) => { value?: T; error?: string };
  onValue: (v: T | undefined) => void;
  disabled: boolean;
  bp?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldRow label={label} group={false}>
      <Input
        id={id}
        data-advance=""
        aria-label={label}
        defaultValue={initial}
        inputMode={bp ? "text" : "decimal"}
        autoComplete="off"
        placeholder={bp ? "sbp/dbp" : undefined}
        maxLength={bp ? 12 : 8}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : undefined}
        onChange={(e) => {
          const r = read(e.target.value);
          setError(r.error ?? null);
          onValue(r.value);
        }}
        className={cn(NUM, bp && "w-28", INVALID)}
      />
      <Unit>{unit}</Unit>
      {error ? <Caution id={`${id}-e`}>{error}</Caution> : null}
    </FieldRow>
  );
}

/* ─── The card ────────────────────────────────────────────────────── */

export function VitalsCard(p: VitalsCardProps): JSX.Element {
  const { v, editable } = p;
  const off = !editable;
  const V: VitalsDraft = v.exam.vitalsDraft ?? {};
  const x = v.parsed.values;
  const uid = useId();
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState(false);
  const [queued, setQueued] = useState(false);
  // "More measurements": open when a suggestion names a panel, and again whenever it names one.
  const [more, setMore] = useState(!!p.openPanel);
  const [askedFor, setAskedFor] = useState(p.openPanel ?? null);
  if ((p.openPanel ?? null) !== askedFor) {
    setAskedFor(p.openPanel ?? null);
    if (p.openPanel) setMore(true);
  }

  /* Draft writes */
  const setDraft = (fn: (vd: VitalsDraft) => VitalsDraft) =>
    p.onExam((d) => ({ ...d, vitalsDraft: fn(d.vitalsDraft ?? {}) }));
  const keysOf = (f: Num): string[] => (f === "bp" ? ["bp_systolic", "bp_diastolic"] : [f]);
  const pending = (f: Num) => v.parsed.implausible.filter((k) => keysOf(f).includes(k));
  const errorOf = (f: Num) => v.parsed.errors[f];
  const setText = (f: Num, text: string, extra?: Partial<VitalsDraft>) =>
    setDraft((vd) => ({
      ...vd,
      ...extra,
      [f]: text,
      // A confirm tap is for the value that was kept; a new value asks again (E8).
      confirmed: vd.confirmed?.filter((k) => !keysOf(f).includes(k)),
    }));
  const keep = (f: Num) => {
    const keys = pending(f);
    setDraft((vd) => ({ ...vd, confirmed: [...new Set([...(vd.confirmed ?? []), ...keys])] }));
  };
  const toggle = <K extends keyof VitalsDraft>(k: K, value: VitalsDraft[K]) =>
    setDraft((vd) => ({ ...vd, [k]: vd[k] === value ? undefined : value }));
  const setPanel = <K extends PanelId>(k: K, patch: NonNullable<Panels[K]>) =>
    p.onExam((d) => ({
      ...d,
      panels: { ...d.panels, [k]: { ...d.panels?.[k], ...patch } } as Panels,
    }));

  /* Catalogue qualifiers (ids from the catalogue, words from the ids) */
  const qual = <T extends string>(field: string, key: string) =>
    (v.ecat.data.vital_signs.fields.find((f) => f.id === field)?.qualifiers?.[key] ?? []).map(
      (id) => ({ id: id as T, label: word(id) }),
    );

  /* Arm and position default from the last set, and from the higher arm once a difference
   * between the arms has persisted on repeat (§5.1). */
  const both = v.exam.panels?.bothArms;
  const higher =
    v.results.get("inter_arm_difference")?.result === "persistent" &&
    both?.right?.sbp !== undefined &&
    both.left?.sbp !== undefined
      ? both.right.sbp >= both.left.sbp
        ? "right"
        : "left"
      : undefined;
  const savedArm = v.saved.arm === "right" || v.saved.arm === "left" ? v.saved.arm : undefined;
  const savedPos = v.saved.position === "supine" ? "lying" : v.saved.position;
  const defaults: Partial<VitalsDraft> = {
    arm: V.arm ?? higher ?? savedArm,
    position:
      V.position ??
      (savedPos === "lying" || savedPos === "sitting" || savedPos === "standing"
        ? savedPos
        : undefined),
  };

  /* NEWS2 */
  const typed = new Set(
    [
      x.sbp !== null && "systolic_bp",
      x.pulse !== null && "pulse",
      x.rr !== null && "respiratory_rate",
      x.spo2 !== null && "spo2",
      x.temp !== null && "temperature",
    ].filter((s): s is string => !!s),
  );
  const nowScore = (name: string) =>
    typed.has(name) || name === "consciousness" || name === "supplemental_oxygen"
      ? v.news2Draft.parameters.find((q) => q.parameter === name)
      : undefined;
  const prevScore = (name: string) => p.triage.news2?.parameters.find((q) => q.parameter === name);
  const n2 = news2Summary(v.news2Draft, p.triage.news2, typed);

  /* Enter advances (§5.16): the next visible, enabled field in the card. */
  const advance = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.key !== "Enter" || !t.matches("input[data-advance]")) return;
    e.preventDefault();
    const all = [
      ...e.currentTarget.querySelectorAll<HTMLInputElement>("input[data-advance]:not(:disabled)"),
    ].filter((el) => el.getClientRects().length > 0);
    all[all.indexOf(t as HTMLInputElement) + 1]?.focus();
  };

  /* One "Now" field */
  const idOf = (f: Num) => `${uid}-${f}`;
  const field = (
    f: Num,
    label: string,
    o: { placeholder?: string; wide?: boolean; extra?: Partial<VitalsDraft> } = {},
  ) => {
    const flagged = !!errorOf(f) || pending(f).length > 0;
    return (
      <Input
        id={idOf(f)}
        data-advance=""
        aria-label={label}
        value={V[f] ?? ""}
        // A decimal keypad has no slash, so the one-field BP takes the text keyboard.
        inputMode={f === "bp" ? "text" : "decimal"}
        autoComplete="off"
        maxLength={f === "bp" ? 12 : 8}
        placeholder={o.placeholder}
        disabled={off}
        aria-invalid={flagged || undefined}
        aria-describedby={flagged ? `${idOf(f)}-check` : undefined}
        onChange={(e) => setText(f, e.target.value, o.extra)}
        className={cn(NUM, o.wide && "w-28", INVALID)}
      />
    );
  };
  const checks = (f: Num) => {
    const error = errorOf(f);
    const keys = pending(f);
    if (!error && !keys.length) return null;
    return (
      <Caution id={`${idOf(f)}-check`}>
        {error ?? "Outside the usual range: keep?"}
        {!error ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={off}
            onClick={() => keep(f)}
            className={TAP}
          >
            Keep
          </Button>
        ) : null}
      </Caution>
    );
  };
  const prevNum = (n: number | null, param?: string, dp = 0) => (
    <>
      {n === null ? (
        <span className="text-body-s text-muted-foreground">Not recorded</span>
      ) : (
        <span className="text-body-s text-foreground font-mono tabular-nums">{fmt(n, dp)}</span>
      )}
      {param ? <Score q={prevScore(param)} /> : null}
    </>
  );

  /* Air or oxygen, and consciousness, from General (E3, E6) */
  const oxygenPart = v.ecat.placeOf("ex.general.oxygen")?.part.id ?? "attachments";
  const nutritionPart = v.ecat.placeOf("ex.general.nutrition")?.part.id ?? "hydration_nutrition";
  const air = airOrOxygen(v.exam);
  const modality = v.exam.entries["ex.general.oxygen"]?.attrs?.modality;
  const modalityLabel =
    typeof modality === "string"
      ? v.ecat.attribute("ex.general.oxygen", "modality")?.options?.find((o) => o.id === modality)
          ?.label
      : undefined;
  const oxygenText =
    air === "air"
      ? "Room air (from General)"
      : air === "oxygen"
        ? `Supplemental oxygen: ${modalityLabel ? lc(modalityLabel) : "modality not recorded"} (from General)`
        : null;
  const c = v.exam.blocks.consciousness;
  const acvpu = acvpuOf(c);
  const gcs = gcsText(c);
  const suggestion = acvpu ? null : acvpuSuggestion(c);
  const consText = gcs
    ? `${gcs} → ${acvpu ? ACVPU[acvpu] : "choose ACVPU in General"}`
    : acvpu
      ? `${ACVPU[acvpu]} (from General)`
      : null;

  const goLine = (text: string, part: string, caution: boolean) => (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => p.onGo("general", part)}
        className={cn(
          "text-body-s focus-visible:shadow-focus inline-flex items-center gap-1.5 rounded-sm text-left underline-offset-4 outline-none hover:underline",
          TAP,
          caution ? AMBER : LINK,
        )}
      >
        {caution ? (
          <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
        ) : (
          <Link2Icon aria-hidden className="size-3.5 shrink-0" />
        )}
        {text}
      </button>
    </span>
  );
  const notRecorded = (part: string, what: string) => (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={cn("text-body-s inline-flex items-center gap-1.5", AMBER)}>
        <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
        Not recorded: record in General
      </span>
      <Button variant="secondary" size="sm" onClick={() => p.onGo("general", part)} className={TAP}>
        {`Record ${what}`}
      </Button>
    </span>
  );

  /* Save as a new set (E6) */
  const check = tried ? saveLines(v.ecat, v.exam, "check") : null;
  const missing = check && !check.ok ? check.missing : null;
  const savedAt = v.exam.vitalsSavedAt && !v.exam.vitalsDraft ? v.exam.vitalsSavedAt : null;
  const save = async () => {
    const id = crypto.randomUUID();
    setQueued(false);
    const r = saveLines(v.ecat, v.exam, id);
    setTried(true);
    setFailed(false);
    if (!r.ok) return;
    const fields = savedFields(x);
    setSaving(true);
    try {
      const done = await p.onSave(r.lines, id, fields);
      if (done === "queued") {
        // Offline: the desk's queue sends it when back online and marks it saved then.
        setQueued(true);
        setTried(false);
      } else if (done) {
        p.onExam((d) => ({
          ...d,
          vitalsDraft: draftAfterSave(d.vitalsDraft),
          vitalsSavedAt: new Date().toISOString(),
          vitalsSavedFields: fields,
        }));
        setTried(false);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  /* Anthropometry */
  const bmi = bmiOf(v.x.vitals.weight, v.x.vitals.height);
  const whtr = whtrOf(v.x.vitals.waist, v.x.vitals.height);
  const muac = v.exam.entries["ex.general.nutrition"]?.attrs?.muac;

  /* Panels */
  const panels = v.exam.panels ?? {};
  const bpText = (b: { sbp?: number; dbp?: number } | undefined) =>
    b?.sbp !== undefined && b.dbp !== undefined ? `${b.sbp}/${b.dbp}` : "";
  const readBp = (s: string): { value?: Bp; error?: string } => {
    const r = parseBp(s);
    if (!r) return {};
    if ("error" in r) return { error: r.error };
    if (!isPlausible(v.ecat, "bp_systolic", r.sbp) || !isPlausible(v.ecat, "bp_diastolic", r.dbp))
      return { error: "Outside the usual range: check the reading" };
    return { value: r };
  };
  const readFlow = (s: string): { value?: number; error?: string } => {
    if (!s.trim()) return {};
    const n = parseDecimal(s);
    if (n === null) return { error: "Type a number" };
    return n > 0 && n <= 1000 ? { value: n } : { error: "Outside the usual range: check it" };
  };
  const pef = pefPercent(v.x);
  // The ketone panel's fields come from the catalogue (EC-7): blood in mmol/L, urine as a strip.
  const ketoneFields =
    (
      v.ecat.data.vital_signs.panels as {
        id: string;
        fields?: {
          id: string;
          label: string;
          plausible?: [number, number];
          options?: { id: string; label: string }[];
        }[];
      }[]
    ).find((pn) => pn.id === "vs.ketones")?.fields ?? [];
  const blood = ketoneFields.find((f) => f.id === "blood");
  const urine = ketoneFields.find((f) => f.id === "urine");
  const readKetone = (t: string): { value?: number; error?: string } => {
    if (!t.trim()) return {};
    const n = parseDecimal(t);
    if (n === null) return { error: "Type a number" };
    const [lo, hi] = blood?.plausible ?? [0, 12];
    return n >= lo && n <= hi ? { value: n } : { error: "Outside the usual range: check it" };
  };
  const panel = (id: PanelId, title: string, body: ReactNode) => (
    <details open={p.openPanel === id} className="border-border rounded-md border">
      <summary
        className={cn(
          "text-body-s text-foreground focus-visible:shadow-focus cursor-pointer rounded-md px-3 py-2 font-medium outline-none",
          TAP,
        )}
      >
        {title}
      </summary>
      <div className="flex flex-col gap-2.5 px-3 pb-3">{body}</div>
    </details>
  );

  return (
    <div className="flex flex-col gap-4" data-slot="vitals-card" onKeyDown={advance}>
      {/* Vital signs */}
      <section
        aria-labelledby={`${uid}-h`}
        className="border-border bg-card rounded-lg border max-sm:rounded-2xl"
      >
        <header className="border-border bg-muted/40 border-b px-4 py-3 max-sm:px-3.5">
          <h3 id={`${uid}-h`} className="text-heading-s text-foreground">
            Vital signs
          </h3>
        </header>
        <div className="flex flex-col gap-3 px-4 py-2 max-sm:px-3.5">
          <table className="w-full border-collapse max-sm:block">
            <thead className="max-sm:hidden">
              <tr>
                <th scope="col" className="w-40">
                  <span className="sr-only">Measurement</span>
                </th>
                <th
                  scope="col"
                  className="text-overline text-muted-foreground w-36 pt-2 pb-1 text-left uppercase"
                >
                  {p.triage.label}
                </th>
                <th
                  scope="col"
                  className="text-overline text-muted-foreground pt-2 pb-1 text-left uppercase"
                >
                  Now
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              <Row
                label="Blood pressure"
                htmlFor={idOf("bp")}
                prev={p.triage.label}
                previous={
                  <>
                    {p.triage.values.sbp !== null && p.triage.values.dbp !== null ? (
                      <span className="text-body-s text-foreground font-mono tabular-nums">
                        {`${p.triage.values.sbp}/${p.triage.values.dbp}`}
                      </span>
                    ) : (
                      <span className="text-body-s text-muted-foreground">Not recorded</span>
                    )}
                    <Score q={prevScore("systolic_bp")} />
                  </>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  {field("bp", "Blood pressure", {
                    placeholder: "118/76",
                    wide: true,
                    extra: V.arm && V.position ? undefined : defaults,
                  })}
                  <Unit>mmHg</Unit>
                  <Score q={nowScore("systolic_bp")} />
                </div>
                {V.bp?.trim() ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Segmented
                      label="Arm"
                      options={qual<"right" | "left">("vs.bp", "arm")}
                      value={defaults.arm}
                      onPick={(a) => toggle("arm", a)}
                      disabled={off}
                    />
                    <Segmented
                      label="Position"
                      options={qual<"lying" | "sitting" | "standing">("vs.bp", "position")}
                      value={defaults.position}
                      onPick={(a) => toggle("position", a)}
                      disabled={off}
                    />
                    <Segmented
                      label="Cuff"
                      options={qual<NonNullable<VitalsDraft["cuff"]>>("vs.bp", "cuff")}
                      value={V.cuff}
                      onPick={(a) => toggle("cuff", a)}
                      disabled={off}
                    />
                  </div>
                ) : null}
                {checks("bp")}
              </Row>

              <Row
                label="Pulse"
                htmlFor={idOf("pulse")}
                prev={p.triage.label}
                previous={prevNum(p.triage.values.pulse, "pulse")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {field("pulse", "Pulse")}
                  <Unit>/min</Unit>
                  <Score q={nowScore("pulse")} />
                </div>
                {V.pulse?.trim() ? (
                  <div role="group" aria-label="Rhythm" className="flex flex-wrap gap-1.5">
                    {qual<NonNullable<VitalsDraft["rhythm"]>>("vs.pulse", "rhythm").map((o) => (
                      <Chip
                        key={o.id}
                        selected={V.rhythm === o.id}
                        disabled={off}
                        onPress={() => toggle("rhythm", o.id)}
                      >
                        {o.label}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                {checks("pulse")}
                {V.rhythm && V.rhythm !== "regular" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`${uid}-apex`} className="text-caption text-muted-foreground">
                      Apical count (60 s)
                    </label>
                    <Input
                      id={`${uid}-apex`}
                      data-advance=""
                      value={V.apex ?? ""}
                      inputMode="decimal"
                      autoComplete="off"
                      maxLength={8}
                      disabled={off}
                      onChange={(e) => setDraft((vd) => ({ ...vd, apex: e.target.value }))}
                      className={cn(NUM, INVALID)}
                    />
                    <Unit>/min</Unit>
                    {(() => {
                      const apex = parseDecimal(V.apex);
                      return apex !== null && x.pulse !== null ? (
                        <span className="text-body-s text-foreground" aria-live="polite">
                          {`Apex–radial deficit `}
                          <span className="font-mono tabular-nums">{apex - x.pulse}</span>
                          {`/min`}
                        </span>
                      ) : null;
                    })()}
                  </div>
                ) : null}
              </Row>

              <Row
                label="Respiratory rate"
                htmlFor={idOf("rr")}
                prev={p.triage.label}
                previous={prevNum(p.triage.values.rr, "respiratory_rate")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {field("rr", "Respiratory rate")}
                  <Unit>/min</Unit>
                  <Score q={nowScore("respiratory_rate")} />
                </div>
                {checks("rr")}
              </Row>

              <Row
                label="SpO₂"
                htmlFor={idOf("spo2")}
                prev={p.triage.label}
                previous={prevNum(p.triage.values.spo2, "spo2")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {field("spo2", "SpO₂")}
                  <Unit>%</Unit>
                  {scale2(v.exam) ? <Pill tone="neutral">Scale 2</Pill> : null}
                  <Score q={nowScore("spo2")} />
                </div>
                {scale2(v.exam) ? (
                  <p className="text-caption text-muted-foreground">
                    Scale 2: target 88–92% recorded
                  </p>
                ) : null}
                {checks("spo2")}
              </Row>

              <Row
                label="Temperature"
                htmlFor={idOf("temp")}
                prev={p.triage.label}
                previous={prevNum(p.triage.values.temp, "temperature", 1)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {field("temp", "Temperature")}
                  <Unit>°C</Unit>
                  <Score q={nowScore("temperature")} />
                </div>
                {V.temp?.trim() ? (
                  <div role="group" aria-label="Site" className="flex flex-wrap gap-1.5">
                    {qual<NonNullable<VitalsDraft["site"]>>("vs.temp", "site").map((o) => (
                      <Chip
                        key={o.id}
                        selected={V.site === o.id}
                        disabled={off}
                        onPress={() => toggle("site", o.id)}
                      >
                        {o.label}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                {checks("temp")}
              </Row>

              <Row
                label="Glucose"
                htmlFor={idOf("glucose")}
                prev={p.triage.label}
                previous={prevNum(p.triage.values.glucose, undefined, 1)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {field("glucose", "Glucose")}
                  <Segmented
                    label="Glucose unit"
                    options={[
                      { id: "mmol/L" as const, label: "mmol/L" },
                      { id: "mg/dL" as const, label: "mg/dL" },
                    ]}
                    value={V.glucoseUnit ?? "mmol/L"}
                    onPick={(u) => setDraft((vd) => ({ ...vd, glucoseUnit: u }))}
                    disabled={off}
                  />
                  {/* A meter above or below its range (EC-6): recorded as it reads, no number. */}
                  <span role="group" aria-label="Meter reads" className="flex gap-1.5">
                    {(["HI", "LO"] as const).map((r) => (
                      <Chip
                        key={r}
                        selected={x.glucoseReads === r}
                        disabled={off}
                        onPress={() => setText("glucose", x.glucoseReads === r ? "" : r)}
                      >
                        {r}
                      </Chip>
                    ))}
                  </span>
                </div>
                <Segmented
                  label="Glucose context"
                  options={qual<NonNullable<VitalsDraft["glucoseContext"]>>(
                    "vs.glucose",
                    "context",
                  )}
                  value={V.glucoseContext}
                  onPick={(a) => toggle("glucoseContext", a)}
                  disabled={off}
                />
                {V.glucose?.trim() && !V.glucoseContext ? (
                  <Caution>Choose random, fasting or 2 hours after food or glucose.</Caution>
                ) : null}
                {checks("glucose")}
              </Row>

              <Row
                label="Air or oxygen"
                prev={p.triage.label}
                previous={
                  <>
                    {p.triage.oxygen ? (
                      <span className="text-body-s text-foreground">
                        {OXYGEN[p.triage.oxygen] ?? p.triage.oxygen}
                      </span>
                    ) : (
                      <span className={cn("text-body-s", AMBER)}>Not recorded</span>
                    )}
                    <Score q={prevScore("supplemental_oxygen")} />
                  </>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  {oxygenText
                    ? goLine(oxygenText, oxygenPart, false)
                    : notRecorded(oxygenPart, "air or oxygen")}
                  <Score q={nowScore("supplemental_oxygen")} />
                </div>
              </Row>

              <Row
                label="Consciousness"
                prev={p.triage.label}
                previous={
                  <>
                    {p.triage.acvpu ? (
                      <span className="text-body-s text-foreground">
                        {ACVPU[p.triage.acvpu] ?? p.triage.acvpu}
                      </span>
                    ) : (
                      <span className={cn("text-body-s", AMBER)}>Not recorded</span>
                    )}
                    <Score q={prevScore("consciousness")} />
                  </>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  {consText
                    ? goLine(consText, "consciousness", !acvpu)
                    : notRecorded("consciousness", "consciousness")}
                  <Score q={nowScore("consciousness")} />
                </div>
                {suggestion && consText ? (
                  <p className="text-caption text-muted-foreground">
                    {`Suggested from the GCS: ${ACVPU[suggestion]}. You decide.`}
                  </p>
                ) : null}
              </Row>
            </tbody>
          </table>

          <div aria-live="polite" className="flex flex-col gap-1.5 pb-2">
            <p className="flex flex-wrap items-center gap-2">
              <Pill tone={n2.tone}>{n2.text}</Pill>
            </p>
            {[...n2.threes, ...n2.messages].map((m) => (
              <p key={m} className="text-body-s text-foreground">
                {m}
              </p>
            ))}
            {n2.missing ? <p className={cn("text-body-s", AMBER)}>{n2.missing}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 pb-3">
            {editable && p.act && !savedAt ? (
              <Button onClick={save} disabled={saving || queued} className={TAP}>
                {saving ? "Saving…" : "Save as a new set"}
              </Button>
            ) : null}
            <div role="status" aria-live="polite" className="min-w-0">
              {savedAt ? (
                <p className="text-body-s inline-flex items-center gap-1.5 text-teal-800">
                  <CheckIcon aria-hidden className="size-3.5 shrink-0" />
                  {`Saved at ${p.time(savedAt)} as a new set`}
                </p>
              ) : queued ? (
                <Caution>Pending: this set saves when the connection is back.</Caution>
              ) : failed ? (
                <Caution>The set was not saved. Try again.</Caution>
              ) : missing ? (
                <Caution>{toSaveText(missing)}</Caution>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Anthropometry */}
      <section
        aria-labelledby={`${uid}-a`}
        className="border-border bg-card flex flex-col gap-3 rounded-lg border px-4 py-3 max-sm:rounded-2xl max-sm:px-3.5"
      >
        <h3 id={`${uid}-a`} className="text-heading-s text-foreground">
          Anthropometry
        </h3>
        {(["weight", "height"] as const).map((f) => {
          const label = f === "weight" ? "Weight" : "Height";
          const how = f === "weight" ? "weightMethod" : "heightMethod";
          return (
            <div key={f} className="flex flex-col gap-1.5">
              <FieldRow label={label} group={false}>
                {field(f, label)}
                <Unit>{f === "weight" ? "kg" : "cm"}</Unit>
                <Segmented
                  label={`${label}: how obtained`}
                  options={qual<NonNullable<VitalsDraft[typeof how]>>(`vs.${f}`, "method")}
                  value={V[how]}
                  onPick={(m) => toggle(how, m)}
                  disabled={off}
                />
              </FieldRow>
              {checks(f)}
            </div>
          );
        })}
        <FieldRow label="BMI" group={false}>
          <span className="text-body-s text-foreground font-mono tabular-nums">{bmi ?? "–"}</span>
          <Unit>kg/m²</Unit>
          <ResultPill r={v.results.get("bmi_who")} />
        </FieldRow>
        <div className="flex flex-col gap-1.5">
          <FieldRow label="Waist" group={false}>
            {field("waist", "Waist")}
            <Unit>cm</Unit>
            <ResultPill r={v.results.get("waist_risk")} />
          </FieldRow>
          {checks("waist")}
        </div>
        <FieldRow label="Waist-to-height" group={false}>
          <span className="text-body-s text-foreground font-mono tabular-nums">{whtr ?? "–"}</span>
          <ResultPill r={v.results.get("whtr_band")} />
        </FieldRow>
        <FieldRow label="MUAC" group={false}>
          {typeof muac === "number" ? (
            <>
              <span className="text-body-s text-foreground font-mono tabular-nums">{muac}</span>
              <Unit>cm (from General)</Unit>
            </>
          ) : (
            <span className="text-body-s text-muted-foreground">Not recorded</span>
          )}
          <ResultPill r={v.results.get("muac_uganda_imam")} />
          <Button
            variant="link"
            size="sm"
            onClick={() => p.onGo("general", nutritionPart)}
            className={cn(TAP, LINK)}
          >
            Nutrition in General
          </Button>
        </FieldRow>
      </section>

      {/* More measurements */}
      <section aria-label="More measurements" className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={more}
          aria-controls={`${uid}-more`}
          onClick={() => setMore(!more)}
          className={cn(
            "text-body-s text-foreground focus-visible:shadow-focus hover:bg-muted inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-1 font-medium outline-none",
            TAP,
          )}
        >
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "ease-expo-out size-4 transition-transform duration-150 motion-reduce:transition-none",
              !more && "-rotate-90",
            )}
          />
          More measurements
        </button>
        <div id={`${uid}-more`} hidden={!more} className="flex flex-col gap-2">
          {panel(
            "postural",
            "Lying and standing BP",
            <>
              <PanelInput
                label="Lying"
                unit="mmHg"
                bp
                initial={bpText(panels.postural?.lying)}
                read={readBp}
                onValue={(b) => setPanel("postural", { lying: b })}
                disabled={off}
              />
              <PanelInput
                label="Standing, 1 minute"
                unit="mmHg"
                bp
                initial={bpText(panels.postural?.standing_1min)}
                read={readBp}
                onValue={(b) => setPanel("postural", { standing_1min: b })}
                disabled={off}
              />
              <PanelInput
                label="Standing, 3 minutes"
                unit="mmHg"
                bp
                initial={bpText(panels.postural?.standing_3min)}
                read={readBp}
                onValue={(b) => setPanel("postural", { standing_3min: b })}
                disabled={off}
              />
              <FieldRow label="Symptoms on standing" group={false}>
                <Segmented
                  label="Symptoms on standing"
                  options={[
                    { id: "yes" as const, label: "Yes" },
                    { id: "no" as const, label: "No" },
                  ]}
                  value={panels.postural?.symptoms}
                  onPick={(a) =>
                    setPanel("postural", {
                      symptoms: panels.postural?.symptoms === a ? undefined : a,
                    })
                  }
                  disabled={off}
                />
              </FieldRow>
              <ResultPill r={v.results.get("orthostatic_hypotension")} />
            </>,
          )}
          {panel(
            "bothArms",
            "BP in both arms",
            <>
              <PanelInput
                label="Right arm"
                unit="mmHg"
                bp
                initial={bpText(panels.bothArms?.right)}
                read={readBp}
                onValue={(b) => setPanel("bothArms", { right: b })}
                disabled={off}
              />
              <PanelInput
                label="Left arm"
                unit="mmHg"
                bp
                initial={bpText(panels.bothArms?.left)}
                read={readBp}
                onValue={(b) => setPanel("bothArms", { left: b })}
                disabled={off}
              />
              <FieldRow label="On repeat" group={false}>
                <Chip
                  selected={!!panels.bothArms?.repeated}
                  disabled={off}
                  onPress={() => setPanel("bothArms", { repeated: !panels.bothArms?.repeated })}
                >
                  Repeated
                </Chip>
              </FieldRow>
              <ResultPill r={v.results.get("inter_arm_difference")} />
            </>,
          )}
          {panel(
            "peakFlow",
            "Peak flow",
            <>
              <PanelInput
                label="Best of three"
                unit="L/min"
                initial={panels.peakFlow?.best !== undefined ? String(panels.peakFlow.best) : ""}
                read={readFlow}
                onValue={(n) => setPanel("peakFlow", { best: n })}
                disabled={off}
              />
              <PanelInput
                label="Reference"
                unit="L/min"
                initial={
                  panels.peakFlow?.reference !== undefined ? String(panels.peakFlow.reference) : ""
                }
                read={readFlow}
                onValue={(n) => setPanel("peakFlow", { reference: n })}
                disabled={off}
              />
              <FieldRow label="Reference is" group={false}>
                <Segmented
                  label="Reference is"
                  options={[
                    { id: "personal_best" as const, label: "Personal best" },
                    { id: "predicted" as const, label: "Predicted" },
                  ]}
                  value={panels.peakFlow?.referenceKind}
                  onPick={(k) =>
                    setPanel("peakFlow", {
                      referenceKind: panels.peakFlow?.referenceKind === k ? undefined : k,
                    })
                  }
                  disabled={off}
                />
              </FieldRow>
              <p aria-live="polite" className="text-body-s text-foreground">
                {pef !== null
                  ? `${pef}% of ${panels.peakFlow?.referenceKind === "predicted" ? "predicted" : panels.peakFlow?.referenceKind === "personal_best" ? "personal best" : "the reference"}`
                  : "Enter the best of three and a reference for the percentage."}
              </p>
              <ResultPill r={v.results.get("acute_asthma_severity")} />
            </>,
          )}
          {blood && urine
            ? panel(
                "ketones",
                "Ketones",
                <>
                  <PanelInput
                    label={blood.label}
                    unit="mmol/L"
                    initial={
                      panels.ketones?.blood !== undefined ? String(panels.ketones.blood) : ""
                    }
                    read={readKetone}
                    onValue={(n) => setPanel("ketones", { blood: n })}
                    disabled={off}
                  />
                  <FieldRow label={urine.label}>
                    {(urine.options ?? []).map((o) => (
                      <Chip
                        key={o.id}
                        selected={panels.ketones?.urine === o.id}
                        disabled={off}
                        onPress={() =>
                          setPanel("ketones", {
                            urine:
                              panels.ketones?.urine === o.id
                                ? undefined
                                : (o.id as NonNullable<Panels["ketones"]>["urine"]),
                          })
                        }
                      >
                        {o.label}
                      </Chip>
                    ))}
                  </FieldRow>
                  <ResultPill r={v.results.get("ketone_band")} />
                </>,
              )
            : null}
        </div>
      </section>
    </div>
  );
}
