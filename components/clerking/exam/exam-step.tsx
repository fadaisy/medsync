"use client";

import type { ExamView, SaveSet } from "./model";
import type { VitalsCardProps } from "./vitals-card";
import type { Undo } from "@/lib/clerking/exam/answers";
import type { ExamDraft, NotExamined } from "@/lib/clerking/exam/payload";
import type { Suggestion, TargetPlace } from "@/lib/clerking/exam/suggest";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon } from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as A from "@/lib/clerking/exam/answers";
import { appliesToSex } from "@/lib/clerking/exam/catalogue";
import { rosierSignId, westHavenSuggestion } from "@/lib/clerking/exam/classifiers";
import { evalCond } from "@/lib/clerking/exam/context";
import { placeOfTarget } from "@/lib/clerking/exam/suggest";
import { cn } from "@/lib/utils";
import { Chip, Segmented } from "../controls";
import { AmtsBlock, ConsciousnessBlock, MotorGrids, PulsesGrid } from "./blocks";
import { ItemRow } from "./item-row";
import { VITALS } from "./model";
import { ResultPill } from "./result-pill";
import { VitalsCard } from "./vitals-card";

/**
 * Step 07, Examination (PROMPT-CLERKING-EXAM-V2 §4): the suggestion strip, the systems grid (Vital
 * signs, General, the systems and Feet), and one system at a time with its parts as tabs. The
 * header, rail, Flags panel, note and Sign bar are the v2 shell's; only this card is new.
 */

const FOCUS = "outline-none focus-visible:shadow-focus";

export interface ExamPlace {
  system: string;
  part?: string;
  item?: string;
  panel?: TargetPlace["panel"];
}

export interface ExamStepProps {
  v: ExamView;
  editable: boolean;
  act: boolean;
  sex: "female" | "male" | null;
  ageYears: number | null;
  onExam: (fn: (d: ExamDraft) => ExamDraft) => void;
  onSave: SaveSet;
  triage: VitalsCardProps["triage"];
  time: (iso: string) => string;
  place: ExamPlace;
  onPlace: (p: ExamPlace) => void;
  /** Who is signed in, for the gate record ("by"). */
  actor: string;
}

/* ─── Suggestion strip (§5.12) ────────────────────────────────────── */

function SuggestionStrip({ items, onGo }: { items: Suggestion[]; onGo: (s: Suggestion) => void }) {
  const ref = useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  };
  useEffect(measure, [items.length]);
  if (!items.length) return null;
  const by = (d: number) => ref.current?.scrollBy({ left: d * 240, behavior: "smooth" });
  return (
    <div data-slot="suggestions" className="flex items-center gap-2">
      <span className="text-caption shrink-0 font-medium text-indigo-700 dark:text-indigo-300">
        Suggested
      </span>
      <div className="relative min-w-0 flex-1">
        {edges.left ? (
          <button
            type="button"
            aria-label="Scroll suggestions left"
            onClick={() => by(-1)}
            className={cn(
              "bg-card text-muted-foreground absolute inset-y-0 left-0 z-10 inline-flex w-7 items-center justify-center shadow-xs",
              FOCUS,
            )}
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
          </button>
        ) : null}
        <ul
          ref={ref}
          onScroll={measure}
          aria-label="Suggested examinations"
          className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto"
        >
          {items.map((s) => (
            <li key={s.target} className="shrink-0">
              <button
                type="button"
                title={s.reasons.join("; ")}
                aria-label={`${s.label}. ${s.done ? "Done. " : ""}${s.reasons.join("; ")}`}
                onClick={() => onGo(s)}
                className={cn(
                  "text-caption inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 whitespace-nowrap pointer-coarse:min-h-11",
                  FOCUS,
                  s.done
                    ? "border-teal-200 bg-teal-50 text-teal-800"
                    : "bg-card border-dashed border-indigo-300 text-indigo-800 dark:border-indigo-700 dark:text-indigo-200",
                )}
              >
                {s.done ? (
                  <CheckIcon aria-hidden className="size-3" />
                ) : (
                  <span aria-hidden className="size-1.5 rounded-full bg-indigo-500" />
                )}
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        {edges.right ? (
          <button
            type="button"
            aria-label="Scroll suggestions right"
            onClick={() => by(1)}
            className={cn(
              "bg-card text-muted-foreground absolute inset-y-0 right-0 z-10 inline-flex w-7 items-center justify-center shadow-xs",
              FOCUS,
            )}
          >
            <ChevronRightIcon aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Systems grid (§4.3) ─────────────────────────────────────────── */

function SystemsGrid({
  v,
  current,
  onPick,
  vitalsLine,
}: {
  v: ExamView;
  current: string;
  onPick: (id: string) => void;
  vitalsLine: { line: string; tone: "open" | "partial" | "done" };
}) {
  const pills = [
    {
      id: VITALS,
      name: "Vital signs",
      s: {
        ...vitalsLine,
        suggested: v.suggestions.some((x) => !x.done && x.target.startsWith("vs")),
        locked: false,
      },
    },
    ...v.ecat.systems.map((sys) => ({ id: sys.id, name: sys.name, s: v.systems[sys.id]! })),
  ];
  return (
    <ul
      aria-label="Examination systems"
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-5"
    >
      {pills.map(({ id, name, s }) => {
        const on = id === current;
        return (
          <li key={id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onPick(id)}
              className={cn(
                "flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left",
                FOCUS,
                on ? "border-iris-edge bg-iris-tint" : "border-border bg-card hover:bg-muted",
              )}
            >
              <span className="text-body-s text-foreground inline-flex max-w-full min-w-0 items-center gap-1.5 font-medium">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full border",
                    s.tone === "done"
                      ? "border-teal-600 bg-teal-600"
                      : s.tone === "partial"
                        ? "border-teal-600 bg-teal-100"
                        : "border-gray-400",
                  )}
                />
                <span className="min-w-0 sm:truncate">{name}</span>
                {s.locked ? (
                  <LockIcon
                    aria-label="locked, needs consent and chaperone"
                    className="text-muted-foreground size-3"
                  />
                ) : null}
              </span>
              <span
                className={cn(
                  "text-caption w-full sm:truncate",
                  s.suggested && s.tone === "open"
                    ? "text-indigo-700 dark:text-indigo-300"
                    : on
                      ? "text-foreground" // the iris tint takes muted text below AA
                      : "text-muted-foreground",
                )}
              >
                {s.suggested && s.tone === "open" ? "Suggested" : s.line}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Not examined (§4.4, D-EX-19) ────────────────────────────────── */

function NotExaminedDialog({
  v,
  open,
  what,
  onClose,
  onPick,
}: {
  v: ExamView;
  open: boolean;
  what: string;
  onClose: () => void;
  onPick: (r: NotExamined | null) => void;
}) {
  const [id, setId] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const reasons = v.ecat.data.not_examined.reasons as {
    id: string;
    label: string;
    asks?: string;
    equipment?: string[];
  }[];
  const chosen = reasons.find((r) => r.id === id);
  const ready = !!chosen && (chosen.equipment ? !!equipment : !chosen.asks || !!detail.trim());
  return (
    <EmrDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Not examined"
      description={what}
      width="medium"
      footer={
        <>
          <Button variant="secondary" onClick={() => (onPick(null), onClose())}>
            Clear
          </Button>
          <Button
            disabled={!ready}
            onClick={() => {
              onPick({
                id: chosen!.id,
                ...(equipment ? { equipment } : {}),
                ...(detail.trim() && !chosen!.equipment ? { detail: detail.trim() } : {}),
              });
              onClose();
            }}
          >
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Reason" className="flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <Chip
              key={r.id}
              selected={id === r.id}
              onPress={() => setId(id === r.id ? null : r.id)}
            >
              {r.label}
            </Chip>
          ))}
        </div>
        {chosen?.equipment ? (
          <div role="group" aria-label="Which equipment" className="flex flex-wrap gap-1.5">
            {chosen.equipment.map((e) => (
              <Chip
                key={e}
                selected={equipment === e}
                onPress={() => setEquipment(equipment === e ? null : e)}
              >
                {e}
              </Chip>
            ))}
          </div>
        ) : chosen?.asks ? (
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted-foreground">
              {chosen.asks.charAt(0).toUpperCase() + chosen.asks.slice(1)}
            </span>
            <Input value={detail} maxLength={300} onChange={(e) => setDetail(e.target.value)} />
          </label>
        ) : null}
      </div>
    </EmrDialog>
  );
}

/* ─── The intimate gate (§5.10, E7, D-EX-12) ──────────────────────── */

function IntimateGate({
  v,
  editable,
  onExam,
  actor,
  reason0,
}: {
  v: ExamView;
  editable: boolean;
  onExam: ExamStepProps["onExam"];
  actor: string;
  reason0: string;
}) {
  const g = v.exam.gate;
  const [reason, setReason] = useState(g?.reason ?? reason0);
  const [consent, setConsent] = useState<"verbal" | "best_interests" | "declined" | null>(
    g?.consent ?? null,
  );
  const [chaperone, setChaperone] = useState<
    "present" | "declined" | "not_offered_emergency" | null
  >(g?.chaperone ?? null);
  const [name, setName] = useState(g?.name ?? "");
  const [role, setRole] = useState(g?.role ?? "");
  const [editing, setEditing] = useState(!v.gateOpen);
  if (v.gateOpen && !editing)
    return (
      <p className="text-body-s text-foreground flex flex-wrap items-center gap-2">
        <CheckIcon aria-hidden className="size-4 text-teal-700" />
        {`${g!.chaperone === "present" ? `Chaperone: ${g!.name}${g!.role ? `, ${g!.role}` : ""}` : g!.chaperone === "declined" ? "Chaperone offered and declined" : "No chaperone: emergency"}. ${g!.consent === "verbal" ? "Verbal consent" : "Best-interests decision recorded"}.`}
        {editable ? (
          <Button
            variant="link"
            size="sm"
            className="text-teal-800"
            onClick={() => setEditing(true)}
          >
            Change
          </Button>
        ) : null}
      </p>
    );
  const ready =
    !!reason.trim() &&
    (consent === "verbal" || consent === "best_interests") &&
    !!chaperone &&
    (chaperone !== "present" || !!name.trim());
  return (
    <section
      aria-labelledby="exam-gate-heading"
      className="border-border flex flex-col gap-3 rounded-md border p-4"
    >
      <h4
        id="exam-gate-heading"
        className="text-heading-s text-foreground inline-flex items-center gap-1.5"
      >
        <LockIcon aria-hidden className="size-4" />
        Before this examination
      </h4>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Reason for the examination</span>
        <Input
          value={reason}
          maxLength={300}
          disabled={!editable}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Consent</span>
        <Segmented
          label="Consent"
          value={consent}
          disabled={!editable}
          onPick={(c) => setConsent(consent === c ? null : c)}
          options={[
            { id: "verbal", label: "Verbal consent given" },
            { id: "best_interests", label: "Unable to consent: best-interests decision recorded" },
            { id: "declined", label: "Declined" },
          ]}
        />
      </div>
      {consent === "declined" ? (
        <p className="text-body-s text-foreground flex flex-wrap items-center gap-2">
          The patient declined: this examination stops here.
          <Button
            size="sm"
            variant="secondary"
            disabled={!editable}
            onClick={() =>
              onExam((d) => A.setSystemNotExamined(d, "rectal_genital", { id: "declined" }))
            }
          >
            Record not examined: patient declined
          </Button>
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-caption text-muted-foreground">Chaperone</span>
            <Segmented
              label="Chaperone"
              value={chaperone}
              disabled={!editable}
              onPick={(c) => setChaperone(chaperone === c ? null : c)}
              options={[
                { id: "present", label: "Offered and present" },
                { id: "declined", label: "Offered and declined" },
                { id: "not_offered_emergency", label: "Not offered: emergency" },
              ]}
            />
            <p className="text-caption text-muted-foreground">
              A relative may stay with the patient but is not a chaperone.
            </p>
          </div>
          {chaperone === "present" ? (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">Chaperone’s name</span>
                <Input
                  value={name}
                  maxLength={120}
                  disabled={!editable}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">Role</span>
                <Input
                  value={role}
                  maxLength={80}
                  disabled={!editable}
                  onChange={(e) => setRole(e.target.value)}
                />
              </label>
            </div>
          ) : null}
          <div>
            <Button
              disabled={!editable || !ready}
              onClick={() => {
                onExam((d) => ({
                  ...d,
                  gate: {
                    reason: reason.trim(),
                    consent: consent as "verbal" | "best_interests",
                    chaperone: chaperone!,
                    ...(chaperone === "present" ? { name: name.trim(), role: role.trim() } : {}),
                    at: new Date().toISOString(),
                    by: actor,
                  },
                }));
                setEditing(false);
              }}
            >
              Record and unlock
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/* ─── Classifier panels (§5.4, §5.5, §5.6, §5.11) ─────────────────── */

function Panels({
  v,
  system,
  editable,
  onExam,
  onGo,
}: {
  v: ExamView;
  system: string;
  editable: boolean;
  onExam: ExamStepProps["onExam"];
  onGo: (p: ExamPlace) => void;
}) {
  const r = (id: string) => v.results.get(id);
  const panel = (title: string, body: ReactNode) => (
    <section aria-label={title} className="border-border flex flex-col gap-2 rounded-md border p-3">
      <h4 className="text-label text-foreground">{title}</h4>
      {body}
    </section>
  );
  const setPanels = (patch: NonNullable<ExamDraft["panels"]>) =>
    onExam((d) => ({ ...d, panels: { ...d.panels, ...patch } }));
  const out: ReactNode[] = [];
  if (system === "respiratory") {
    const a = r("acute_asthma_severity");
    if (a && a.status !== "none")
      out.push(
        panel(
          "Acute asthma (SIGN 158)",
          <div className="flex flex-col gap-2">
            <Chip
              selected={!!v.exam.panels?.asthmaConfirmed}
              disabled={!editable}
              onPress={() => setPanels({ asthmaConfirmed: !v.exam.panels?.asthmaConfirmed })}
            >
              This is acute asthma
            </Chip>
            <ResultPill r={a} />
            <Button
              variant="link"
              size="sm"
              className="self-start text-teal-800"
              onClick={() => onGo({ system: VITALS, panel: "peakFlow" })}
            >
              Peak flow
            </Button>
          </div>,
        ),
      );
    const c = r("crb65");
    if (c && c.status !== "none") out.push(panel("CRB65", <ResultPill r={c} />));
  }
  if (system === "nervous") {
    const ro = r("rosier");
    if (ro && ro.status !== "none") {
      const rp = v.exam.panels?.rosier ?? {};
      const def = v.ecat.data.classifiers.rosier as {
        points: {
          points: number;
          when: Record<string, unknown>;
          label: string;
          requires_new?: boolean;
        }[];
      };
      const met = def.points.filter((pt) => pt.points > 0 && evalCond(pt.when, v.x));
      out.push(
        panel(
          "ROSIER",
          <div className="flex flex-col gap-2">
            {(["syncope", "seizure"] as const).map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <span className="text-body-s w-56">
                  {k === "syncope"
                    ? "Loss of consciousness or syncope, this episode"
                    : "Seizure activity, this episode"}
                </span>
                <Segmented
                  label={k}
                  value={rp[k]}
                  disabled={!editable}
                  onPick={(ans) =>
                    setPanels({ rosier: { ...rp, [k]: rp[k] === ans ? undefined : ans } })
                  }
                  options={[
                    { id: "yes", label: "Yes" },
                    { id: "no", label: "No" },
                  ]}
                />
              </div>
            ))}
            {met.map((pt) => {
              const id = rosierSignId(pt.label);
              const on = !!rp.newSigns?.includes(id);
              return (
                <Chip
                  key={id}
                  selected={on}
                  disabled={!editable}
                  onPress={() =>
                    setPanels({
                      rosier: {
                        ...rp,
                        newSigns: on
                          ? rp.newSigns!.filter((x) => x !== id)
                          : [...(rp.newSigns ?? []), id],
                      },
                    })
                  }
                >
                  {`${pt.label}: new since the symptoms began`}
                </Chip>
              );
            })}
            <ResultPill r={ro} />
            {ro.note ? <StatusWord tone="caution">{ro.note}</StatusWord> : null}
          </div>,
        ),
      );
    }
  }
  if (system === "abdomen" && v.exam.entries["ex.abdomen.liver_stigmata"]?.state === "positive") {
    const sug = westHavenSuggestion(v.x);
    out.push(
      panel(
        "West Haven grade (optional, your choice)",
        <div className="flex flex-col gap-2">
          <Segmented
            label="West Haven grade"
            value={v.exam.panels?.westHaven}
            disabled={!editable}
            onPick={(g) => setPanels({ westHaven: v.exam.panels?.westHaven === g ? undefined : g })}
            options={(["I", "II", "III", "IV"] as const).map((g) => ({
              id: g,
              label: `Grade ${g}`,
            }))}
          />
          {sug ? (
            <p className="text-caption text-indigo-700 dark:text-indigo-300">{`Suggested from orientation, GCS and asterixis: grade ${sug}. You decide.`}</p>
          ) : null}
        </div>,
      ),
    );
  }
  return out.length ? <div className="grid gap-2 md:grid-cols-2">{out}</div> : null;
}

/* ─── The step ────────────────────────────────────────────────────── */

export function ExamStep(p: ExamStepProps) {
  const { v, editable, onExam, place } = p;
  const [ne, setNe] = useState<null | { kind: "system" | "item"; id: string; label: string }>(null);
  const [toast, setToast] = useState<null | { text: string; undo: Undo }>(null);
  const [confirmE2, setConfirmE2] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const systems = v.ecat.systems;
  const system = place.system === VITALS ? null : (v.ecat.system(place.system) ?? systems[0]!);
  const parts = system?.parts ?? [];
  const part = parts.find((x) => x.id === place.part) ?? parts[0];
  const go = (pl: ExamPlace) => {
    setToast(null);
    p.onPlace(pl);
  };

  // Scroll a targeted item into view (suggestions, badges, links).
  useEffect(() => {
    if (!place.item) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-item="${place.item}"]`);
    el?.scrollIntoView({ block: "center" });
    el?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [place.item, place.part, place.system]);

  const e2 = () => {
    if (!system) return;
    const r = A.everythingElseNormal(v.ecat, v.exam, system.id, {
      partId: undefined,
      sex: p.sex,
      gateOpen: v.gateOpen,
    });
    if (!r.set.length)
      return setToast({
        text: "Nothing left unrecorded that has a normal answer.",
        undo: { entries: {} },
      });
    onExam(() => r.draft);
    setToast({
      text: `Set ${r.set.length} unrecorded item${r.set.length === 1 ? "" : "s"} to the expected answer.`,
      undo: r.undo,
    });
  };

  // Keys (§5.16), with focus outside text fields and no dialog open.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const ids = [VITALS, ...systems.map((s) => s.id)];
      const at = ids.indexOf(place.system);
      const pi = parts.findIndex((x) => x.id === part?.id);
      if (ev.key === "]" || ev.key === "[") {
        if (!parts.length) return;
        const next =
          parts[Math.min(parts.length - 1, Math.max(0, pi + (ev.key === "]" ? 1 : -1)))]!;
        go({ system: place.system, part: next.id });
      } else if (ev.key === "}" || ev.key === "{") {
        const id = ids[Math.min(ids.length - 1, Math.max(0, at + (ev.key === "}" ? 1 : -1)))]!;
        go({ system: id });
      } else if (ev.key === "a" || ev.key === "p") {
        const row = t?.closest<HTMLElement>("[data-item]");
        const b = row?.querySelector<HTMLButtonElement>(`[data-answer="${ev.key}"]`);
        if (!b) return;
        b.click();
      } else if (ev.key === "e" && editable && system) setConfirmE2(true);
      else if (ev.key === "x" && editable && system) {
        const row = t?.closest<HTMLElement>("[data-item]");
        const id = row?.dataset.item;
        setNe(
          id
            ? { kind: "item", id, label: v.ecat.item(id)?.label ?? id }
            : { kind: "system", id: system.id, label: system.name },
        );
      } else if (ev.key === "g") go({ system: "general", part: "consciousness" });
      else return;
      ev.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const onGoSuggestion = (s: Suggestion) => {
    const pl = placeOfTarget(v.x, s.target);
    if (pl) go({ system: pl.system, part: pl.part, item: pl.item, panel: pl.panel });
  };

  const vitalsLine = (() => {
    const saved = v.exam.vitalsSavedAt;
    const typed = Object.values(v.parsed.values).filter((x) => x !== null).length;
    if (saved) return { line: `Saved ${p.time(saved)}`, tone: "done" as const };
    if (typed) return { line: `${typed} typed, not saved`, tone: "partial" as const };
    return { line: "Not measured here", tone: "open" as const };
  })();

  const locked = !!system?.gate && !v.gateOpen;
  const gateReason =
    v.suggestions.find((s) => s.target.startsWith("ex.rectal_genital"))?.reasons[0] ?? "";
  const status = system ? v.systems[system.id]! : null;
  const paeds = p.ageYears !== null && p.ageYears < 15;

  return (
    <div className="flex flex-col gap-4" data-slot="exam-step">
      {paeds ? (
        <StatusWord tone="caution">
          The paediatric examination is not yet structured: adult classifiers show “not applicable”.
        </StatusWord>
      ) : null}
      <SuggestionStrip items={v.suggestions} onGo={onGoSuggestion} />
      <SystemsGrid
        v={v}
        current={place.system}
        onPick={(id) => go({ system: id })}
        vitalsLine={vitalsLine}
      />

      {place.system === VITALS ? (
        <VitalsCard
          v={v}
          editable={editable}
          act={p.act}
          onExam={onExam}
          onSave={p.onSave}
          onGo={(s, pt) => go({ system: s, part: pt })}
          triage={p.triage}
          time={p.time}
          openPanel={place.panel ?? null}
        />
      ) : system ? (
        <section
          ref={panelRef}
          aria-labelledby="exam-system-heading"
          className="border-border bg-card flex flex-col gap-3 overflow-hidden rounded-lg border pb-3 max-sm:rounded-2xl"
        >
          <header className="border-border bg-muted/40 flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 max-sm:px-3.5">
            <div className="flex flex-col">
              <h3
                id="exam-system-heading"
                tabIndex={-1}
                className="text-heading-s text-foreground outline-none"
              >
                {system.name}
              </h3>
              <span className="text-caption text-muted-foreground">{status!.line}</span>
            </div>
            {editable ? (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const c = A.clearSystem(v.ecat, v.exam, system.id);
                    onExam(() => c.draft);
                    setToast({ text: `Cleared ${system.name}.`, undo: c.undo });
                  }}
                >
                  Clear
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={locked}
                  onClick={e2}
                  aria-keyshortcuts="e"
                >
                  Everything else normal
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setNe({ kind: "system", id: system.id, label: system.name })}
                  aria-keyshortcuts="x"
                >
                  Not examined…
                </Button>
              </div>
            ) : null}
          </header>
          {toast ? (
            <p
              role="status"
              className="text-body-s bg-muted mx-4 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 max-sm:mx-3.5"
            >
              {toast.text}
              {Object.keys(toast.undo.entries).length ? (
                <Button
                  variant="link"
                  className="text-teal-800"
                  size="sm"
                  onClick={() => (onExam((d) => A.applyUndo(d, toast.undo)), setToast(null))}
                >
                  Undo
                </Button>
              ) : null}
            </p>
          ) : null}

          {system.id === "feet" ? (
            <div className="flex flex-wrap gap-3 px-4 max-sm:px-3.5">
              {["iwgdf_risk", "dfi_iwgdf_idsa", "sinbad"].map((id) => {
                const r = v.results.get(id);
                return r && r.status !== "none" ? (
                  <div key={id} className="flex flex-col gap-0.5">
                    <ResultPill r={r} />
                    {r.hint ? (
                      <span className="text-caption text-muted-foreground">{r.hint}</span>
                    ) : null}
                    {r.note ? (
                      <span className="text-caption text-amber-800 dark:text-amber-200">
                        {r.note}
                      </span>
                    ) : null}
                  </div>
                ) : null;
              })}
            </div>
          ) : null}

          <div className="px-4 empty:hidden max-sm:px-3.5">
            {system.gate ? (
              <IntimateGate
                v={v}
                editable={editable}
                onExam={onExam}
                actor={p.actor}
                reason0={gateReason}
              />
            ) : null}
          </div>

          <div
            role="tablist"
            aria-label={`${system.name} parts`}
            className="bg-muted mx-4 flex gap-0.5 self-start overflow-x-auto rounded-md p-0.5 max-sm:mx-3.5 max-sm:max-w-[calc(100%-1.75rem)]"
          >
            {parts.map((pt) => {
              const recorded = pt.items.filter((id) => v.exam.entries[id]).length;
              const total = pt.items.filter(
                (id) =>
                  v.ecat.item(id)?.response.type !== "link" &&
                  appliesToSex(v.ecat.item(id)!, p.sex),
              ).length;
              const on = pt.id === part?.id;
              return (
                <button
                  key={pt.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => go({ system: system.id, part: pt.id })}
                  className={cn(
                    "text-body-s inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 pointer-coarse:min-h-11",
                    FOCUS,
                    on
                      ? "bg-card text-foreground font-medium shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {pt.label}
                  {total && recorded >= total ? (
                    <CheckIcon aria-label="all recorded" className="size-3.5 text-teal-700" />
                  ) : recorded ? (
                    <span className="text-caption font-mono tabular-nums">{`${recorded}/${total}`}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            aria-label={part?.label}
            className={cn(
              "flex flex-col px-4 max-sm:px-3.5",
              locked && "pointer-events-none opacity-60",
            )}
            inert={locked}
          >
            {part?.block === "consciousness" ? (
              <ConsciousnessBlock v={v} editable={editable} onExam={onExam} />
            ) : null}
            {part?.block === "amts" ? (
              <AmtsBlock v={v} editable={editable} onExam={onExam} />
            ) : null}
            <div className="divide-border flex flex-col divide-y">
              {part?.items
                .map((id) => v.ecat.item(id)!)
                .filter((it) => appliesToSex(it, p.sex))
                .map((it) =>
                  it.id === "ex.nervous.link_consciousness" ? (
                    <ConsciousnessBlock
                      key={it.id}
                      v={v}
                      editable={editable}
                      onExam={onExam}
                      readOnly
                      onOpenOwner={() => go({ system: "general", part: "consciousness" })}
                    />
                  ) : it.id === "ex.feet.link_foot_pulses" ? (
                    <PulsesGrid
                      key={it.id}
                      v={v}
                      editable={editable}
                      onExam={onExam}
                      rows={["Dorsalis pedis", "Posterior tibial"]}
                      readOnly
                      onOpenOwner={() => go({ system: "cardiovascular", part: "palpation" })}
                    />
                  ) : (
                    <ItemRow
                      key={it.id}
                      v={v}
                      item={it}
                      editable={editable && !locked}
                      sex={p.sex}
                      onExam={onExam}
                      onGo={(s, pt, item) => go({ system: s, part: pt, item })}
                      onNotExamined={(id) =>
                        setNe({ kind: "item", id, label: v.ecat.item(id)?.label ?? id })
                      }
                    />
                  ),
                )}
            </div>
            {part?.block === "pulses_grid" ? (
              <PulsesGrid v={v} editable={editable} onExam={onExam} />
            ) : null}
            {part?.block === "motor_grids" ? (
              <MotorGrids v={v} editable={editable} onExam={onExam} />
            ) : null}
          </div>

          <div className="px-4 empty:hidden max-sm:px-3.5">
            <Panels v={v} system={system.id} editable={editable} onExam={onExam} onGo={go} />
          </div>
        </section>
      ) : null}

      <NotExaminedDialog
        v={v}
        open={!!ne}
        what={ne?.label ?? ""}
        onClose={() => setNe(null)}
        onPick={(r) =>
          ne &&
          onExam((d) =>
            ne.kind === "system"
              ? A.setSystemNotExamined(d, ne.id, r)
              : A.setNotExamined(d, ne.id, r),
          )
        }
      />
      <EmrDialog
        open={confirmE2}
        onOpenChange={setConfirmE2}
        title="Everything else normal?"
        description={`${system?.name ?? ""}: every unrecorded item with a normal answer is set to it. You can undo it.`}
        width="medium"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmE2(false)}>
              Cancel
            </Button>
            <Button onClick={() => (e2(), setConfirmE2(false))}>Set them</Button>
          </>
        }
      >
        <p className="text-body-s text-muted-foreground">
          Links, devices, blocks, oxygen and consciousness are never set this way.
        </p>
      </EmrDialog>
    </div>
  );
}
