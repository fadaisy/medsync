"use client";

import type { AddedSound, RespExam, RespZone } from "@/lib/clerkship/exam/respiratory";
import type { ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  MinusCircleIcon,
  ShieldAlertIcon,
} from "lucide-react";

import {
  ADDED_OPTS,
  BREATH_OPTS,
  matchRespPatterns,
  normalRespExam,
  PERCUSSION_OPTS,
  renderRespProse,
  RESP_FINDINGS,
  RESP_GROUPS,
  RESP_ZONES,
  VR_OPTS,
} from "@/lib/clerkship/exam/respiratory";

/**
 * Respiratory examination — tap-first IPPA + zonal capture (percussion / breath
 * sounds / vocal resonance / added sounds per zone & side). The sign-cluster →
 * pattern suggestion is surfaced transparently (multiple on ambiguity, must-not-
 * miss in red) as DECISION-SUPPORT — never an auto-diagnosis. not-examined ≠
 * normal. Reuses the general exam for peripheral signs (clubbing/cyanosis/nodes).
 */

const EASE = "transition-colors duration-150 ease-expo-out";
const chip = (active: boolean) =>
  `rounded-md px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${active ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200" : "text-foreground/70 ring-border hover:bg-muted/60"}`;
const seg = (active: boolean, tone: "muted" | "teal" = "muted") =>
  `inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${EASE} ${
    active
      ? tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
        : "bg-slate-100 text-slate-700 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200"
      : "text-muted-foreground ring-border hover:bg-muted/60"
  }`;

type Modality = "percussion" | "breathSounds" | "vocalResonance" | "added";
const MOD_OPTS = {
  percussion: PERCUSSION_OPTS,
  breathSounds: BREATH_OPTS,
  vocalResonance: VR_OPTS,
} as const;
const MOD_LABEL: Record<Modality, string> = {
  percussion: "Percussion",
  breathSounds: "Breath sounds",
  vocalResonance: "Vocal resonance",
  added: "Added sounds",
};

export function RespiratoryExam({
  value,
  onChange,
}: {
  value: RespExam;
  onChange: (next: RespExam) => void;
}) {
  const [modality, setModality] = useState<Modality>("percussion");
  const [activeZone, setActiveZone] = useState<RespZone>("lower_right");
  const [openFindings, setOpenFindings] = useState(false);

  const findings = value.findings ?? [];
  const byCode = useMemo(() => new Map(findings.map((o) => [o.code, o])), [findings]);
  const patterns = useMemo(() => matchRespPatterns(value), [value]);

  const setFinding = (code: string, patch: Partial<ExamObservation> | null) => {
    const fd = RESP_FINDINGS.find((x) => x.code === code);
    if (!fd) return;
    const others = findings.filter((o) => o.code !== code);
    if (patch === null) return onChange({ ...value, findings: others });
    const prev = byCode.get(code) ?? {
      code,
      group: fd.group,
      display: fd.display,
      state: "not_examined" as FindingState,
    };
    onChange({ ...value, findings: [...others, { ...prev, ...patch }] });
  };

  // cycle a zone value through [unset, ...options] for percussion/breath/VR
  const cycleZone = (zone: RespZone) => {
    if (modality === "added") return;
    const opts = MOD_OPTS[modality];
    const rec = { ...((value[modality] as Partial<Record<RespZone, string>>) ?? {}) };
    const cur = rec[zone];
    const idx = cur ? opts.findIndex((o) => o.value === cur) : -1;
    const next = opts[idx + 1]?.value; // undefined wraps back to unset
    if (next) rec[zone] = next;
    else delete rec[zone];
    onChange({ ...value, [modality]: rec });
  };

  const toggleAdded = (zone: RespZone, sound: AddedSound) => {
    const rec = { ...(value.addedSounds ?? {}) };
    const cur = rec[zone] ?? [];
    const next = cur.includes(sound) ? cur.filter((s) => s !== sound) : [...cur, sound];
    if (next.length) rec[zone] = next;
    else delete rec[zone];
    onChange({ ...value, addedSounds: rec });
  };

  const cellTone = (abnormal: boolean | undefined, set: boolean) =>
    !set
      ? "border-dashed border-border text-muted-foreground"
      : abnormal
        ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300";

  const findingsCount = findings.filter(
    (o) => o.state === "present" && !(o.values?.length && false),
  ).length;

  return (
    <div className="border-border/70 flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">Respiratory examination</span>
        {patterns.length ? (
          <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
            {patterns.length} pattern{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onChange(normalRespExam())}
          className={`text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded-md px-2.5 py-1 text-[11.5px] font-medium ${EASE}`}
        >
          Normal respiratory exam
        </button>
      </div>

      {/* Palpation essentials — trachea + expansion */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[11px]">Trachea</span>
          {(
            [
              ["deviated_left", "← L"],
              ["central", "central"],
              ["deviated_right", "R →"],
            ] as const
          ).map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              className={seg(value.trachea === v, v === "central" ? "muted" : "muted")}
              onClick={() => onChange({ ...value, trachea: value.trachea === v ? undefined : v })}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[11px]">Expansion</span>
          {(["left", "right"] as const).map((side) => {
            const reduced = value.expansion?.[side] === "reduced";
            return (
              <button
                key={side}
                type="button"
                className={seg(reduced, "muted")}
                onClick={() =>
                  onChange({
                    ...value,
                    expansion: { ...value.expansion, [side]: reduced ? "normal" : "reduced" },
                  })
                }
              >
                {side === "left" ? "L" : "R"} {reduced ? "reduced" : "normal"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Zonal capture — modality tabs + 3×2 grid */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(MOD_LABEL) as Modality[]).map((m) => (
            <button
              key={m}
              type="button"
              className={seg(modality === m, "teal")}
              onClick={() => setModality(m)}
            >
              {MOD_LABEL[m]}
            </button>
          ))}
        </div>

        {modality !== "added" ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {RESP_ZONES.map((z) => {
                const rec = (value[modality] as Partial<Record<RespZone, string>>) ?? {};
                const cur = rec[z.zone];
                const opt = MOD_OPTS[modality].find((o) => o.value === cur);
                return (
                  <button
                    key={z.zone}
                    type="button"
                    onClick={() => cycleZone(z.zone)}
                    className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-left text-[11px] ${EASE} ${cellTone(opt?.abnormal, !!cur)}`}
                  >
                    <span className="text-[10px] opacity-70">{z.short}</span>
                    <span className="font-medium">{opt?.label ?? "tap"}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-muted-foreground text-[10px]">
              Tap a zone to cycle: {MOD_OPTS[modality].map((o) => o.label).join(" → ")} → unset
            </span>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {RESP_ZONES.map((z) => {
                const n = (value.addedSounds?.[z.zone] ?? []).length;
                return (
                  <button
                    key={z.zone}
                    type="button"
                    onClick={() => setActiveZone(z.zone)}
                    className={`rounded-md border px-2 py-1 text-[11px] ${EASE} ${activeZone === z.zone ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300" : n ? "border-amber-400 text-amber-800 dark:text-amber-300" : "border-border text-muted-foreground"}`}
                  >
                    {z.short}
                    {n ? ` ·${n}` : ""}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1">
              {ADDED_OPTS.map((o) => {
                const on = (value.addedSounds?.[activeZone] ?? []).includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    className={
                      o.emergency && on
                        ? "rounded-md bg-red-100 px-2 py-0.5 text-[11.5px] font-medium text-red-700 ring-1 ring-red-500/40 ring-inset dark:bg-red-950/40 dark:text-red-300"
                        : chip(on)
                    }
                    onClick={() => toggleAdded(activeZone, o.value)}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <span className="text-muted-foreground text-[10px]">
              Added sounds at:{" "}
              <span className="text-foreground font-medium">
                {RESP_ZONES.find((z) => z.zone === activeZone)?.level}{" "}
                {RESP_ZONES.find((z) => z.zone === activeZone)?.side}
              </span>
            </span>
          </>
        )}
      </div>

      {/* Cluster → pattern (decision-support) */}
      {patterns.length ? (
        <div className="border-border/70 bg-muted/20 flex flex-col gap-1 rounded-lg border p-2.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Pattern(s) to consider — decision support
          </span>
          {patterns.map((p) => (
            <div key={p.key} className="flex items-start gap-1.5">
              {p.emergency ? (
                <ShieldAlertIcon
                  className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400"
                  aria-hidden
                />
              ) : p.mustNotMiss ? (
                <AlertTriangleIcon
                  className="mt-0.5 size-3.5 shrink-0 text-amber-500"
                  aria-hidden
                />
              ) : (
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
              )}
              <span className="text-[11.5px]">
                <span
                  className={`font-semibold ${p.emergency ? "text-red-700 dark:text-red-300" : "text-foreground"}`}
                >
                  {p.label}
                </span>
                <span className="text-muted-foreground"> — {p.signature}</span>
              </span>
            </div>
          ))}
          <span className="text-muted-foreground/80 text-[10px] italic">
            Surfaced from the recorded signs — you interpret + decide; never auto-diagnosed.
          </span>
        </div>
      ) : null}

      {/* Non-zonal IPPA findings — collapsed by default */}
      <div className="border-border/70 overflow-hidden rounded-lg border">
        <button
          type="button"
          onClick={() => setOpenFindings((o) => !o)}
          className="bg-muted/30 hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <ChevronDownIcon
            className={`text-muted-foreground size-3.5 transition-transform ${openFindings ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="text-foreground flex-1 text-[12.5px] font-semibold">
            Inspection · peripheral · completion
          </span>
          {findingsCount ? (
            <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
              {findingsCount}
            </span>
          ) : null}
        </button>
        {openFindings ? (
          <div className="flex flex-col">
            {RESP_GROUPS.map((g) => {
              const inGroup = RESP_FINDINGS.filter((x) => x.group === g.key);
              return (
                <div key={g.key} className="border-border/40 border-t first:border-t-0">
                  <div className="text-muted-foreground bg-muted/20 px-3 py-1 text-[10px] font-medium tracking-wide uppercase">
                    {g.label}
                  </div>
                  <div className="divide-border/50 divide-y">
                    {inGroup.map((x) => {
                      const o = byCode.get(x.code);
                      return (
                        <div key={x.code} className="flex flex-col gap-1 px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span className="text-foreground text-[12.5px]">{x.display}</span>
                              {x.mustNotMiss ? (
                                <AlertTriangleIcon
                                  className="size-3 text-amber-500"
                                  aria-label="must-not-miss"
                                />
                              ) : null}
                              {x.ugandaFlag ? (
                                <span className="text-muted-foreground bg-muted rounded px-1 text-[9px] uppercase">
                                  {x.ugandaFlag}
                                </span>
                              ) : null}
                            </span>
                            {x.kind === "select" ? (
                              <div className="flex flex-wrap justify-end gap-1">
                                {x.options.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={chip(o?.values?.[0] === opt)}
                                    onClick={() =>
                                      setFinding(
                                        x.code,
                                        o?.values?.[0] === opt
                                          ? null
                                          : { state: "present", values: [opt] },
                                      )
                                    }
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  aria-pressed={o?.state === "absent"}
                                  className={seg(o?.state === "absent")}
                                  onClick={() =>
                                    setFinding(
                                      x.code,
                                      o?.state === "absent"
                                        ? null
                                        : { state: "absent", values: [] },
                                    )
                                  }
                                >
                                  <MinusCircleIcon className="size-3" aria-hidden /> Normal
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={o?.state === "present"}
                                  className={seg(o?.state === "present", "teal")}
                                  onClick={() =>
                                    setFinding(
                                      x.code,
                                      o?.state === "present" ? null : { state: "present" },
                                    )
                                  }
                                >
                                  <CheckIcon className="size-3" aria-hidden />{" "}
                                  {x.options.length ? "Findings" : "Present"}
                                </button>
                              </div>
                            )}
                          </div>
                          {x.kind === "panel" && o?.state === "present" && x.options.length ? (
                            <div className="flex flex-wrap gap-1 pl-1">
                              {x.options.map((opt) => {
                                const on = o.values?.includes(opt);
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={chip(!!on)}
                                    onClick={() =>
                                      setFinding(x.code, {
                                        values: on
                                          ? (o.values ?? []).filter((v) => v !== opt)
                                          : [...(o.values ?? []), opt],
                                      })
                                    }
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-muted-foreground border-border/40 border-t px-3 py-1.5 text-[10px]">
              Clubbing, cyanosis, lymph nodes & JVP are captured in the general examination.
            </p>
          </div>
        ) : null}
      </div>

      {renderRespProse(value) ? (
        <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderRespProse(value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
