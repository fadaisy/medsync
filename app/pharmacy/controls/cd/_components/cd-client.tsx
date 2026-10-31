"use client";

import type { CdCheck, CdFlag, CdMove, CdPlace } from "@/lib/pharmacy/cd/derive";
import { useState } from "react";

import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Pill } from "@/components/tide/work/kit";
import { CTL, CONTROLS_RULES as RULES } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { cdUnit, inWindow, mgFmt, missingWindow } from "@/lib/pharmacy/cd/derive";
import { Chips, Choice, Dlg, Field, newKey, Stepper, useAct } from "../../_components/kit";
import { WitnessDialog } from "../../../_components/witness";
import { cdCheckAction, cdEventAction, doseContextAction, resolveCdAction } from "../../actions";

/** The whole hours inside a missing-dose window, latest first, at most a day of them: the late entry's time. */
const hoursIn = (w: { from: Date; to: Date }) => {
  const out: Date[] = [];
  for (
    let t = Math.floor(w.to.getTime() / 3_600_000) * 3_600_000;
    t > w.from.getTime() && out.length < 24;
    t -= 3_600_000
  )
    out.push(new Date(t));
  return out;
};
const hourWords = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

type Item = { medicineId: string; name: string; balance: number };
type CaseWord = { owner: string | null; dueAt: Date; closed: boolean };

const K = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala",
  hourCycle: "h23",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const when = (d: Date) => K.format(d);

/** A blind balance check: count first, then see the register, then sign with a witness. */
export function CheckButton({
  place,
  items,
  label,
}: {
  place: CdPlace;
  items: Item[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LabButton size="sm" onClick={() => setOpen(true)}>
        {label}
      </LabButton>
      {open ? <CheckDialog place={place} items={items} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CheckDialog({
  place,
  items,
  onClose,
}: {
  place: CdPlace;
  items: Item[];
  onClose: () => void;
}) {
  const D = CTL.checkDialog;
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [shown, setShown] = useState(false);
  const [witness, setWitness] = useState(false);
  const { pending, error, setError, run } = useAct();
  const [key] = useState(newKey);
  const all = items.every((i) => counts[i.medicineId] != null);
  const diffs = items.filter((i) => counts[i.medicineId] !== i.balance).length;
  return (
    <>
      <Dlg
        open
        onOpenChange={(o) => !o && onClose()}
        title={fill(D.title, { place: place.name })}
        sub={D.sub}
        error={error}
        primary={
          shown ? (
            <LabButton variant="primary" busy={pending} onClick={() => setWitness(true)}>
              {D.sign}
            </LabButton>
          ) : (
            <LabButton
              variant="primary"
              disabledReason={all ? null : D.countAll}
              onClick={() => setShown(true)}
            >
              {D.compare}
            </LabButton>
          )
        }
      >
        {items.length ? (
          <ul className="flex flex-col gap-2">
            {items.map((i) => (
              <li
                key={i.medicineId}
                className="bg-card shadow-tide-card rounded-tide-row flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-[14px] font-semibold">{i.name}</span>
                  <span className="text-caption text-ink-600">
                    {shown
                      ? counts[i.medicineId] === i.balance
                        ? D.matches
                        : fill(D.register, { n: i.balance })
                      : D.hidden}
                  </span>
                </div>
                <Stepper
                  label={i.name}
                  value={counts[i.medicineId] ?? null}
                  onChange={(n) => !shown && setCounts((c) => ({ ...c, [i.medicineId]: n }))}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-s text-ink-600">{D.none}</p>
        )}
        <p className="text-caption text-ink-600">{D.openAmps}</p>
        {shown ? (
          <p className="text-body-s">{diffs ? fill(D.diffs, { n: diffs }) : D.allMatch}</p>
        ) : null}
      </Dlg>
      <WitnessDialog
        open={witness}
        onOpenChange={setWitness}
        purpose="controlled:cd_check"
        locationId={place.id}
        what={fill(D.what, {
          place: place.name,
          counts: items.map((i) => `${i.name} ${counts[i.medicineId]}`).join(", "),
        })}
        onDone={(w) => {
          setWitness(false);
          setError(null);
          run(
            () =>
              cdCheckAction({
                clientKey: key,
                locationId: place.id,
                counts: items.map((i) => ({
                  medicineId: i.medicineId,
                  counted: counts[i.medicineId] ?? 0,
                })),
                witness: w.how === "phone" ? { attestationId: w.attestationId } : { paper: w.name },
              }),
            onClose,
          );
        }}
      />
    </>
  );
}

const F = CTL.flags;

function flagText(f: CdFlag, placeName: Record<string, string>, cases: Record<string, CaseWord>) {
  const place = placeName[f.placeId] ?? "";
  if (f.k === "disc") {
    const diff = f.line.counted - f.line.expected;
    const c = cases[`${f.check.id}|${f.medicineId}`];
    const med = f.medicineId;
    const inv = !c
      ? F.notAssigned
      : c.closed
        ? F.closed
        : !c.owner
          ? F.notAssigned
          : fill(c.dueAt < new Date() ? F.investigatingLate : F.investigating, { owner: c.owner });
    return {
      title: fill(F.disc, { med, place, counted: f.line.counted, expected: f.line.expected }),
      meta: `${fill(F.discMeta, {
        what: fill(diff < 0 ? F.discShort : F.discOver, { n: Math.abs(diff) }),
        when: when(f.check.at),
        by: f.check.by,
      })}${inv}`,
    };
  }
  if (f.k === "due")
    return {
      title: fill(F.due, { place }),
      meta: fill(F.dueMeta, {
        last: f.last ? fill(F.lastChecked, { when: when(f.last.at) }) : CTL.register.never,
        every: F.daily,
      }),
    };
  const m = f.move;
  const verb = m.dose
    ? fill(F.verbGiven, { patient: m.dose.patient })
    : fill(F.verbMoved, { kind: CTL.register.kinds[m.kind] ?? m.kind, place });
  if (f.k === "wit")
    return {
      title: fill(F.wit, { med: m.medicineName, verb }),
      meta: fill(F.witMeta, { place, when: when(m.at), by: m.by }),
    };
  if (f.k === "res")
    return {
      title: fill(F.res, {
        mg: mgFmt(m.dose!.residueMg),
        med: m.medicineName,
        dose: `${mgFmt(m.dose!.doseMg)} mg`,
      }),
      meta: fill(F.resMeta, { place, patient: m.dose!.patient, when: when(m.at) }),
    };
  if (f.k === "gap")
    return {
      title: fill(F.gap, { med: m.medicineName, gap: `${Math.round(f.hours * 10) / 10} h` }),
      meta: fill(F.gapMeta, {
        patient: m.dose!.patient,
        place,
        hours: f.gapHours,
        when: when(m.at),
      }),
    };
  return {
    title: fill(F.paper, { med: m.medicineName, verb }),
    meta: fill(F.paperMeta, { name: m.paperWitness ?? "", when: when(m.at) }),
  };
}

/** What needs fixing, most serious first; each row opens the one signed action that closes it. */
export function FlagList({
  flags,
  placeName,
  cases,
  checks,
  moves,
  forPlace,
}: {
  flags: CdFlag[];
  placeName: Record<string, string>;
  cases: Record<string, CaseWord>;
  checks: CdCheck[];
  moves: CdMove[];
  forPlace: Record<string, Item[]>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [witness, setWitness] = useState<CdFlag | null>(null);
  const { error, setError, run } = useAct();
  const medName = (id: string) => moves.find((m) => m.medicineId === id)?.medicineName ?? id;
  if (!flags.length) return <EmptyState compact title={F.none} />;
  return (
    <>
      {error ? (
        <p role="alert" className="text-body-s text-ink-800 mb-2">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {flags.map((f) => {
          const t = flagText(f, placeName, cases);
          const title =
            f.k === "disc" ? t.title.replace(f.medicineId, medName(f.medicineId)) : t.title;
          const place: CdPlace = { id: f.placeId, name: placeName[f.placeId] ?? "", kind: "" };
          return (
            <li
              key={f.id}
              className="bg-card shadow-tide-card rounded-tide-row flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Pill tone={f.k === "disc" ? "caution" : "neutral"}>{F.tag[f.k]}</Pill>
                  <span className="text-[14px] font-semibold">{title}</span>
                </span>
                <span className="text-caption text-ink-600">{t.meta}</span>
              </div>
              {f.k === "due" ? (
                <CheckButton place={place} items={forPlace[f.placeId] ?? []} label={F.act.due} />
              ) : (
                <LabButton
                  size="sm"
                  onClick={() => (f.k === "wit" || f.k === "res" ? setWitness(f) : setOpen(f.id))}
                >
                  {F.act[f.k]}
                </LabButton>
              )}
              {open === f.id && f.k === "disc" ? (
                <ResolveDialog
                  flag={f}
                  medName={medName(f.medicineId)}
                  placeName={place.name}
                  checks={checks}
                  moves={moves}
                  onClose={() => setOpen(null)}
                />
              ) : null}
              {open === f.id && f.k === "gap" ? (
                <GapDialog flag={f} onClose={() => setOpen(null)} />
              ) : null}
            </li>
          );
        })}
      </ul>
      {witness && (witness.k === "wit" || witness.k === "res") ? (
        <WitnessDialog
          open
          onOpenChange={(o) => !o && setWitness(null)}
          purpose="controlled:late"
          locationId={witness.placeId}
          what={fill(witness.k === "wit" ? CTL.late.witnessWhat : CTL.late.residueWhat, {
            title: flagText(witness, placeName, cases).title,
          })}
          onDone={(w) => {
            const f = witness;
            setWitness(null);
            if (w.how !== "phone") return setError(CTL.common.needOnline);
            run(() =>
              cdEventAction({
                movementId: f.move.id,
                kind: f.k === "wit" ? "witness_added" : "residue_recorded",
                attestationId: w.attestationId,
                reason: null,
              }),
            );
          }}
        />
      ) : null}
    </>
  );
}

function GapDialog({
  flag,
  onClose,
}: {
  flag: Extract<CdFlag, { k: "gap" }>;
  onClose: () => void;
}) {
  const G = CTL.gap;
  const [why, setWhy] = useState<string | null>(null);
  const { pending, error, run } = useAct();
  return (
    <Dlg
      open
      onOpenChange={(o) => !o && onClose()}
      title={G.title}
      error={error}
      primary={
        <LabButton
          variant="primary"
          busy={pending}
          disabledReason={why ? null : G.after}
          onClick={() =>
            run(
              () =>
                cdEventAction({
                  movementId: flag.move.id,
                  kind: "early_reviewed",
                  attestationId: null,
                  reason: why,
                }),
              onClose,
            )
          }
        >
          {G.save}
        </LabButton>
      }
    >
      <dl className="grid grid-cols-2 gap-2 text-[13.5px]">
        <dt className="text-ink-600">{G.before}</dt>
        <dd>
          {when(flag.prev.at)} · {mgFmt(flag.prev.dose!.doseMg)} mg
        </dd>
        <dt className="text-ink-600">{G.now}</dt>
        <dd>
          {when(flag.move.at)} · {mgFmt(flag.move.dose!.doseMg)} mg
        </dd>
      </dl>
      <Field label={G.after}>
        <div className="flex flex-col gap-1.5">
          {G.reasons.map((r) => (
            <Choice key={r} on={why === r} onClick={() => setWhy(r)}>
              {r}
            </Choice>
          ))}
        </div>
      </Field>
    </Dlg>
  );
}

type Ctx = Awaited<ReturnType<typeof doseContextAction>>;

function ResolveDialog({
  flag,
  medName,
  placeName,
  checks,
  moves,
  onClose,
}: {
  flag: Extract<CdFlag, { k: "disc" }>;
  medName: string;
  placeName: string;
  checks: CdCheck[];
  moves: CdMove[];
  onClose: () => void;
}) {
  const R = CTL.resolve;
  const diff = flag.line.counted - flag.line.expected;
  const short = diff < 0;
  const win = missingWindow({ check: flag.check, medicineId: flag.medicineId, checks, moves });
  const unit = cdUnit(medName);
  const [how, setHow] = useState<"recount" | "late_entry" | "loss" | "excess" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [incident, setIncident] = useState("");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [patient, setPatient] = useState<{ label: string; userId: string | null } | null>(null);
  const [prescriber, setPrescriber] = useState<string | null>(null);
  const [givenBy, setGivenBy] = useState<string | null>(null);
  const [at, setAt] = useState("");
  const [doseMg, setDoseMg] = useState<number>(unit?.mg ?? 0);
  const [route, setRoute] = useState<string>(RULES.routes[0]);
  const [residue, setResidue] = useState(false);
  const [witness, setWitness] = useState(false);
  const [key] = useState(newKey);
  const { pending, error, setError, run } = useAct();

  const had = moves.filter(
    (m) =>
      m.dose &&
      m.medicineId === flag.medicineId &&
      m.placeId === flag.placeId &&
      inWindow(m.at, { from: new Date(win.from.getTime() - 86_400_000), to: win.to }),
  );
  const patients = [
    ...new Map(
      [
        ...had.map((m) => ({
          label: m.dose!.patient,
          userId: null as string | null,
          sub: fill(R.hadIt, { when: when(m.at), dose: `${mgFmt(m.dose!.doseMg)} mg` }),
        })),
        ...(ctx?.patients ?? []).map((p) => ({ label: p.name, userId: p.userId, sub: R.onWard })),
      ].map((p) => [p.label, p]),
    ).values(),
  ];
  const atDate = at ? new Date(at) : null;
  const residueMg = unit ? Math.ceil(doseMg / unit.mg) * unit.mg - doseMg : 0;
  const missing =
    how === null
      ? R.found
      : how === "late_entry"
        ? !patient
          ? CTL.dose.missing.patient
          : !prescriber
            ? CTL.dose.missing.prescriber
            : !atDate || !inWindow(atDate, win)
              ? R.outside
              : !unit
                ? CTL.dose.unknownStrength
                : residueMg > 0 && !residue
                  ? CTL.dose.missing.residue
                  : null
        : (how === "loss" || how === "excess") && incident.trim().length < 3
          ? R.incident
          : null;

  const pickHow = (h: typeof how) => {
    setHow(h);
    if (h === "late_entry" && !ctx)
      void doseContextAction({
        locationId: flag.placeId,
        medicineId: flag.medicineId,
        at: flag.check.at,
      }).then(setCtx, () => setError(CTL.common.failed));
  };
  const hows = [
    ["recount", R.recount],
    ...(short
      ? [["late_entry", R.missed] as const, ["loss", R.loss] as const]
      : [["excess", R.excess] as const]),
  ] as const;
  return (
    <>
      <Dlg
        open
        onOpenChange={(o) => !o && onClose()}
        width="wide"
        title={fill(R.title, { med: medName, place: placeName })}
        sub={fill(R.sub, {
          counted: flag.line.counted,
          expected: flag.line.expected,
          when: when(flag.check.at),
          by: flag.check.by,
        })}
        error={error}
        primary={
          <LabButton
            variant="primary"
            busy={pending}
            disabledReason={missing}
            onClick={() => setWitness(true)}
          >
            {R.sign}
          </LabButton>
        }
      >
        <Field label={R.found}>
          <Chips>
            {hows.map(([k, label]) => (
              <Choice key={k} on={how === k} onClick={() => pickHow(k)}>
                {label}
              </Choice>
            ))}
          </Chips>
        </Field>
        {how === "late_entry" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="text-body-s sm:col-span-2">
              {fill(R.window, {
                n: -diff,
                from: when(win.from),
                fromWhat: win.fromMatch ? R.fromMatch : R.fromFirst,
                to: when(win.to),
              })}
            </p>
            <Field label={R.patient}>
              <div className="flex flex-col gap-1.5">
                {patients.map((p) => (
                  <Choice
                    key={p.label}
                    on={patient?.label === p.label}
                    onClick={() => setPatient(p)}
                  >
                    <span className="block">{p.label}</span>
                    <span className="text-caption text-ink-600">{p.sub}</span>
                  </Choice>
                ))}
              </div>
            </Field>
            <Field label={CTL.dose.prescriber}>
              <div className="flex flex-col gap-1.5">
                {(ctx?.prescribers ?? []).map((p) => (
                  <Choice
                    key={p.userId}
                    on={prescriber === p.userId}
                    onClick={() => setPrescriber(p.userId)}
                  >
                    {p.name}
                  </Choice>
                ))}
              </div>
            </Field>
            <Field label={R.givenBy}>
              {ctx && !ctx.people.length ? (
                <p className="text-caption text-ink-600">{R.givenByNone}</p>
              ) : null}
              <Chips>
                {(ctx?.people ?? []).map((p) => (
                  <Choice
                    key={p.userId}
                    on={givenBy === p.userId}
                    onClick={() => setGivenBy(givenBy === p.userId ? null : p.userId)}
                  >
                    {p.name}
                  </Choice>
                ))}
              </Chips>
            </Field>
            <Field label={R.when}>
              <Chips>
                {hoursIn(win).map((d) => (
                  <Choice
                    key={d.toISOString()}
                    on={at === d.toISOString()}
                    onClick={() => setAt(d.toISOString())}
                  >
                    {hourWords.format(d)}
                  </Choice>
                ))}
              </Chips>
              {atDate && !inWindow(atDate, win) ? (
                <span className="text-caption text-ink-800">{R.outside}</span>
              ) : null}
            </Field>
            <Field label={CTL.dose.dose}>
              <Stepper
                label={CTL.dose.dose}
                value={doseMg}
                step={unit?.step ?? 1}
                onChange={setDoseMg}
              />
              <span className="text-caption text-ink-600">{R.accounts}</span>
            </Field>
            <Field label={CTL.dose.route}>
              <Chips>
                {RULES.routes.map((r) => (
                  <Choice key={r} on={route === r} onClick={() => setRoute(r)}>
                    {r}
                  </Choice>
                ))}
              </Chips>
            </Field>
            {residueMg > 0 ? (
              <Choice on={residue} onClick={() => setResidue(!residue)} className="sm:col-span-2">
                {fill(CTL.dose.residueTick, { mg: mgFmt(residueMg) })}
              </Choice>
            ) : null}
            <p className="text-caption text-ink-600 sm:col-span-2">{R.lateHint}</p>
          </div>
        ) : null}
        {how === "recount" || how === "loss" || how === "excess" ? (
          <Field label={R.what}>
            <Chips>
              {(how === "recount"
                ? CTL.diff.recountWhy
                : how === "loss"
                  ? CTL.diff.lossWhy
                  : CTL.diff.excessWhy
              ).map((w) => (
                <Choice key={w} on={note === w} onClick={() => setNote(w)}>
                  {w}
                </Choice>
              ))}
            </Chips>
          </Field>
        ) : null}
        {how === "loss" || how === "excess" ? (
          <>
            <Field label={R.incident}>
              <input
                value={incident}
                onChange={(e) => setIncident(e.target.value)}
                className="bg-card shadow-tide-card rounded-tide-row h-11 px-3 text-[14px]"
              />
              <span className="text-caption text-ink-600">{R.incidentHint}</span>
            </Field>
            <p className="text-caption text-ink-600">
              {R.inChargeOnly} {R.lossHint}
            </p>
          </>
        ) : null}
      </Dlg>
      <WitnessDialog
        open={witness}
        onOpenChange={setWitness}
        purpose="controlled:resolve"
        locationId={flag.placeId}
        what={fill(R.witnessWhat, {
          med: medName,
          place: placeName,
          how: hows.find(([k]) => k === how)?.[1] ?? "",
        })}
        onDone={(w) => {
          setWitness(false);
          if (w.how !== "phone") return setError(CTL.common.needOnline);
          run(
            () =>
              resolveCdAction({
                checkId: flag.check.id,
                medicineId: flag.medicineId,
                how,
                note,
                incidentRef: how === "loss" || how === "excess" ? incident.trim() : null,
                attestationId: w.attestationId,
                late:
                  how === "late_entry" && patient && prescriber && atDate
                    ? {
                        clientKey: key,
                        patientUserId: patient.userId,
                        patientLabel: patient.label,
                        bed: null,
                        prescriberUserId: prescriber,
                        givenByUserId: givenBy,
                        doseMg,
                        route,
                        residueDisposed: residue,
                        at: atDate.toISOString(),
                      }
                    : null,
              }),
            onClose,
          );
        }}
      />
    </>
  );
}

/** Paper witnesses from a network cut: the in-charge checks each against the paper register. */
export function PaperList({
  flags,
  placeName,
  inCharge,
}: {
  flags: CdFlag[];
  placeName: Record<string, string>;
  inCharge: boolean;
}) {
  const P = CTL.paper;
  const { pending, error, run } = useAct();
  if (!flags.length) return <EmptyState compact title={P.none} />;
  return (
    <>
      {error ? (
        <p role="alert" className="text-body-s text-ink-800 mb-2">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {flags.map((f) => {
          if (f.k !== "paper") return null;
          const t = flagText(f, placeName, {});
          return (
            <li
              key={f.id}
              className="bg-card shadow-tide-card rounded-tide-row flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-semibold">{t.title}</span>
                <span className="text-caption text-ink-600">{t.meta}</span>
              </div>
              <LabButton
                size="sm"
                busy={pending}
                disabledReason={inCharge ? null : P.forInCharge}
                onClick={() =>
                  run(() =>
                    cdEventAction({
                      movementId: f.move.id,
                      kind: "paper_checked",
                      attestationId: null,
                      reason: P.matches,
                    }),
                  )
                }
              >
                {P.matches}
              </LabButton>
            </li>
          );
        })}
      </ul>
    </>
  );
}
