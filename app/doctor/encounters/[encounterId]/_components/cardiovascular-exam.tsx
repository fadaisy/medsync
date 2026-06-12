"use client";

import type { SectionStatus, ThreeStateValue } from "./exam-kit";
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
import {
  ChipRow,
  CompactField,
  FindingGrid,
  NormalExamButton,
  PresentCluster,
  SectionCard,
  ThreeState,
  ValueChip,
} from "./exam-kit";

/**
 * Cardiovascular examination — EXAMINATION UI v2 (progressive disclosure, ADR 0074
 * supersedes the v1 StageCard layout). Same CvsExam data, handlers, value-sets and
 * behaviour as before; presentation only. The clinical I-P-A sequence is now FOUR
 * collapsible SectionCards (Inspection/periphery → Palpation [apex, heaves, thrills]
 * → Auscultation [heart sounds + the STRUCTURED murmur model + added sounds] →
 * JVP/oedema/completion), each summarised to one line (status pill + inline
 * positives + on-row "mark normal"). Long binary sign lists (peripheral stigmata,
 * added sounds) collapse to "tap any present" clusters with an explicit examined /
 * not-examined control (not-examined ≠ all-negative). Murmurs stay tap-characterised
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

  const group = (key: string) => CVS_FINDINGS.filter((x) => x.group === key);

  // ── render a catalog finding with the kit (select = chip pick; panel = three-state + chips) ──
  const renderSelect = (x: ExamFinding) => {
    const o = byCode.get(x.code);
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
  };

  const renderPanel = (x: ExamFinding) => {
    const o = byCode.get(x.code);
    const state: ThreeStateValue = o?.state ?? "not_examined";
    return (
      <CompactField
        key={x.code}
        label={x.display}
        mustNotMiss={x.mustNotMiss}
        flag={x.ugandaFlag}
        control={
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
        }
        detail={
          state === "present" && x.options.length
            ? x.options.map((opt) => {
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
              })
            : undefined
        }
      />
    );
  };

  /** Compact catalog render: selects (chip pickers) above a 2-col grid of panels.
   * `exclude` drops codes shown elsewhere (e.g. binary stigmata in a cluster). */
  const renderCatalog = (keys: string[], exclude: string[] = []) => {
    const skip = new Set(exclude);
    const fs = keys.flatMap(group).filter((x) => !skip.has(x.code));
    const selects = fs.filter((x) => x.kind === "select");
    const panels = fs.filter((x) => x.kind === "panel");
    if (!selects.length && !panels.length) return null;
    return (
      <>
        {selects.length ? (
          <div className="flex flex-col gap-2.5">{selects.map(renderSelect)}</div>
        ) : null}
        {panels.length ? <FindingGrid>{panels.map(renderPanel)}</FindingGrid> : null}
      </>
    );
  };

  // ── PresentCluster wiring for a set of catalog findings (binary present/absent) ──
  // toggle: present ↔ (absent if the cluster is examined, else removed); setExamined(true)
  // marks untapped findings absent; setExamined(false) removes them all. Exactly the
  // spot-diagnosis mapping pattern from the General exemplar, adapted to setFinding.
  const clusterState = (codes: string[]) => {
    const present = codes.filter((c) => byCode.get(c)?.state === "present");
    const examined = codes.every(
      (c) => (byCode.get(c)?.state ?? "not_examined") !== "not_examined",
    );
    return { present, examined };
  };
  const toggleCluster = (code: string, examined: boolean) => {
    const cur = byCode.get(code)?.state;
    if (cur === "present") setFinding(code, examined ? { state: "absent", values: [] } : null);
    else setFinding(code, { state: "present", values: [] });
  };
  const setClusterExamined = (codes: string[], examined: boolean) => {
    const others = findings.filter((o) => !codes.includes(o.code));
    if (!examined) return onChange({ ...value, findings: others });
    const forGroup: ExamObservation[] = codes.map((code) => {
      const ex = byCode.get(code);
      if (ex?.state === "present") return ex;
      const fd = CVS_FINDINGS.find((x) => x.code === code)!;
      return { code, group: fd.group, display: fd.display, state: "absent", values: [] };
    });
    onChange({ ...value, findings: [...others, ...forGroup] });
  };

  // The peripheral binary stigmata (no value-set) → one "tap any present" cluster.
  const stigmataFindings = group("cvs_peripheral").filter(
    (x) => x.kind === "panel" && !x.options.length,
  );
  const stigmataCodes = stigmataFindings.map((x) => x.code);
  const stigmata = clusterState(stigmataCodes);

  // Added heart sounds — examined is DERIVED from the existing array (no new field):
  // any present ⇒ examined. Clearing returns the cluster to untouched, matching the
  // v1 toggle-chip behaviour (the CvsExam model has no separate examined flag).
  const addedSounds = value.addedSounds ?? [];
  const addedExamined = addedSounds.length > 0;

  // ── per-section status / count / inline-positive summary for the collapsed row ──
  // Spans the section's catalog findings AND its scalar/structured CvsExam fields.
  type Part = { present: boolean; mnm?: boolean; touched: boolean; summary?: string };
  const findingPart = (code: string): Part => {
    const o = byCode.get(code);
    const fd = CVS_FINDINGS.find((x) => x.code === code);
    const present = o?.state === "present";
    return {
      present,
      mnm: present && fd?.mustNotMiss,
      touched: !!o && o.state !== "not_examined",
      summary: present ? (o?.values?.length ? o.values.join(", ") : fd?.display) : undefined,
    };
  };

  const sectionMeta = (
    parts: Part[],
  ): { status: SectionStatus; count: number; summary: string } => {
    const positives = parts.filter((p) => p.present);
    const mnm = positives.filter((p) => p.mnm);
    const touched = parts.filter((p) => p.touched);
    const summary = positives
      .map((p) => p.summary)
      .filter(Boolean)
      .join(" · ");
    if (mnm.length) return { status: "must_not_miss", count: mnm.length, summary };
    if (positives.length) return { status: "findings", count: positives.length, summary };
    if (touched.length === parts.length && parts.length > 0)
      return { status: "normal", count: 0, summary: "" };
    if (touched.length > 0) return { status: "partial", count: 0, summary: "" };
    return { status: "not_examined", count: 0, summary: "" };
  };

  // ── per-section "mark normal": reuse the exact whole-exam normal, filtered ──
  const N = normalCvsExam();
  const markGroupsNormal = (keys: string[], scalar: Partial<CvsExam>) => {
    const codes = new Set(keys.flatMap((k) => group(k).map((x) => x.code)));
    const others = findings.filter((o) => !codes.has(o.code));
    const forGroups = (N.findings ?? []).filter((o) => codes.has(o.code));
    onChange({ ...value, ...scalar, findings: [...others, ...forGroups] });
  };

  // ── Section 1 — Inspection & periphery ──
  const s1Parts: Part[] = [
    ...group("cvs_peripheral").map((x) => findingPart(x.code)),
    ...group("cvs_inspection").map((x) => findingPart(x.code)),
    {
      present: !!value.pulseRhythm && value.pulseRhythm !== "regular",
      touched: !!value.pulseRhythm,
      summary: value.pulseRhythm ? label(value.pulseRhythm) : undefined,
    },
    {
      present: !!value.pulseCharacter && value.pulseCharacter !== "normal",
      touched: !!value.pulseCharacter,
      summary:
        value.pulseCharacter && value.pulseCharacter !== "normal"
          ? `${label(value.pulseCharacter)} pulse`
          : undefined,
    },
    {
      present: !!value.pulseVolume && value.pulseVolume !== "normal",
      touched: !!value.pulseVolume,
      summary:
        value.pulseVolume && value.pulseVolume !== "normal"
          ? `${value.pulseVolume} volume`
          : undefined,
    },
  ];
  const s1Meta = sectionMeta(s1Parts);

  // ── Section 2 — Palpation (precordium) ──
  const s2Parts: Part[] = [
    ...group("cvs_palpation").map((x) => findingPart(x.code)),
    {
      present: value.apexLocation === "displaced",
      touched: value.apexLocation !== undefined,
      summary:
        value.apexLocation === "displaced"
          ? `apex displaced${value.apexInterspace || value.apexLine ? ` (${[value.apexInterspace, value.apexLine].filter(Boolean).join(", ")})` : ""}`
          : undefined,
    },
    {
      present: !!value.apexCharacter && value.apexCharacter !== "normal",
      touched: value.apexCharacter !== undefined,
      summary:
        value.apexCharacter && value.apexCharacter !== "normal"
          ? `${label(value.apexCharacter)} apex`
          : undefined,
    },
  ];
  const s2Meta = sectionMeta(s2Parts);

  // ── Section 3 — Auscultation (precordium) ──
  const s3Parts: Part[] = [
    {
      present: !!value.s1 && value.s1 !== "normal",
      touched: value.s1 !== undefined,
      summary: value.s1 && value.s1 !== "normal" ? `S1 ${label(value.s1)}` : undefined,
    },
    {
      present: !!value.s2 && value.s2 !== "normal",
      touched: value.s2 !== undefined,
      summary: value.s2 && value.s2 !== "normal" ? `S2 ${label(value.s2)}` : undefined,
    },
    {
      present: addedSounds.length > 0,
      touched: addedExamined,
      summary: addedSounds.length ? addedSounds.join(", ") : undefined,
    },
    {
      present: murmurs.length > 0,
      touched: murmurs.length > 0,
      summary: murmurs.length
        ? `${murmurs.length} murmur${murmurs.length > 1 ? "s" : ""}`
        : undefined,
    },
  ];
  const s3Meta = sectionMeta(s3Parts);

  // ── Section 4 — JVP, oedema & completion ──
  const s4Parts: Part[] = [
    {
      present: value.jvp === "raised",
      touched: value.jvp !== undefined,
      summary:
        value.jvp === "raised"
          ? `JVP raised${value.jvpHeight ? ` (${value.jvpHeight})` : ""}`
          : undefined,
    },
    ...group("cvs_completion").map((x) => findingPart(x.code)),
  ];
  const s4Meta = sectionMeta(s4Parts);

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

      {/* Clinical sequence — collapsible SectionCards (collapsed by default) */}
      <div className="flex flex-col gap-2.5">
        {/* ── 1 — Inspection & periphery ── */}
        <SectionCard
          index={1}
          title="Inspection & periphery"
          status={s1Meta.status}
          count={s1Meta.count}
          summary={s1Meta.summary}
          onMarkNormal={() =>
            markGroupsNormal(["cvs_peripheral", "cvs_inspection"], {
              pulseRhythm: N.pulseRhythm,
              pulseCharacter: N.pulseCharacter,
              pulseVolume: N.pulseVolume,
            })
          }
        >
          {/* Pulse — graded selects */}
          <div className="flex flex-col gap-1.5">
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

          {/* Peripheral stigmata (binary signs incl. must-not-miss) → present cluster */}
          {stigmataFindings.length ? (
            <div className="border-border/60 flex flex-col gap-2 border-t pt-2.5">
              <PresentCluster
                label="Peripheral signs — tap any that are present"
                options={stigmataFindings.map((x) => ({
                  value: x.code,
                  label: x.display,
                  mustNotMiss: x.mustNotMiss,
                }))}
                present={stigmata.present}
                examined={stigmata.examined}
                onToggle={(code) => toggleCluster(code, stigmata.examined)}
                onSetExamined={(ex) => setClusterExamined(stigmataCodes, ex)}
              />
            </div>
          ) : null}

          {/* Peripheral findings WITH value-sets (distress / IE stigmata / carotids / JVP waveform) */}
          <div className="border-border/60 flex flex-col gap-2.5 border-t pt-2.5">
            {renderCatalog(["cvs_peripheral"], stigmataCodes)}
          </div>

          {/* Inspection */}
          <div className="border-border/60 flex flex-col gap-2.5 border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Inspection
            </span>
            {renderCatalog(["cvs_inspection"])}
          </div>
        </SectionCard>

        {/* ── 2 — Palpation (precordium) ── */}
        <SectionCard
          index={2}
          title="Palpation — precordium"
          status={s2Meta.status}
          count={s2Meta.count}
          summary={s2Meta.summary}
          onMarkNormal={() =>
            markGroupsNormal(["cvs_palpation"], {
              apexLocation: N.apexLocation,
              apexCharacter: N.apexCharacter,
              apexInterspace: undefined,
              apexLine: undefined,
            })
          }
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
          <div className="border-border/60 flex flex-col gap-2.5 border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Heaves & thrills
            </span>
            {renderCatalog(["cvs_palpation"])}
          </div>
        </SectionCard>

        {/* ── 3 — Auscultation (precordium) ── */}
        <SectionCard
          index={3}
          title="Auscultation — precordium"
          status={s3Meta.status}
          count={s3Meta.count}
          summary={s3Meta.summary}
          onMarkNormal={() =>
            onChange({
              ...value,
              s1: N.s1,
              s2: N.s2,
              addedSounds: [],
            })
          }
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
          </div>

          {/* Added sounds — "tap any present" cluster (examined ≠ all-negative) */}
          <PresentCluster
            label="Added sounds — tap any that are present"
            options={CVS_ADDED_OPTS.map((s) => ({ value: s, label: s }))}
            present={addedSounds}
            examined={addedExamined}
            onToggle={toggleAdded}
            onSetExamined={(ex) => onChange({ ...value, addedSounds: ex ? addedSounds : [] })}
          />

          {/* Murmurs — STRUCTURED (timing/location/radiation/intensity/pitch/manoeuvre) */}
          <div className="border-border/60 flex flex-col gap-2 border-t pt-2.5">
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
        </SectionCard>

        {/* ── 4 — JVP, oedema & completion ── */}
        <SectionCard
          index={4}
          title="JVP, oedema & completion"
          status={s4Meta.status}
          count={s4Meta.count}
          summary={s4Meta.summary}
          onMarkNormal={() =>
            markGroupsNormal(["cvs_completion"], { jvp: N.jvp, jvpHeight: undefined })
          }
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
          <div className="border-border/60 flex flex-col gap-2.5 border-t pt-2.5">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Completion
            </span>
            {renderCatalog(["cvs_completion"])}
          </div>
          <p className="text-muted-foreground text-[10px]">
            Clubbing, cyanosis & peripheral oedema are also captured in the general examination.
          </p>
        </SectionCard>
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
