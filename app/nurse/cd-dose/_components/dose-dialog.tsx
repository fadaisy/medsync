"use client";

import { useEffect, useState } from "react";

import { Chips, Choice, Dlg, Field, newKey, Stepper, useAct } from "@/app/pharmacy/controls/_components/kit";
import { WitnessDialog } from "@/app/pharmacy/_components/witness";
import { LabButton } from "@/components/tide/work/button";
import { CONTROLS_RULES as RULES, CTL } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { cdUnit, doseUnits, mgFmt } from "@/lib/pharmacy/cd/derive";
import { cdDoseContextAction, recordCdDoseAction } from "../actions";

type Reg = { medicineId: string; name: string; balance: number };
type Ctx = Awaited<ReturnType<typeof cdDoseContextAction>>;
const X = CTL.dose;

/** Record a controlled dose: patient, prescriber, dose (ampoules and residue worked out), then a witness on duty. */
export function DoseButton({ ward, register }: { ward: { id: string; name: string }; register: Reg }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LabButton onClick={() => setOpen(true)}>{CTL.nurse.record}</LabButton>
      {open ? <DoseDialog ward={ward} register={register} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DoseDialog({ ward, register, onClose }: { ward: { id: string; name: string }; register: Reg; onClose: () => void }) {
  const unit = cdUnit(register.name);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [patient, setPatient] = useState<{ userId: string | null; label: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [prescriber, setPrescriber] = useState<string | null>(null);
  const [doseMg, setDoseMg] = useState<number>(unit?.mg ?? 0);
  const [route, setRoute] = useState<string>(RULES.routes[0]);
  const [residue, setResidue] = useState(false);
  const [witness, setWitness] = useState(false);
  const [key] = useState(newKey);
  const { pending, error, setError, run } = useAct();
  useEffect(() => {
    void cdDoseContextAction({ locationId: ward.id, medicineId: register.medicineId }).then(setCtx, () => setError(CTL.common.failed));
  }, [ward.id, register.medicineId, setError]);
  const u = unit ? doseUnits(doseMg, unit) : null;
  const who = patient ?? (typed.trim().length >= 3 ? { userId: null, label: typed.trim() } : null);
  const missing = !unit
    ? X.unknownStrength
    : !who
      ? X.missing.patient
      : !prescriber
        ? X.missing.prescriber
        : !doseMg
          ? X.missing.dose
          : u!.units > register.balance
            ? fill(X.tooMany, { n: register.balance })
            : u!.residueMg > 0 && !residue
              ? X.missing.residue
              : null;
  const own = (ctx?.prescribers ?? []).filter((p) => p.own);
  const other = (ctx?.prescribers ?? []).filter((p) => !p.own);
  return (
    <>
      <Dlg
        open
        onOpenChange={(o) => !o && onClose()}
        width="wide"
        title={fill(X.title, { med: register.name })}
        sub={fill(X.sub, { place: ward.name, have: register.balance })}
        error={error}
        primary={
          <LabButton variant="primary" busy={pending} disabledReason={missing} onClick={() => setWitness(true)}>
            {X.sign}
          </LabButton>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={X.patient}>
            <div className="flex flex-col gap-1.5">
              {(ctx?.patients ?? []).map((p) => (
                <Choice
                  key={p.userId}
                  on={patient?.userId === p.userId}
                  onClick={() => {
                    setPatient({ userId: p.userId, label: p.name });
                    if (p.admittedBy && ctx?.prescribers.some((x) => x.userId === p.admittedBy)) setPrescriber(p.admittedBy);
                  }}
                >
                  {p.name}
                </Choice>
              ))}
            </div>
            <input
              aria-label={X.patientOther}
              placeholder={X.patientOther}
              value={typed}
              onChange={(e) => (setTyped(e.target.value), setPatient(null))}
              className="bg-card shadow-tide-card rounded-tide-row h-11 px-3 text-[14px]"
            />
          </Field>
          <Field label={X.prescriber}>
            {(
              [
                [fill(X.ownTeam, { place: ward.name }), own],
                [X.otherTeams, other],
              ] as const
            ).map(([label, list]) =>
              list.length ? (
                <div key={label} className="flex flex-col gap-1.5">
                  <span className="text-caption text-ink-600">{label}</span>
                  <Chips>
                    {list.map((p) => (
                      <Choice key={p.userId} on={prescriber === p.userId} onClick={() => setPrescriber(p.userId)}>
                        {p.name}
                      </Choice>
                    ))}
                  </Chips>
                </div>
              ) : null,
            )}
            <span className="text-caption text-ink-600">{X.prescriberHint}</span>
          </Field>
          <Field label={X.dose}>
            <Stepper label={X.dose} value={doseMg} step={unit?.step ?? 1} onChange={setDoseMg} />
            {u && unit ? (
              <span className="text-caption text-ink-600">
                {fill(X.units, { n: u.units, mg: unit.mg, ml: unit.ml })} ·{" "}
                {u.residueMg > 0 ? fill(X.residue, { mg: mgFmt(u.residueMg), ml: mgFmt(u.residueMl) }) : X.noResidue}
              </span>
            ) : null}
          </Field>
          <Field label={X.route}>
            <Chips>
              {RULES.routes.map((r) => (
                <Choice key={r} on={route === r} onClick={() => setRoute(r)}>
                  {r}
                </Choice>
              ))}
            </Chips>
          </Field>
          {u && u.residueMg > 0 ? (
            <Choice on={residue} onClick={() => setResidue(!residue)} className="sm:col-span-2">
              {fill(X.residueTick, { mg: mgFmt(u.residueMg) })}
            </Choice>
          ) : null}
          <p className="text-caption text-ink-600 sm:col-span-2">{X.signNote}</p>
        </div>
      </Dlg>
      <WitnessDialog
        open={witness}
        onOpenChange={setWitness}
        purpose="controlled:cd_dose"
        locationId={ward.id}
        what={fill(X.what, {
          med: register.name,
          dose: `${mgFmt(doseMg)} mg ${route}`,
          patient: who?.label ?? "",
          units: u?.units ?? 0,
          place: ward.name,
          residue: u && u.residueMg > 0 ? fill(X.whatResidue, { mg: mgFmt(u.residueMg) }) : "",
        })}
        onDone={(w) => {
          setWitness(false);
          run(
            () =>
              recordCdDoseAction({
                clientKey: key,
                locationId: ward.id,
                medicineId: register.medicineId,
                patientUserId: who?.userId ?? null,
                patientLabel: who?.label,
                bed: null,
                prescriberUserId: prescriber,
                doseMg,
                route,
                residueDisposed: residue,
                witness: w.how === "phone" ? { attestationId: w.attestationId } : { paper: w.name },
              }),
            onClose,
          );
        }}
      />
    </>
  );
}
