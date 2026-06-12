"use client";

import type {
  CvsExam,
  HeartSound,
  Murmur,
  PulseCharacter,
  PulseRhythm,
} from "@/lib/clerkship/exam/cardiovascular";
import type { ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  MinusCircleIcon,
  PlusIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import {
  APEX_CHAR_OPTS,
  CVS_ADDED_OPTS,
  CVS_FINDINGS,
  CVS_GROUPS,
  HEART_SOUND_OPTS,
  matchCvsPatterns,
  MURMUR_AREA_OPTS,
  MURMUR_MANOEUVRE_OPTS,
  MURMUR_PITCH_OPTS,
  MURMUR_RADIATION_OPTS,
  MURMUR_TIMING_OPTS,
  normalCvsExam,
  PULSE_CHAR_OPTS,
  PULSE_RHYTHM_OPTS,
  renderCvsProse,
} from "@/lib/clerkship/exam/cardiovascular";

/**
 * Cardiovascular examination — tap-first I-P-A (no cardiac percussion). Murmurs
 * characterised STRUCTURALLY (timing/location/radiation/intensity/pitch/manoeuvre).
 * The valve-lesion / HF / IE / tamponade cluster is surfaced transparently
 * (multiple on ambiguity, must-not-miss in red) as DECISION-SUPPORT — never an
 * auto-diagnosis. Peripheral/lung-base overlap reused from the general/resp exams.
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
const label = (s: string) => s.replace(/_/g, " ");

function Row({
  title,
  options,
  value,
  onPick,
}: {
  title: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onPick: (v: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground w-24 shrink-0 text-[11px]">{title}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={chip(value === o.value)}
            onClick={() => onPick(value === o.value ? undefined : o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CardiovascularExam({
  value,
  onChange,
}: {
  value: CvsExam;
  onChange: (next: CvsExam) => void;
}) {
  const [openFindings, setOpenFindings] = useState(false);
  const findings = value.findings ?? [];
  const byCode = useMemo(() => new Map(findings.map((o) => [o.code, o])), [findings]);
  const patterns = useMemo(() => matchCvsPatterns(value), [value]);

  const setFinding = (code: string, patch: Partial<ExamObservation> | null) => {
    const fd = CVS_FINDINGS.find((x) => x.code === code);
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

  const murmurs = value.murmurs ?? [];
  const setMurmur = (id: string, patch: Partial<Murmur>) =>
    onChange({ ...value, murmurs: murmurs.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const addMurmur = () =>
    onChange({ ...value, murmurs: [...murmurs, { id: crypto.randomUUID() }] });
  const removeMurmur = (id: string) =>
    onChange({ ...value, murmurs: murmurs.filter((m) => m.id !== id) });

  const toggleAdded = (s: string) => {
    const cur = value.addedSounds ?? [];
    onChange({
      ...value,
      addedSounds: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    });
  };

  const findingsCount = findings.filter((o) => o.state === "present").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">
          Cardiovascular examination
        </span>
        {patterns.length ? (
          <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
            {patterns.length} lesion{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onChange(normalCvsExam())}
          className={`text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded-md px-2.5 py-1 text-[11.5px] font-medium ${EASE}`}
        >
          Normal CVS exam
        </button>
      </div>

      {/* Pulse + JVP */}
      <div className="flex flex-col gap-1.5">
        <Row
          title="Rhythm"
          options={PULSE_RHYTHM_OPTS.map((v) => ({ value: v, label: label(v) }))}
          value={value.pulseRhythm}
          onPick={(v) => onChange({ ...value, pulseRhythm: (v as PulseRhythm) ?? undefined })}
        />
        <Row
          title="Pulse character"
          options={PULSE_CHAR_OPTS.map((o) => ({ value: o.value, label: o.label }))}
          value={value.pulseCharacter}
          onPick={(v) => onChange({ ...value, pulseCharacter: (v as PulseCharacter) ?? undefined })}
        />
        <Row
          title="JVP"
          options={[
            { value: "not_raised", label: "Not raised" },
            { value: "raised", label: "Raised" },
          ]}
          value={value.jvp}
          onPick={(v) => onChange({ ...value, jvp: (v as CvsExam["jvp"]) ?? undefined })}
        />
      </div>

      {/* Apex + heart sounds */}
      <div className="flex flex-col gap-1.5">
        <Row
          title="Apex"
          options={[
            { value: "undisplaced", label: "Undisplaced" },
            { value: "displaced", label: "Displaced" },
          ]}
          value={value.apexLocation}
          onPick={(v) =>
            onChange({ ...value, apexLocation: (v as CvsExam["apexLocation"]) ?? undefined })
          }
        />
        <Row
          title="Apex character"
          options={APEX_CHAR_OPTS.map((o) => ({ value: o.value, label: o.label }))}
          value={value.apexCharacter}
          onPick={(v) =>
            onChange({ ...value, apexCharacter: (v as CvsExam["apexCharacter"]) ?? undefined })
          }
        />
        <Row
          title="S1"
          options={HEART_SOUND_OPTS.map((v) => ({ value: v, label: label(v) }))}
          value={value.s1}
          onPick={(v) => onChange({ ...value, s1: (v as HeartSound) ?? undefined })}
        />
        <Row
          title="S2"
          options={HEART_SOUND_OPTS.map((v) => ({ value: v, label: label(v) }))}
          value={value.s2}
          onPick={(v) => onChange({ ...value, s2: (v as HeartSound) ?? undefined })}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Added sounds</span>
          <div className="flex flex-wrap gap-1">
            {CVS_ADDED_OPTS.map((s) => (
              <button
                key={s}
                type="button"
                className={chip((value.addedSounds ?? []).includes(s))}
                onClick={() => toggleAdded(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Murmurs — structured */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-foreground text-[12px] font-semibold">Murmurs</span>
          <button
            type="button"
            onClick={addMurmur}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11.5px]"
          >
            <PlusIcon className="size-3.5" aria-hidden /> Add murmur
          </button>
        </div>
        {murmurs.length === 0 ? (
          <p className="text-muted-foreground text-[11px]">No murmur recorded.</p>
        ) : (
          murmurs.map((m, i) => (
            <div
              key={m.id}
              className="border-border/70 flex flex-col gap-1.5 rounded-lg border p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  Murmur {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeMurmur(m.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove murmur"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <Row
                title="Timing"
                options={MURMUR_TIMING_OPTS}
                value={m.timing}
                onPick={(v) => setMurmur(m.id, { timing: v as Murmur["timing"] })}
              />
              <Row
                title="Location"
                options={MURMUR_AREA_OPTS}
                value={m.location}
                onPick={(v) => setMurmur(m.id, { location: v as Murmur["location"] })}
              />
              <Row
                title="Radiation"
                options={MURMUR_RADIATION_OPTS}
                value={m.radiation}
                onPick={(v) => setMurmur(m.id, { radiation: v as Murmur["radiation"] })}
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground w-24 shrink-0 text-[11px]">Intensity</span>
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={chip(m.intensity === n)}
                      onClick={() =>
                        setMurmur(m.id, { intensity: m.intensity === n ? undefined : n })
                      }
                    >
                      {n}
                    </button>
                  ))}
                  <span className="text-muted-foreground self-center text-[10px]">/6</span>
                </div>
              </div>
              <Row
                title="Pitch"
                options={MURMUR_PITCH_OPTS.map((v) => ({ value: v, label: v }))}
                value={m.pitch}
                onPick={(v) => setMurmur(m.id, { pitch: v as Murmur["pitch"] })}
              />
              <Row
                title="Manoeuvre"
                options={MURMUR_MANOEUVRE_OPTS}
                value={m.manoeuvre}
                onPick={(v) => setMurmur(m.id, { manoeuvre: v as Murmur["manoeuvre"] })}
              />
            </div>
          ))
        )}
      </div>

      {/* Cluster → lesion (decision-support) */}
      {patterns.length ? (
        <div className="border-border/70 bg-muted/20 flex flex-col gap-1 rounded-lg border p-2.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Lesion(s) to consider — decision support
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

      {/* Non-zonal I-P-A findings — collapsed */}
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
            Peripheral · inspection · palpation · completion
          </span>
          {findingsCount ? (
            <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
              {findingsCount}
            </span>
          ) : null}
        </button>
        {openFindings ? (
          <div className="flex flex-col">
            {CVS_GROUPS.map((g) => {
              const inGroup = CVS_FINDINGS.filter((x) => x.group === g.key);
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
              Clubbing, cyanosis & peripheral oedema are also captured in the general examination.
            </p>
          </div>
        ) : null}
      </div>

      {renderCvsProse(value) ? (
        <div className="rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-teal-700 uppercase dark:text-teal-400">
            <CircleDashedIcon className="size-3" aria-hidden /> Auto-generated summary
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-teal-900/90 italic dark:text-teal-100/80">
            {renderCvsProse(value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
