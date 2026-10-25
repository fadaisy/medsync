import type { Entry, Level, Payload } from "./content";

/**
 * Pharmacy Phase 3: the interaction check (IX-1 to IX-10). Pure over a snapshot of the patient's current medicines
 * and the signed pack. It never fires an entry that is not in force (Law 3), and never computes a dose (Law 8).
 */

export type CurrentSource = "active_line" | "charted" | "supplied" | "admission_continue";
export interface CurrentMed {
  medicineId: string;
  source: CurrentSource;
  /** When the patient started it, or the dose was charted or supplied. */
  since: Date;
}

export interface EarlierAnswer {
  entryId: string;
  key: string;
  answeredAt: Date;
  cadre: string;
  reason: string;
}

export interface Fired {
  entryId: string;
  key: string;
  version: number;
  source: string | null;
  level: Exclude<Level, "hidden">;
  severity: Payload<"interaction_pair">["severity"];
  adding: string;
  /** The other side: being added too, or what the patient is already taking. */
  other: string;
  otherSince: Date | null;
  otherSource: CurrentSource | "adding";
  effect: string;
  management: string;
  restricted: Payload<"interaction_pair">["restricted"];
  /** IX-7: shown as a Note naming this earlier answer. */
  suppressedBy: EarlierAnswer | null;
}

export interface InteractionInput {
  entries: readonly Entry<"interaction_pair">[];
  /** The signed alert levels; null: nothing fires (IX-4). */
  levels: Payload<"alert_levels"> | null;
  /** IX-2, already windowed by the signed look-backs by the caller. */
  current: readonly CurrentMed[];
  adding: readonly string[];
  mode: "dialog" | "review";
  earlier: readonly EarlierAnswer[];
  now: Date;
}

const RANK: Record<Exclude<Level, "hidden">, number> = { stop: 3, check: 2, note: 1 };

/**
 * IX-2: one row per medicine, by catalogue id, whatever the sources; the earliest "since" wins. Within the
 * signed windows only.
 */
export function currentMedicines(
  rows: readonly CurrentMed[],
  windows: Payload<"lookback_windows"> | null,
  now: Date,
): CurrentMed[] {
  const keep = rows.filter((r) => {
    if (r.source === "active_line" || r.source === "admission_continue") return true;
    if (!windows) return false; // Appendix D: unsigned windows check active lines and Continue only
    const hours =
      r.source === "charted"
        ? windows.chartedHours
        : (windows.suppliedDaysByMedicine[r.medicineId] ?? windows.suppliedDays) * 24;
    return now.getTime() - r.since.getTime() <= hours * 3_600_000;
  });
  const by = new Map<string, CurrentMed>();
  for (const r of keep) {
    const was = by.get(r.medicineId);
    if (!was || r.since < was.since) by.set(r.medicineId, r);
  }
  return [...by.values()];
}

/** IX-1, IX-3 to IX-7. */
export function checkInteractions(input: InteractionInput): Fired[] {
  if (!input.levels) return [];
  const adding = new Set(input.adding);
  const current = new Map(input.current.map((c) => [c.medicineId, c]));
  const fired: Fired[] = [];
  for (const e of input.entries) {
    if (e.status !== "in_force" || e.blocked) continue;
    const p = e.payload;
    const pairs: [string, string][] = [
      [p.a, p.b],
      [p.b, p.a],
    ];
    const hit = pairs.find(([x, y]) => adding.has(x) && (adding.has(y) || current.has(y)));
    if (!hit) continue;
    const [add, other] = hit;
    let level = input.levels[input.mode][p.severity];
    if (level === "hidden") continue;
    if (p.byDesign && input.mode === "dialog") level = "note";
    const suppressedBy =
      input.earlier
        .filter(
          (a) =>
            a.key === e.key &&
            input.now.getTime() - new Date(a.answeredAt).getTime() <=
              input.levels!.suppressionDays * 86_400_000,
        )
        .sort((x, y) => new Date(y.answeredAt).getTime() - new Date(x.answeredAt).getTime())[0] ??
      null;
    if (suppressedBy) level = "note";
    const cur = adding.has(other) ? null : current.get(other)!;
    fired.push({
      entryId: e.id,
      key: e.key,
      version: e.version,
      source: e.source,
      level,
      severity: p.severity,
      adding: add,
      other,
      otherSince: cur?.since ?? null,
      otherSource: cur?.source ?? "adding",
      effect: p.effect,
      management: p.management,
      restricted: p.restricted,
      suppressedBy,
    });
  }
  return fired.sort((x, y) => RANK[y.level] - RANK[x.level] || x.key.localeCompare(y.key));
}

/** IX-8: a viewer without the class sees the class, not the medicine, and not the text. */
export function maskFor(f: Fired, mayView: (cls: "hiv" | "tb" | "srh") => boolean): Fired {
  if (!f.restricted || mayView(f.restricted)) return f;
  return { ...f, effect: "", management: "", other: "restricted", adding: f.adding };
}

/** IX-9: never complete. */
export type InteractionsChecked =
  | { state: "none" }
  | { state: "partial"; pairs: number; version: string; signedAt: string };

export function interactionsChecked(
  entries: readonly Pick<Entry<"interaction_pair">, "status" | "version" | "blocked">[],
  levelsSigned: boolean,
  signedAt: Date | null,
): InteractionsChecked {
  const live = entries.filter((e) => e.status === "in_force" && !e.blocked);
  if (!levelsSigned || !live.length || !signedAt) return { state: "none" };
  return {
    state: "partial",
    pairs: live.length,
    version: String(Math.max(...live.map((e) => e.version))),
    signedAt: signedAt.toISOString(),
  };
}
