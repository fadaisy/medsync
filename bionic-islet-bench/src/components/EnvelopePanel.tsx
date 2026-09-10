import { m } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import type { Envelope } from "../engine/params.ts";
import { logTime } from "../lib/format.ts";
import { benchData } from "../store/benchData.ts";
import { useBench } from "../store/bench.ts";

/**
 * The clinician envelope.
 *
 * Changing a dosing bound is the one thing on this bench that is gated: a
 * simulated multi-factor step, then a change, then an audit entry. The gate
 * is simulated, and says so, because a real one would need a real identity
 * provider and this bench has no backend at all.
 */

type Field = {
  key: keyof Envelope;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  note: string;
};

const FIELDS: Field[] = [
  { key: "basalRate", label: "Nominal basal", unit: "U/h", min: 0, max: 3, step: 0.05, note: "The rate the controller works around." },
  { key: "maxBasal", label: "Basal ceiling", unit: "U/h", min: 0.2, max: 5, step: 0.1, note: "Hard bound. The controller can never command above this." },
  { key: "maxBolus", label: "Bolus ceiling", unit: "U", min: 0.5, max: 8, step: 0.25, note: "Hard bound on any single bolus, meal or correction." },
  { key: "target", label: "Glucose target", unit: "mmol/L", min: 4.5, max: 9, step: 0.1, note: "What the controller aims the lower edge of its band at." },
  { key: "correctionThreshold", label: "Correction above", unit: "mmol/L", min: 7, max: 16, step: 0.5, note: "Predicted glucose above which a correction bolus is considered." },
  { key: "suspendThreshold", label: "Suspend below", unit: "mmol/L", min: 3, max: 6, step: 0.1, note: "Predicted glucose below which basal is held at zero." },
  { key: "isf", label: "Sensitivity factor", unit: "mmol/L per U", min: 1, max: 6, step: 0.1, note: "How far one unit is expected to lower glucose." },
  { key: "icr", label: "Carbohydrate ratio", unit: "g per U", min: 4, max: 25, step: 0.5, note: "Grams of carbohydrate covered by one unit." },
  { key: "safeBasal", label: "Safe basal", unit: "U/h", min: 0, max: 3, step: 0.05, note: "Used when the supervisor says invalid. Held at or below the nominal rate by the engine, so falling back can never raise insulin." },
];

export function EnvelopePanel({ onClose }: { onClose: () => void }) {
  const changeEnvelope = useBench((s) => s.changeEnvelope);
  const current = benchData.state?.envelope;
  const [step, setStep] = useState<"mfa" | "edit">("mfa");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Envelope | null>(current ? { ...current } : null);
  const [actor, setActor] = useState("Dr A. Nakato");
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      // Keep focus inside the dialog while it is open.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!current || !draft) return null;

  const submitMfa = (event: React.FormEvent) => {
    event.preventDefault();
    // The simulated second factor. Any six digits are accepted, because
    // there is nothing here to authenticate against and pretending otherwise
    // would be the bench claiming a security property it does not have.
    if (!/^\d{6}$/.test(code)) {
      setError("Enter any six digits. This step is simulated and checks the shape only.");
      return;
    }
    setError(null);
    setStep("edit");
  };

  const apply = () => {
    const changes: Partial<Envelope> = {};
    for (const field of FIELDS) {
      if (draft[field.key] !== current[field.key]) {
        (changes as Record<string, unknown>)[field.key] = draft[field.key];
      }
    }
    if (draft.onInvalid !== current.onInvalid) changes.onInvalid = draft.onInvalid;
    if (Object.keys(changes).length > 0) changeEnvelope(changes, actor);
    onClose();
  };

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <m.div
        ref={dialogRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="envelope-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-[var(--radius-card)] border border-edge bg-panel shadow-card"
      >
        <header className="flex items-baseline justify-between border-b border-edge px-4 py-3">
          <div>
            <h2 id="envelope-title" className="text-heading-m">
              Clinician envelope
            </h2>
            <p className="text-micro text-muted">
              The bounds the controller must stay inside. Changing them is audited.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-control)] border border-edge px-2 py-1 text-micro text-muted hover:border-teal-bright hover:text-teal-bright"
          >
            Close
          </button>
        </header>

        {step === "mfa" ? (
          <form className="p-4" onSubmit={submitMfa}>
            <p className="mb-3 rounded-[var(--radius-control)] border border-amber/40 bg-amber/10 p-2 text-micro leading-snug text-amber">
              Simulated multi-factor step. There is no identity provider behind this bench and no
              backend of any kind, so this checks the shape of the code and nothing else. It is
              here to show where the gate sits, not to be one.
            </p>
            <label className="block text-micro text-muted" htmlFor="mfa-code">
              Six digit code from the clinician's authenticator
            </label>
            <input
              id="mfa-code"
              ref={firstFieldRef}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              aria-describedby={error ? "mfa-error" : undefined}
              aria-invalid={error !== null}
              className="tabular mt-1 w-full rounded-[var(--radius-control)] border border-edge bg-[#0d1424] px-2 py-1.5 text-body text-[#e8edf5]"
            />
            {error ? (
              <p id="mfa-error" role="alert" className="mt-1 text-micro text-amber">
                {error}
              </p>
            ) : null}
            <label className="mt-3 block text-micro text-muted" htmlFor="mfa-actor">
              Acting clinician, recorded in the audit entry
            </label>
            <input
              id="mfa-actor"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              className="mt-1 w-full rounded-[var(--radius-control)] border border-edge bg-[#0d1424] px-2 py-1.5 text-body text-[#e8edf5]"
            />
            <button
              type="submit"
              className="mt-3 w-full rounded-[var(--radius-control)] border border-teal-bright bg-teal-bright px-3 py-1.5 text-body text-bench transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] hover:bg-teal-100"
            >
              Verify and open the envelope
            </button>
          </form>
        ) : (
          <div className="p-4">
            <div className="grid gap-2">
              {FIELDS.map((field, index) => (
                <div key={field.key} className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <label htmlFor={`env-${field.key}`} className="text-micro text-[#cfd8e6]">
                    {field.label}
                    <span className="ml-1 text-muted">{field.unit}</span>
                    <span className="block text-micro leading-snug text-muted">{field.note}</span>
                  </label>
                  <input
                    id={`env-${field.key}`}
                    ref={index === 0 ? firstFieldRef : undefined}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={String(draft[field.key])}
                    onChange={(event) =>
                      setDraft({ ...draft, [field.key]: Number(event.target.value) })
                    }
                    className="tabular w-24 rounded-[var(--radius-control)] border border-edge bg-[#0d1424] px-2 py-1 text-right text-small text-[#e8edf5]"
                  />
                </div>
              ))}
              <fieldset className="mt-1 rounded-[var(--radius-control)] border border-edge p-2">
                <legend className="px-1 text-micro text-muted">
                  What invalid means for this patient
                </legend>
                {(["safe-basal", "suspend"] as const).map((option) => (
                  <label key={option} className="mr-3 inline-flex items-center gap-1.5 text-micro">
                    <input
                      type="radio"
                      name="on-invalid"
                      checked={draft.onInvalid === option}
                      onChange={() => setDraft({ ...draft, onInvalid: option })}
                    />
                    {option === "safe-basal" ? "Fall back to safe basal" : "Suspend delivery"}
                  </label>
                ))}
              </fieldset>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={apply}
                className="flex-1 rounded-[var(--radius-control)] border border-teal-bright bg-teal-bright px-3 py-1.5 text-body text-bench transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] hover:bg-teal-100"
              >
                Apply and write the audit entry
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--radius-control)] border border-edge px-3 py-1.5 text-body text-muted hover:border-teal-bright hover:text-teal-bright"
              >
                Cancel
              </button>
            </div>

            <h3 className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted">
              Audit log
            </h3>
            <ol className="mt-1 font-mono text-micro">
              {benchData.audit.length === 0 ? (
                <li className="text-muted">No envelope changes yet.</li>
              ) : (
                benchData.audit
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <li key={`${entry.t}-${index}`} className="border-t border-edge/60 py-1">
                      <span className="text-muted">{logTime(entry.t)}</span>{" "}
                      <span className="text-teal-bright">{entry.actor}</span>{" "}
                      <span className="text-muted">
                        {entry.mfaSatisfied ? "[MFA ok]" : "[no MFA]"}
                      </span>{" "}
                      <span className="text-[#cfd8e6]">{entry.change}</span>
                    </li>
                  ))
              )}
            </ol>
          </div>
        )}
      </m.div>
    </m.div>
  );
}
