import type { ExamAttribute, ExamCatalogue, ExamItem, MirrorTarget, OptionRef } from "./catalogue";
import type { AttrValue, Blocks, ExamDraft, ExamEntry, NotExamined } from "./payload";

import { appliesToSex, shownWhenParts } from "./catalogue";

/**
 * The examination answer model (PROMPT-CLERKING-EXAM-V2 §7 answers.ts). Pure and immutable: every
 * function returns a new draft. An item is unrecorded (absent), negative, positive or not examined;
 * unrecorded is never written as negative (E2). Mirrors and shared attributes write the one owner
 * (E3). A stepper's start value is only where it begins; nothing is stored until it is touched (E8).
 */

export type EntryState = ExamEntry["state"];
type Draft = ExamDraft;

const clone = (d: Draft): Draft => ({
  ...d,
  entries: { ...d.entries },
  blocks: { ...d.blocks },
  ...(d.systems ? { systems: { ...d.systems } } : {}),
});

/** The item's words for its two states ("Absent/Present", "Central/Deviated", "None/In place"). */
export function pairWords(item: ExamItem): { negative: string; positive: string } | null {
  const r = item.response;
  return "negative_label" in r ? { negative: r.negative_label, positive: r.positive_label } : null;
}

/** The attributes on screen for an entry: a choice option's own, then `shown_when` and sex. */
export function visibleAttributes(
  item: ExamItem,
  entry: ExamEntry | undefined,
  sex: "female" | "male" | null = null,
): ExamAttribute[] {
  const list =
    item.response.type === "choice"
      ? (item.response.options.find((o) => o.id === entry?.choice)?.attributes ?? [])
      : (item.attributes ?? []);
  const attrs = entry?.attrs ?? {};
  // A normal finding shows only the attributes recorded on any state (EC-7).
  const normal = entry?.state === "negative" && item.response.type !== "choice";
  return list.filter((a) => {
    if (!appliesToSex(a, sex) || (normal && !a.any_state)) return false;
    if (!a.shown_when) return true;
    return shownWhenParts(a.shown_when).every((sw) => {
      const v = attrs[sw.attribute];
      return sw.any_of.some((o) => (Array.isArray(v) ? v.includes(o) : v === o));
    });
  });
}

/** Drop attribute values that are no longer shown (called on every write; E8 "hidden attributes
 *  are dropped on save"). Shared and mirrored values never live on the entry. */
function prune(item: ExamItem, entry: ExamEntry): ExamEntry {
  if (!entry.attrs) return entry;
  let shown = new Set(visibleAttributes(item, entry).map((a) => a.id));
  // A hidden parent hides its children: repeat until stable.
  for (;;) {
    const attrs = Object.fromEntries(Object.entries(entry.attrs!).filter(([k]) => shown.has(k)));
    const next = new Set(visibleAttributes(item, { ...entry, attrs }).map((a) => a.id));
    if (next.size === shown.size) {
      const { attrs: _dropped, ...rest } = entry;
      return Object.keys(attrs).length ? { ...rest, attrs } : rest;
    }
    shown = next;
  }
}

function put(d: Draft, itemId: string, entry: ExamEntry | undefined): Draft {
  const out = clone(d);
  if (entry) out.entries[itemId] = entry;
  else delete out.entries[itemId];
  return out;
}

/** Tap a state button. Tapping the recorded state again clears the item (tap-again-clears). A
 *  negative answer keeps no attributes. */
export function setState(
  cat: ExamCatalogue,
  d: Draft,
  itemId: string,
  state: "negative" | "positive",
): Draft {
  const item = cat.item(itemId);
  if (!item || item.response.type === "link") return d;
  const cur = d.entries[itemId];
  if (cur?.state === state) return put(d, itemId, undefined);
  // Normal keeps only what is recorded on any state (how the fundus was looked at, EC-7).
  return put(d, itemId, prune(item, { state, ...(cur?.attrs ? { attrs: cur.attrs } : {}) }));
}

/** Choose a choice item's option; the same option again clears. Expected options record negative. */
export function setChoice(cat: ExamCatalogue, d: Draft, itemId: string, optionId: string): Draft {
  const item = cat.item(itemId);
  if (item?.response.type !== "choice") return d;
  const o = item.response.options.find((x) => x.id === optionId);
  if (!o) return d;
  const cur = d.entries[itemId];
  if (cur?.choice === optionId) return put(d, itemId, undefined);
  return put(d, itemId, {
    state: o.expected ? "negative" : "positive",
    choice: optionId,
  });
}

function mirrorOwnerHas(d: Draft, t: MirrorTarget): boolean {
  const e = d.entries[t.item];
  if (!e || e.state !== "positive") return false;
  if (t.attrs) return Object.entries(t.attrs).every(([k, v]) => optionHas(e.attrs?.[k], v));
  if (!t.attribute) return true;
  return optionHas(e.attrs?.[t.attribute], t.option!);
}

const optionHas = (v: AttrValue | undefined, o: string) =>
  Array.isArray(v) ? v.includes(o) : v === o;

/** The value of an attribute as the clinician sees it: its own value, a shared attribute's owner
 *  value, and mirrored options read from their owners. */
export function readAttr(
  cat: ExamCatalogue,
  d: Draft,
  itemId: string,
  attributeId: string,
): AttrValue | undefined {
  const a = cat.attribute(itemId, attributeId);
  if (!a) return undefined;
  if (a.kind === "shared" && a.shared_with) {
    const owner = d.entries[a.shared_with.item];
    return owner?.state === "positive" ? owner.attrs?.[a.shared_with.attribute] : undefined;
  }
  const own = d.entries[itemId]?.attrs?.[attributeId];
  const mirrored = (a.options ?? [])
    .filter(
      (o) => o.mirror_of && cat.mirror({ item: itemId, attribute: attributeId, option: o.id }),
    )
    .filter((o) => {
      const edge = cat.mirror({ item: itemId, attribute: attributeId, option: o.id })!;
      return edge.to.some((t) => mirrorOwnerHas(d, t));
    })
    .map((o) => o.id);
  if (!mirrored.length) return own;
  if (a.kind === "one") return own ?? mirrored[0];
  const base = Array.isArray(own) ? own : own === undefined ? [] : [String(own)];
  return [...new Set([...base, ...mirrored])];
}

function toggleIn(v: AttrValue | undefined, o: string): string[] {
  const arr = Array.isArray(v) ? v : v === undefined ? [] : [String(v)];
  return arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o];
}

/** Write one option on its owner: added, the owner becomes positive; removed, an owner left with
 *  no attributes is cleared (unrecorded), never inferred absent. */
function writeOwnerOption(cat: ExamCatalogue, d: Draft, t: MirrorTarget, on: boolean): Draft {
  const owner = cat.item(t.item);
  if (!owner) return d;
  const cur = d.entries[t.item];
  const positive = cur?.state === "positive";
  if (!t.attribute && !t.attrs) {
    // The whole owner item is the finding (field defect → visual fields).
    if (on) return positive ? d : put(d, t.item, { state: "positive" });
    return positive && !cur!.attrs ? put(d, t.item, undefined) : d;
  }
  const attrs: Record<string, AttrValue> = { ...(positive ? cur!.attrs : {}) };
  if (t.attrs) {
    for (const [k, v] of Object.entries(t.attrs))
      if (on) attrs[k] = v;
      else if (attrs[k] === v) delete attrs[k];
  } else {
    const a = cat.attribute(t.item, t.attribute!);
    const v = attrs[t.attribute!];
    if (a?.kind === "one") {
      if (on) attrs[t.attribute!] = t.option!;
      else if (v === t.option) delete attrs[t.attribute!];
    } else {
      const next = optionHas(v, t.option!) === on ? v : toggleIn(v, t.option!);
      if (Array.isArray(next) && !next.length) delete attrs[t.attribute!];
      else if (next !== undefined) attrs[t.attribute!] = next;
    }
  }
  if (!on && !Object.keys(attrs).length) return put(d, t.item, undefined);
  return put(d, t.item, prune(owner, { state: "positive", attrs }));
}

/**
 * Tap an option of a `one`, `many` or `zones` attribute, or set a `number` or `scale`. `one` taps
 * again to clear; `many` toggles. A mirrored option writes its owner and is not stored here; a
 * read-only mirror (several owners) does nothing (the desk opens the owner). A `shared` attribute
 * writes the owner item's attribute. Setting an attribute on an unrecorded item records it
 * positive (a property implies the finding).
 */
export function setAttr(
  cat: ExamCatalogue,
  d: Draft,
  itemId: string,
  attributeId: string,
  value: string | number | null,
): Draft {
  const item = cat.item(itemId);
  const a = cat.attribute(itemId, attributeId);
  if (!item || !a) return d;

  if (a.kind === "shared" && a.shared_with && typeof value === "string") {
    const { item: ownerId, attribute } = a.shared_with;
    const owner = cat.item(ownerId)!;
    const cur = d.entries[ownerId];
    const next = toggleIn(cur?.state === "positive" ? cur.attrs?.[attribute] : undefined, value);
    const attrs = { ...(cur?.state === "positive" ? cur.attrs : {}), [attribute]: next };
    if (!next.length) delete attrs[attribute];
    // Emptying the shared signs clears the owner rather than inferring "not increased" (E2).
    if (!Object.keys(attrs).length) return touch(cat, put(d, ownerId, undefined), itemId);
    return touch(cat, put(d, ownerId, prune(owner, { state: "positive", attrs })), itemId);
  }

  if (typeof value === "string") {
    const edge = cat.mirror({ item: itemId, attribute: attributeId, option: value });
    if (edge) {
      if (edge.readOnly) return d;
      const now = readAttr(cat, d, itemId, attributeId);
      const on = !optionHas(now, value);
      return touch(cat, writeOwnerOption(cat, d, edge.to[0]!, on), itemId);
    }
  }

  const cur = d.entries[itemId];
  const base: ExamEntry = cur && cur.state !== "not_examined" ? { ...cur } : { state: "positive" };
  if (item.response.type === "choice" && !base.choice) return d; // a choice's attributes follow its option
  const attrs = { ...(base.attrs ?? {}) };
  if (value === null) delete attrs[attributeId];
  else if (a.kind === "one") {
    if (attrs[attributeId] === value) delete attrs[attributeId];
    else attrs[attributeId] = String(value);
  } else if (a.kind === "many" || a.kind === "zones") {
    const next = toggleIn(attrs[attributeId], String(value));
    if (next.length) attrs[attributeId] = next;
    else delete attrs[attributeId];
  } else if (typeof value === "number") {
    const lo = a.min ?? a.range?.[0] ?? -Infinity;
    const hi = a.max ?? a.range?.[1] ?? Infinity;
    attrs[attributeId] = Math.min(hi, Math.max(lo, value));
  }
  const state: EntryState =
    item.response.type === "choice" || (a.any_state && cur?.state === "negative")
      ? base.state
      : "positive";
  return put(d, itemId, prune(item, { ...base, state, attrs }));
}

/** A mirror or shared write leaves the reader item recorded (its row shows what was set). */
function touch(cat: ExamCatalogue, d: Draft, itemId: string): Draft {
  const cur = d.entries[itemId];
  if (cur) return d;
  const item = cat.item(itemId)!;
  return put(d, itemId, prune(item, { state: "positive" }));
}

/** A stepper's shown value: the stored one, else its start (never stored until touched, E8). */
export function stepperValue(
  a: ExamAttribute,
  v: AttrValue | undefined,
): { value: number; touched: boolean } {
  return typeof v === "number"
    ? { value: v, touched: true }
    : { value: a.start ?? a.min ?? 0, touched: false };
}

/* ─── Not examined, Clear, Everything else normal ─────────────────── */

export function setNotExamined(d: Draft, itemId: string, reason: NotExamined | null): Draft {
  return put(d, itemId, reason ? { state: "not_examined", reason } : undefined);
}

export function setSystemNotExamined(
  d: Draft,
  systemId: string,
  reason: NotExamined | null,
): Draft {
  const out = clone(d);
  out.systems = { ...(d.systems ?? {}) };
  if (reason) out.systems[systemId] = { notExamined: reason };
  else delete out.systems[systemId];
  return out;
}

export interface Undo {
  entries: Record<string, ExamEntry | undefined>;
}

/** Clear a system: removes its entries (links hold none). Returns what to restore on undo. */
export function clearSystem(
  cat: ExamCatalogue,
  d: Draft,
  systemId: string,
): { draft: Draft; undo: Undo } {
  const undo: Undo = { entries: {} };
  const out = clone(d);
  for (const it of cat.itemsOf(systemId))
    if (it.id in out.entries) {
      undo.entries[it.id] = out.entries[it.id];
      delete out.entries[it.id];
    }
  if (out.systems?.[systemId]) {
    out.systems = { ...out.systems };
    delete out.systems[systemId];
  }
  return { draft: out, undo };
}

export function applyUndo(d: Draft, undo: Undo): Draft {
  const out = clone(d);
  for (const [id, e] of Object.entries(undo.entries)) {
    if (e) out.entries[id] = e;
    else delete out.entries[id];
  }
  return out;
}

/** Items "Everything else normal" may answer (E2): unrecorded presence, test and state items, and
 *  choice items with exactly one expected option. Never links, devices, classified or measured
 *  items, blocks, oxygen (it always needs an explicit answer), items hidden for this sex, or
 *  anything behind an incomplete gate. */
export function normalAnswerFor(item: ExamItem): Pick<ExamEntry, "state" | "choice"> | null {
  const r = item.response;
  if (r.type === "presence" || r.type === "test" || r.type === "state")
    return { state: "negative" };
  if (r.type === "choice") {
    if (item.id === "ex.general.oxygen") return null;
    const expected = r.options.filter((o) => o.expected);
    return expected.length === 1 ? { state: "negative", choice: expected[0]!.id } : null;
  }
  return null;
}

export function everythingElseNormal(
  cat: ExamCatalogue,
  d: Draft,
  systemId: string,
  opts: { partId?: string; sex: "female" | "male" | null; gateOpen?: boolean },
): { draft: Draft; set: string[]; undo: Undo } {
  const system = cat.system(systemId);
  if (!system || (system.gate && !opts.gateOpen))
    return { draft: d, set: [], undo: { entries: {} } };
  const out = clone(d);
  const set: string[] = [];
  for (const it of cat.itemsOf(systemId, opts.partId)) {
    if (it.id in out.entries || !appliesToSex(it, opts.sex)) continue;
    const answer = normalAnswerFor(it);
    if (!answer) continue;
    out.entries[it.id] = { ...answer };
    set.push(it.id);
  }
  return {
    draft: out,
    set,
    undo: { entries: Object.fromEntries(set.map((id) => [id, undefined])) },
  };
}

/* ─── Blocks ──────────────────────────────────────────────────────── */

export function setBlocks(d: Draft, patch: Partial<Blocks>): Draft {
  const out = clone(d);
  out.blocks = { ...d.blocks, ...patch };
  for (const [k, v] of Object.entries(patch))
    if (v === undefined) delete (out.blocks as Record<string, unknown>)[k];
  return out;
}

type Side = "R" | "L";
/** Set one grid cell; the same value again clears it. */
export function setGridCell<K extends "power" | "reflexes" | "pulses">(
  d: Draft,
  grid: K,
  row: string,
  side: Side,
  value: NonNullable<NonNullable<Blocks[K]>[string]>[Side],
): Draft {
  const table = { ...(d.blocks[grid] ?? {}) } as Record<string, Partial<Record<Side, unknown>>>;
  const cell = { ...(table[row] ?? {}) };
  if (cell[side] === value) delete cell[side];
  else cell[side] = value;
  if (Object.keys(cell).length) table[row] = cell;
  else delete table[row];
  return setBlocks(d, { [grid]: Object.keys(table).length ? table : undefined } as Partial<Blocks>);
}

/** "All 5", "All 2", "All present": fills only the cells not yet recorded. */
export function fillGrid<K extends "power" | "reflexes" | "pulses">(
  d: Draft,
  grid: K,
  rows: readonly string[],
  value: NonNullable<NonNullable<Blocks[K]>[string]>[Side],
): Draft {
  const table = { ...(d.blocks[grid] ?? {}) } as Record<string, Partial<Record<Side, unknown>>>;
  for (const row of rows) {
    const cell = { ...(table[row] ?? {}) };
    for (const s of ["R", "L"] as const) if (cell[s] === undefined) cell[s] = value;
    table[row] = cell;
  }
  return setBlocks(d, { [grid]: table } as Partial<Blocks>);
}

/* ─── Reading ─────────────────────────────────────────────────────── */

/** Is an option (own or mirrored) present on an item? */
export function hasOption(cat: ExamCatalogue, d: Draft, ref: OptionRef): boolean {
  if (d.entries[ref.item]?.state !== "positive") {
    const edge = cat.mirror(ref);
    return !!edge && edge.to.some((t) => mirrorOwnerHas(d, t));
  }
  return optionHas(readAttr(cat, d, ref.item, ref.attribute), ref.option);
}

/** An item's entry as the engines read it: a link reads its owner. */
export function entryOf(cat: ExamCatalogue, d: Draft, itemId: string): ExamEntry | undefined {
  const item = cat.item(itemId);
  if (item?.response.type === "link") return d.entries[item.response.owner];
  return d.entries[itemId];
}
