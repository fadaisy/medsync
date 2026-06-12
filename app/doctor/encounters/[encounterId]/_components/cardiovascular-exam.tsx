"use client";

import type { ThreeStateValue } from "./exam-kit";
import type {
  CvsExam,
  HeartSound,
  Murmur,
  PulseCharacter,
  PulseRhythm,
} from "@/lib/clerkship/exam/cardiovascular";
import type { ExamFinding, ExamObservation, FindingState } from "@/lib/clerkship/exam/types";
import { useMemo } from "react";
import {
  AlertTriangleIcon,
  CircleDashedIcon,
  PlusIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import {
  APEX_CHAR_OPTS,
  APEX_INTERSPACE_OPTS,
  APEX_LINE_OPTS,
  CVS_ADDED_OPTS,
  CVS_FINDINGS,
  HEART_SOUND_OPTS,
  JVP_HEIGHT_OPTS,
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
import { cn } from "@/lib/utils";
import { ChipRow, NormalExamButton, StageCard, ThreeState, ValueChip } from "./exam-kit";

/**
 * Cardiovascular examination — REWORKED PRESENTATION (ADR 0074). Same CvsExam data,
 * handlers, value-sets and behaviour as before; restructured into the real clinical
 * I-P-A sequence as numbered StageCards (Inspection/periphery → Palpation [apex,
 * heaves, thrills] → Auscultation [heart sounds + the STRUCTURED murmur model +
 * added sounds] → JVP/oedema/completion). Murmurs stay tap-characterised
 * STRUCTURALLY (timing/location/radiation/intensity/pitch/manoeuvre). The valve-
 * lesion / HF / IE / tamponade cluster is surfaced transparently (multiple on
 * ambiguity, must-not-miss/emergency flagged) as DECISION-SUPPORT — never an
 * auto-diagnosis. not-examined ≠ normal; peripheral overlap reused from general.
 */

const label = (s: string) => s.replace(/_/g, " ");

function Row({
  title,
  options,
  value,
  onPick,
}: {
  title: string;
  options: readonly string[] | { value: string; label: string }[];
  value: string | undefined;
  onPick: (v: string | undefined) => void;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <ChipRow label={title}>
      {opts.map((o) => (
        <ValueChip
          key={o.value}
          active={value === o.value}
          onClick={() => onPick(value === o.value ? undefined : o.value)}
        >
          {o.label}
        </ValueChip>
      ))}
    </ChipRow>
  );
}

export function CardiovascularExam({
  value,
  onChange,
}: {
  value: CvsExam;
  onChange: (next: CvsExam) => void;
}) {
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

  // ── render a catalog finding with the kit (select = chip pick; panel = three-state + chips) ──
  const renderFinding = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    if (x.kind === "select") {
      return (
        <ChipRow key={x.code} label={x.display}>
          {x.options.map((opt) => (
            <ValueChip
              key={opt}
              active={o?.values?.[0] === opt}
              onClick={() =>
                setFinding(
                  x.code,
                  o?.values?.[0] === opt ? null : { state: "present", values: [opt] },
                )
              }
            >
              {opt}
            </ValueChip>
          ))}
        </ChipRow>
      );
    }
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <div key={x.code} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-foreground text-[12.5px]">{x.display}</span>
            {x.mustNotMiss ? (
              <AlertTriangleIcon className="size-3 text-amber-500" aria-label="must-not-miss" />
            ) : null}
            {x.ugandaFlag ? (
              <span className="text-muted-foreground bg-muted rounded px-1 text-[9px] uppercase">
                {x.ugandaFlag}
              </span>
            ) : null}
          </span>
          <ThreeState
            value={state}
            findingsLabel={x.options.length ? "Findings" : "Present"}
            onChange={(v) =>
              setFinding(
                x.code,
                v === "not_examined"
                  ? null
                  : { state: v, values: v === "absent" ? [] : (o?.values ?? []) },
              )
            }
          />
        </div>
        {state === "present" && x.options.length ? (
          <div className="flex flex-wrap gap-1 pl-1">
            {x.options.map((opt) => {
              const on = o?.values?.includes(opt);
              return (
                <ValueChip
                  key={opt}
                  active={!!on}
                  onClick={() =>
                    setFinding(x.code, {
                      values: on
                        ? (o?.values ?? []).filter((v) => v !== opt)
                        : [...(o?.values ?? []), opt],
                    })
                  }
                >
                  {opt}
                </ValueChip>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const group = (key: string) => CVS_FINDINGS.filter((x) => x.group === key);
  const presentInGroups = (keys: string[]) =>
    findings.filter((o) => o.state === "present" && keys.includes(o.group)).length;
  const touched = (x: ExamFinding) =>
    byCode.get(x.code)?.state && byCode.get(x.code)?.state !== "not_examined";

  // Stage-completion heuristics (presentation only — they gate the quiet check glyph)
  const inspectionDone =
    !!value.pulseRhythm &&
    !!value.pulseCharacter &&
    !!value.pulseVolume &&
    [...group("cvs_peripheral"), ...group("cvs_inspection")].every(touched);
  const palpationDone =
    value.apexLocation !== undefined &&
    value.apexCharacter !== undefined &&
    group("cvs_palpation").every(touched);
  const auscultationDone = value.s1 !== undefined && value.s2 !== undefined;
  const completionDone = value.jvp !== undefined && group("cvs_completion").every(touched);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-foreground text-[15px] font-medium tracking-[-0.015em]">
          Cardiovascular examination
        </h3>
        {patterns.length ? (
          <span
            key={patterns.length}
            className="scale-in rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 tabular-nums dark:bg-teal-950/40 dark:text-teal-300"
          >
            {patterns.length} lesion{patterns.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <span className="ml-auto">
          <NormalExamButton onClick={() => onChange(normalCvsExam())} label="Normal CVS exam" />
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {/* ── Stage 1 — Inspection & periphery ── */}
        <StageCard
          index={1}
          title="Inspection & periphery"
          complete={inspectionDone}
          count={presentInGroups(["cvs_peripheral", "cvs_inspection"])}
          hint="end of bed → hands → pulse → neck"
        >
          {group("cvs_peripheral").map(renderFinding)}
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Pulse
            </span>
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
              onPick={(v) =>
                onChange({ ...value, pulseCharacter: (v as PulseCharacter) ?? undefined })
              }
            />
            <Row
              title="Pulse volume"
              options={[
                { value: "low", label: "Low" },
                { value: "normal", label: "Normal" },
                { value: "high", label: "High" },
              ]}
              value={value.pulseVolume}
              onPick={(v) =>
                onChange({ ...value, pulseVolume: (v as CvsExam["pulseVolume"]) ?? undefined })
              }
            />
          </div>
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Inspection
            </span>
            {group("cvs_inspection").map(renderFinding)}
          </div>
        </StageCard>

        {/* ── Stage 2 — Palpation (precordium) ── */}
        <StageCard
          index={2}
          title="Palpation — precordium"
          complete={palpationDone}
          hint="apex → heaves → thrills"
        >
          <Row
            title="Apex"
            options={[
              { value: "undisplaced", label: "Undisplaced" },
              { value: "displaced", label: "Displaced" },
            ]}
            value={value.apexLocation}
            onPick={(v) =>
              onChange({
                ...value,
                apexLocation: (v as CvsExam["apexLocation"]) ?? undefined,
                apexInterspace: v === "displaced" ? value.apexInterspace : undefined,
                apexLine: v === "displaced" ? value.apexLine : undefined,
              })
            }
          />
          {value.apexLocation === "displaced" ? (
            <div className="scale-in flex flex-col gap-1.5">
              <Row
                title="↳ interspace"
                options={APEX_INTERSPACE_OPTS}
                value={value.apexInterspace}
                onPick={(v) => onChange({ ...value, apexInterspace: v })}
              />
              <Row
                title="↳ line"
                options={APEX_LINE_OPTS}
                value={value.apexLine}
                onPick={(v) => onChange({ ...value, apexLine: v })}
              />
            </div>
          ) : null}
          <Row
            title="Apex character"
            options={APEX_CHAR_OPTS.map((o) => ({ value: o.value, label: o.label }))}
            value={value.apexCharacter}
            onPick={(v) =>
              onChange({ ...value, apexCharacter: (v as CvsExam["apexCharacter"]) ?? undefined })
            }
          />
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Heaves & thrills
            </span>
            {group("cvs_palpation").map(renderFinding)}
          </div>
        </StageCard>

        {/* ── Stage 3 — Auscultation (precordium) ── */}
        <StageCard
          index={3}
          title="Auscultation — precordium"
          complete={auscultationDone}
          count={murmurs.length}
          hint="heart sounds → murmurs → added"
        >
          {/* Heart sounds — laid out across the four auscultation areas as a crafted block */}
          <div className="border-border/70 bg-muted/15 flex flex-col gap-2 rounded-lg border p-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Heart sounds — A · P · T · M
            </span>
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
            <ChipRow label="Added sounds">
              {CVS_ADDED_OPTS.map((s) => (
                <ValueChip
                  key={s}
                  active={(value.addedSounds ?? []).includes(s)}
                  onClick={() => toggleAdded(s)}
                >
                  {s}
                </ValueChip>
              ))}
            </ChipRow>
          </div>

          {/* Murmurs — STRUCTURED (timing/location/radiation/intensity/pitch/manoeuvre) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                Murmurs — characterised structurally
              </span>
              <button
                type="button"
                onClick={addMurmur}
                className="tap text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11.5px]"
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
                  className="border-border/70 scale-in flex flex-col gap-1.5 rounded-lg border p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      Murmur {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMurmur(m.id)}
                      className="tap text-muted-foreground hover:text-foreground"
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
                  <ChipRow label="Intensity">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <ValueChip
                        key={n}
                        active={m.intensity === n}
                        onClick={() =>
                          setMurmur(m.id, { intensity: m.intensity === n ? undefined : n })
                        }
                      >
                        {n}
                      </ValueChip>
                    ))}
                    <span className="text-muted-foreground self-center text-[10px]">/6</span>
                  </ChipRow>
                  <Row
                    title="Pitch"
                    options={MURMUR_PITCH_OPTS}
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
        </StageCard>

        {/* ── Stage 4 — JVP, oedema & completion ── */}
        <StageCard
          index={4}
          title="JVP, oedema & completion"
          complete={completionDone}
          count={presentInGroups(["cvs_completion"])}
          hint="neck → lung bases → oedema"
        >
          <Row
            title="JVP"
            options={[
              { value: "not_raised", label: "Not raised" },
              { value: "raised", label: "Raised" },
            ]}
            value={value.jvp}
            onPick={(v) =>
              onChange({
                ...value,
                jvp: (v as CvsExam["jvp"]) ?? undefined,
                // qualifier follows its finding — never orphaned
                jvpHeight: v === "raised" ? value.jvpHeight : undefined,
              })
            }
          />
          {value.jvp === "raised" ? (
            <div className="scale-in flex flex-col gap-0.5">
              <Row
                title="↳ height"
                options={JVP_HEIGHT_OPTS}
                value={value.jvpHeight}
                onPick={(v) => onChange({ ...value, jvpHeight: v })}
              />
              <span className="text-muted-foreground pl-26 text-[10px]">
                above the sternal angle (normal ≤3–4 cm)
              </span>
            </div>
          ) : null}
          <div className="border-border/60 mt-1 flex flex-col gap-1.5 rounded-lg border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Completion
            </span>
            {group("cvs_completion").map(renderFinding)}
          </div>
          <p className="text-muted-foreground text-[10px]">
            Clubbing, cyanosis & peripheral oedema are also captured in the general examination.
          </p>
        </StageCard>
      </div>

      {/* Cluster → lesion (decision-support) */}
      {patterns.length ? (
        <div
          className={cn(
            "flex flex-col gap-1 rounded-xl border p-3",
            patterns.some((p) => p.emergency)
              ? "border-red-300 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"
              : "border-border/70 bg-muted/20",
          )}
        >
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Lesion(s) to consider — decision support
          </span>
          {patterns.map((p) => (
            <div key={p.key} className="scale-in flex items-start gap-1.5">
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

      {renderCvsProse(value) ? (
        <div className="fade-in-slow rounded-xl border border-teal-200/70 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
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
