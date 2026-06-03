"use client";

import type { Requirement } from "@/lib/doctor/capabilities";
import type { PrescriptionOption, SafetyFlag } from "@/lib/prescribing/engine";
import type { TimelineEvent } from "@/lib/resus/types";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangleIcon, InfoIcon, ShieldAlertIcon, XIcon } from "lucide-react";

import {
  priorAdministrationsFromTimeline,
  recordedAllergiesFromTimeline,
} from "@/lib/prescribing/administration";
import { resolvePrescriptionOptions } from "@/lib/prescribing/engine";
import { cn } from "@/lib/utils";
import { recordEmergencyAdministration, recordResusAllergies } from "../../actions";

/** This cadre's prescribing authority (cosign policy) for the two prescription
 *  kinds. In an emergency it NEVER hard-blocks — a non-prescriber administers
 *  under the resus protocol; the dialog flags it + the record attributes it. */
export interface PrescribeAuthority {
  routine: Requirement;
  controlled: Requirement;
}

const SEVERITY_STYLE: Record<
  SafetyFlag["severity"],
  { token: string; icon: typeof InfoIcon; word: string }
> = {
  block: {
    token: "border-rose-500/70 bg-rose-50/70 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
    icon: ShieldAlertIcon,
    word: "Blocker",
  },
  warn: {
    token:
      "border-amber-400/70 bg-amber-50/70 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200",
    icon: AlertTriangleIcon,
    word: "Check",
  },
  info: {
    token: "border-border bg-muted/40 text-muted-foreground",
    icon: InfoIcon,
    word: "Note",
  },
};

/**
 * Bedside smart-prescribing dialog (GATE D). A resus recommendation resolves
 * to pre-filled option(s); the clinician reviews the dose/concentration + the
 * safety flags → confirms (record). Emergency mode = the prescription IS the
 * administration (grab-and-give), recorded to the immutable timeline. The
 * indication-appropriate concentration is unmistakable; a `block` flag needs
 * an override reason; controlled drugs need a witness. Decision-support only.
 */
export function PrescribeDialog({
  episodeId,
  recCode,
  recLabel,
  patientAgeYears,
  prescribeAuthority,
  timeline,
  onClose,
  onDone,
}: {
  episodeId: string;
  recCode: string;
  recLabel: string;
  patientAgeYears: number | null;
  prescribeAuthority: PrescribeAuthority;
  timeline: TimelineEvent[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [weightKg, setWeightKg] = useState<string>("");
  const [selected, setSelected] = useState(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [witness, setWitness] = useState("");
  const [allergyDraft, setAllergyDraft] = useState("");

  const allergies = useMemo(() => recordedAllergiesFromTimeline(timeline), [timeline]);
  const priors = useMemo(() => priorAdministrationsFromTimeline(timeline), [timeline]);
  const allergyKnown = useMemo(
    () => timeline.some((e) => (e.payload as { allergyCapture?: unknown }).allergyCapture),
    [timeline],
  );

  const options: PrescriptionOption[] = useMemo(
    () =>
      resolvePrescriptionOptions(
        recCode,
        {
          ageYears: patientAgeYears,
          weightKg: weightKg ? Number(weightKg) : null,
          allergies,
          conditions: [],
        },
        priors,
      ),
    [recCode, patientAgeYears, weightKg, allergies, priors],
  );

  if (options.length === 0) return null;
  const opt = options[Math.min(selected, options.length - 1)]!;
  const drug = opt.drug;

  // Cadre prescribing authority for THIS drug (controlled vs routine). Never a
  // hard block in an emergency — a non-prescriber administers under the resus
  // protocol; this flags it (and the server records the attribution).
  const authReq = drug.controlled ? prescribeAuthority.controlled : prescribeAuthority.routine;
  const authorityFlag: SafetyFlag | null =
    authReq === "blocked"
      ? {
          code: "controlled",
          severity: "warn",
          message:
            "You are not an authorised prescriber for this drug — recording as administered under the resus protocol. A prescriber should authorise / witness.",
          overrideable: true,
        }
      : authReq === "cosign_required"
        ? {
            code: "controlled",
            severity: "info",
            message:
              "This prescription needs a prescriber co-sign — record the prescriber as witness.",
            overrideable: true,
          }
        : null;
  const displayFlags = authorityFlag ? [...opt.flags, authorityFlag] : opt.flags;

  const blockFlags = opt.flags.filter((f) => f.severity === "block");
  const needsOverride = blockFlags.length > 0;
  const needsWitness = drug.controlled;
  const canConfirm =
    !pending &&
    (!needsOverride || overrideReason.trim().length >= 3) &&
    (!needsWitness || witness.trim().length >= 2);

  function captureAllergies(nkda: boolean) {
    startTransition(async () => {
      const substances = nkda
        ? []
        : allergyDraft
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      await recordResusAllergies({ episodeId, substances, nkda });
      setAllergyDraft("");
      onDone();
    });
  }

  function confirm() {
    if (!canConfirm) return;
    startTransition(async () => {
      const res = await recordEmergencyAdministration({
        episodeId,
        drugId: drug.id,
        route: drug.adult?.route[0],
        amountMg: drug.unitDoseMg,
        witnessUserId: undefined, // witness captured as a note below; UUID lookup is out of scope here
        overrideReason: needsOverride ? overrideReason.trim() : undefined,
        overriddenFlags: needsOverride ? blockFlags.map((f) => f.code) : undefined,
      });
      if (!("error" in res)) {
        onDone();
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Prescribe — ${recLabel}`}
    >
      <div className="border-border bg-card flex max-h-[92svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border shadow-xl sm:rounded-2xl">
        {/* Header */}
        <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-muted-foreground/70 font-mono text-[10px] tracking-[0.14em] uppercase">
              Prescribe / record
            </p>
            <h2 className="text-foreground truncate text-[15px] font-semibold">{recLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
            aria-label="Close"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">
          {/* Option picker (e.g. hydrocortisone IV vs prednisolone PO) */}
          {options.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {options.map((o, i) => (
                <button
                  key={o.drug.id}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                    i === selected
                      ? "border-foreground/30 bg-foreground/90 text-background font-medium"
                      : "border-border bg-muted/30 text-foreground/80 hover:bg-muted/60",
                  )}
                >
                  {o.drug.name}
                </button>
              ))}
            </div>
          ) : null}

          {/* The resolved drug — dose + concentration unmistakable */}
          <div className="border-border bg-muted/20 rounded-xl border p-3">
            <p className="text-foreground text-[14px] font-semibold">{drug.name}</p>
            <p className="text-muted-foreground text-[11px]">
              {drug.drugClass} · T-{drug.tier.replace(/_/g, " ")}
            </p>
            {drug.adult ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                <dt className="text-muted-foreground/70">Dose</dt>
                <dd className="text-foreground font-mono font-semibold tabular-nums">
                  {drug.adult.dose}
                </dd>
                <dt className="text-muted-foreground/70">Concentration</dt>
                <dd className="text-foreground font-mono tabular-nums">
                  {drug.adult.concentration}
                </dd>
                <dt className="text-muted-foreground/70">Route</dt>
                <dd className="text-foreground font-mono uppercase">
                  {drug.adult.route.join(" / ")}
                </dd>
                <dt className="text-muted-foreground/70">Interval</dt>
                <dd className="text-foreground/90">{drug.adult.interval}</dd>
                <dt className="text-muted-foreground/70">Max</dt>
                <dd className="text-foreground/90">{drug.adult.max}</dd>
              </dl>
            ) : (
              <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-300">
                {drug.recordOnly
                  ? "Record-only — the skilled operator doses; record what was given."
                  : "Category-level — the clinician doses (no fixed surface dose)."}
              </p>
            )}
            <p className="text-muted-foreground/60 mt-2 font-mono text-[10px]">{drug.source}</p>
          </div>

          {/* Allergy gate — must be surfaced before confirm */}
          {!allergyKnown ? (
            <div className="rounded-xl border border-amber-400/70 bg-amber-50/60 p-3 dark:bg-amber-950/20">
              <p className="text-[12px] font-semibold text-amber-900 dark:text-amber-200">
                Allergies not yet recorded — check before giving.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <input
                  value={allergyDraft}
                  onChange={(e) => setAllergyDraft(e.target.value)}
                  placeholder="e.g. penicillin, peanut"
                  className="border-border bg-card text-foreground min-w-0 flex-1 rounded-md border px-2 py-1 text-[12px] outline-none"
                />
                <button
                  type="button"
                  disabled={pending || !allergyDraft.trim()}
                  onClick={() => captureAllergies(false)}
                  className="rounded-md bg-teal-600 px-2 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => captureAllergies(true)}
                  className="border-border rounded-md border px-2 py-1 text-[11.5px] disabled:opacity-50"
                >
                  No known allergies
                </button>
              </div>
            </div>
          ) : allergies.length > 0 ? (
            <p className="text-[11.5px] text-rose-700 dark:text-rose-300">
              ⚠ Recorded allergies: {allergies.join(", ")}
            </p>
          ) : (
            <p className="text-muted-foreground text-[11.5px]">✓ NKDA recorded</p>
          )}

          {/* Paediatric weight capture */}
          {patientAgeYears != null && patientAgeYears < 16 ? (
            <label className="flex items-center gap-2 text-[12px]">
              <span className="text-muted-foreground">Weight (kg) — paediatric</span>
              <input
                type="number"
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="border-border bg-card text-foreground w-20 rounded-md border px-2 py-1 font-mono tabular-nums outline-none"
              />
            </label>
          ) : null}

          {/* Safety flags */}
          {displayFlags.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {displayFlags.map((f, i) => {
                const s = SEVERITY_STYLE[f.severity];
                const Icon = s.icon;
                return (
                  <div
                    key={`${f.code}-${i}`}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border px-2.5 py-1.5",
                      s.token,
                    )}
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <p className="text-[11.5px] leading-snug">
                      <span className="font-semibold">{s.word}:</span> {f.message}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Override reason (required if a blocker) */}
          {needsOverride ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-rose-700 dark:text-rose-300">
                Override reason (recorded + audited) — required
              </span>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                className="border-border bg-card text-foreground rounded-md border px-2 py-1 text-[12px] outline-none"
                placeholder="Clinical justification to proceed despite the blocker"
              />
            </label>
          ) : null}

          {/* Witness (required for controlled drugs) */}
          {needsWitness ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold">
                Controlled drug — witness name/ID (required)
              </span>
              <input
                value={witness}
                onChange={(e) => setWitness(e.target.value)}
                className="border-border bg-card text-foreground rounded-md border px-2 py-1 text-[12px] outline-none"
                placeholder="Witnessing clinician"
              />
            </label>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-border flex items-center justify-between gap-2 border-t px-4 py-3">
          <p className="text-muted-foreground/70 text-[10.5px]">
            Records as administered (grab-and-give) on the resus timeline.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border-border text-foreground/80 rounded-lg border px-3 py-1.5 text-[12.5px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={confirm}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-50",
                needsOverride ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-600 hover:bg-teal-700",
              )}
            >
              {needsOverride ? "Override + record" : "Confirm + record"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
