"use client";

import type { CaseRow } from "@/lib/pharmacy/cases/derive";
import type { CaseDetail } from "@/lib/pharmacy/cases/read";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LabButton } from "@/components/tide/work/button";
import { CONTROLS_RULES as RULES, CTL } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { caseStatus, findingsReady } from "@/lib/pharmacy/cases/derive";
import {
  assignCaseAction,
  caseMedicinesAction,
  caseStepAction,
  escalateAction,
  findingsAction,
  openCaseAction,
  sendBackAction,
  signOffAction,
  takeCaseAction,
} from "../../actions";
import { Chips, Choice, Dlg, Field, newKey, useAct } from "../../_components/kit";

const D = CTL.caseDialog;
const K = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hourCycle: "h23", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const FIX: Record<string, string> = { cd_check: "/pharmacy/controls/cd?tab=flags", handover: "/pharmacy/controls/handover", count: "/pharmacy/stock/store?tab=count" };

type Mode = "view" | "assign" | "step" | "findings" | "back";

/** One case: what was found, whether the number is fixed, the owner and deadline, the findings and the sign-off. */
export function CaseDialog({
  c,
  detail,
  me,
  inCharge,
  closeHref,
  due,
}: {
  c: CaseRow;
  detail: CaseDetail;
  me: string;
  inCharge: boolean;
  closeHref: string;
  due: string;
}) {
  const router = useRouter();
  const close = () => router.push(closeHref, { scroll: false });
  const [mode, setMode] = useState<Mode>("view");
  const [owner, setOwner] = useState<string | null>(c.ownerUserId);
  const [hours, setHours] = useState<number>(RULES.caseHours[c.severity]);
  const [step, setStep] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [cause, setCause] = useState<string | null>(c.findings?.cause ?? null);
  const [actions, setActions] = useState<string[]>(c.findings?.actions ?? []);
  const [prevent, setPrevent] = useState<string[]>(c.findings?.prevent ?? []);
  const [back, setBack] = useState<string | null>(null);
  const { pending, error, run } = useAct();
  const s = caseStatus(c);
  const mine = c.ownerUserId === me;
  const toggle = (list: string[], set: (l: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const view = () => setMode("view");
  const steps: [keyof typeof D.steps, boolean][] = [
    ["found", true],
    ["assigned", !!c.ownerUserId],
    ["fixed", c.sourceType === "manual" || !!c.fixedAt],
    ["findings", !!c.findings],
    ["submitted", !!c.submittedAt],
    ["closed", !!c.signedOffAt],
  ];
  const need = !(c.sourceType === "manual" || c.fixedAt)
    ? D.need.fix
    : !cause
      ? D.need.cause
      : !actions.length
        ? D.need.action
        : !prevent.length
          ? D.need.prevent
          : null;

  return (
    <Dlg
      open
      onOpenChange={(o) => !o && close()}
      width="wide"
      title={fill(CTL.caseFlag.title, { med: c.medicineName, place: c.placeName })}
      sub={fill(D.sub, { src: CTL.cases.src[c.fromHandover ? "cd_handover" : c.sourceType], when: K.format(c.createdAt), by: c.foundBy })}
      error={error}
    >
      <ol className="flex flex-wrap gap-1.5" aria-label={D.timeline}>
        {steps.map(([k, done]) => (
          <li key={k} className={done ? "bg-tide-lagoon-tint rounded-full px-3 py-1 text-[12.5px] font-semibold" : "bg-tide-sunken text-ink-600 rounded-full px-3 py-1 text-[12.5px]"}>
            {done ? "✓ " : ""}
            {D.steps[k]}
          </li>
        ))}
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 text-[13.5px]">
          <span>{c.what ?? fill(c.qty < 0 ? CTL.cases.short : CTL.cases.over, { n: Math.abs(c.qty) })}</span>
          {c.sourceType !== "manual" ? (
            c.fixedAt ? (
              <span>
                {D.steps.fixed}: {D.fixHow[c.fixedHow as keyof typeof D.fixHow] ?? ""} · {K.format(c.fixedAt)}
              </span>
            ) : (
              <span className="flex flex-col gap-1">
                <span className="text-ink-700">{D.notFixed}</span>
                <Link href={FIX[c.sourceType] ?? "/pharmacy/controls/cd"} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
                  {D.fixIn[c.sourceType as keyof typeof D.fixIn]}
                </Link>
              </span>
            )
          ) : null}
          <span>
            {D.owner}: {c.owner ?? CTL.cases.notAssigned} · {D.deadline}: {due}
          </span>
          {c.findings ? (
            <span className="text-ink-700">
              {D.cause}: {c.findings.cause} · {D.actions}: {c.findings.actions.join(", ")} · {D.prevent}: {c.findings.prevent.join(", ")}
            </span>
          ) : null}
          {s === "closed" ? <span className="text-ink-600">{c.selfSigned ? CTL.cases.selfSigned : D.closedNote}</span> : null}
          {s === "signoff" && !inCharge ? <span className="text-ink-600">{D.waiting}</span> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-medium">{D.timeline}</span>
          <ol className="flex flex-col gap-1">
            {detail.events.map((e, i) => (
              <li key={i} className="text-caption text-ink-700">
                {K.format(e.at)} · {e.by} ·{" "}
                {fill(D.tl[e.kind], { what: e.what ?? "", name: e.kind === "taken" ? e.by : (e.what ?? ""), how: e.what ?? "" })}
                {e.note ? ` · ${e.note}` : ""}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {s !== "closed" && mode === "view" ? (
        <div className="flex flex-wrap gap-2">
          {!c.ownerUserId ? (
            <LabButton busy={pending} onClick={() => run(() => takeCaseAction({ caseId: c.id }))}>
              {D.take}
            </LabButton>
          ) : null}
          {inCharge ? <LabButton onClick={() => setMode("assign")}>{c.ownerUserId ? D.reassign : D.assign}</LabButton> : null}
          {c.ownerUserId && (mine || inCharge) && s === "open" ? (
            <>
              <LabButton onClick={() => setMode("step")}>{D.addStep}</LabButton>
              <LabButton variant="primary" onClick={() => setMode("findings")}>
                {D.writeFindings}
              </LabButton>
            </>
          ) : null}
          {s === "signoff" && inCharge ? (
            <>
              <LabButton variant="primary" busy={pending} onClick={() => run(() => signOffAction({ caseId: c.id }))}>
                {D.signOff}
              </LabButton>
              <LabButton onClick={() => setMode("back")}>{D.sendBack}</LabButton>
            </>
          ) : null}
        </div>
      ) : null}
      {s !== "closed" && mode === "view" && inCharge ? (
        <Field label={D.escalate}>
          <Chips>
            {D.escalateTo.map((t) => (
              <Choice key={t} on={false} onClick={() => run(() => escalateAction({ caseId: c.id, to: t }))}>
                {t}
              </Choice>
            ))}
          </Chips>
        </Field>
      ) : null}

      {mode === "assign" ? (
        <div className="flex flex-col gap-3">
          {(
            [
              [D.pharmacy, false],
              [D.wards, true],
            ] as const
          ).map(([label, ward]) =>
            detail.people.some((p) => p.ward === ward) ? (
              <Field key={label} label={label}>
                <Chips>
                  {detail.people
                    .filter((p) => p.ward === ward)
                    .map((p) => (
                      <Choice key={p.userId} on={owner === p.userId} onClick={() => setOwner(p.userId)}>
                        {p.name}
                      </Choice>
                    ))}
                </Chips>
              </Field>
            ) : null,
          )}
          <Field label={D.deadline}>
            <Chips>
              {RULES.assignHours.map((h) => (
                <Choice key={h} on={hours === h} onClick={() => setHours(h)}>
                  {h === 168 ? D.week : fill(D.hours, { n: h })}
                  {h === RULES.caseHours[c.severity] ? D.usual : ""}
                </Choice>
              ))}
            </Chips>
          </Field>
          <Footer onCancel={view}>
            <LabButton
              variant="primary"
              busy={pending}
              disabledReason={owner ? null : D.owner}
              onClick={() => run(() => assignCaseAction({ caseId: c.id, ownerUserId: owner, hours }), view)}
            >
              {D.assign}
            </LabButton>
          </Footer>
        </div>
      ) : null}

      {mode === "step" ? (
        <div className="flex flex-col gap-3">
          <Field label={D.doStep}>
            <Chips>
              {D.stepsList.map((t) => (
                <Choice key={t} on={step === t} onClick={() => setStep(t)}>
                  {t}
                </Choice>
              ))}
            </Chips>
          </Field>
          <Field label={D.stepNote}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="bg-card shadow-tide-card rounded-tide-row px-3 py-2 text-[14px]" />
          </Field>
          <Footer onCancel={view}>
            <LabButton
              variant="primary"
              busy={pending}
              disabledReason={step ? null : D.doStep}
              onClick={() => run(() => caseStepAction({ caseId: c.id, what: step, note: note.trim() || null }), () => (setStep(null), setNote(""), view()))}
            >
              {D.addToTimeline}
            </LabButton>
          </Footer>
        </div>
      ) : null}

      {mode === "findings" ? (
        <div className="flex flex-col gap-3">
          <Field label={D.cause}>
            <Chips>
              {D.causes.map((t) => (
                <Choice key={t} on={cause === t} onClick={() => setCause(t)}>
                  {t}
                </Choice>
              ))}
            </Chips>
          </Field>
          {cause === "Suspected diversion" ? <p className="bg-status-caution-bg rounded-tide-row px-3 py-2 text-[13.5px]">{D.diversion}</p> : null}
          <Field label={D.actions}>
            <Chips>
              {D.actionsList.map((t) => (
                <Choice key={t} on={actions.includes(t)} onClick={() => toggle(actions, setActions, t)}>
                  {t}
                </Choice>
              ))}
            </Chips>
          </Field>
          <Field label={D.prevent}>
            <Chips>
              {D.preventList.map((t) => (
                <Choice key={t} on={prevent.includes(t)} onClick={() => toggle(prevent, setPrevent, t)}>
                  {t}
                </Choice>
              ))}
            </Chips>
          </Field>
          <Footer onCancel={view}>
            <LabButton
              variant="primary"
              busy={pending}
              disabledReason={findingsReady(c, { cause: cause ?? undefined, actions, prevent }) ? null : need}
              onClick={() => run(() => findingsAction({ caseId: c.id, cause, actions, prevent }), view)}
            >
              {D.submit}
            </LabButton>
          </Footer>
        </div>
      ) : null}

      {mode === "back" ? (
        <div className="flex flex-col gap-3">
          <Field label={D.backWhy}>
            <Chips>
              {D.backList.map((t) => (
                <Choice key={t} on={back === t} onClick={() => setBack(t)}>
                  {t}
                </Choice>
              ))}
            </Chips>
          </Field>
          <Footer onCancel={view}>
            <LabButton
              variant="primary"
              busy={pending}
              disabledReason={back ? null : D.backWhy}
              onClick={() => run(() => sendBackAction({ caseId: c.id, why: back }), view)}
            >
              {fill(D.backTo, { name: c.owner ?? "" })}
            </LabButton>
          </Footer>
        </div>
      ) : null}
    </Dlg>
  );
}

function Footer({ onCancel, children }: { onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <LabButton variant="quiet" onClick={onCancel}>
        {D.cancel}
      </LabButton>
      {children}
    </div>
  );
}

type Med = Awaited<ReturnType<typeof caseMedicinesAction>>[number];

/** "Report a discrepancy", tap-only: where, which medicine, what happened. */
export function ReportButton() {
  const N = CTL.newCase;
  const [open, setOpen] = useState(false);
  const [meds, setMeds] = useState<Med[] | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [med, setMed] = useState<string | null>(null);
  const [what, setWhat] = useState<string | null>(null);
  const [key] = useState(newKey);
  const router = useRouter();
  const { pending, error, setError, run } = useAct();
  const start = () => {
    setOpen(true);
    if (!meds) void caseMedicinesAction().then(setMeds, () => setError(CTL.common.failed));
  };
  const places = [...new Map((meds ?? []).map((m) => [m.placeId, m.place])).entries()];
  const here = (meds ?? []).filter((m) => m.placeId === place && (m.controlled || RULES.highRisk.some((h) => m.name.toLowerCase().includes(h))));
  return (
    <>
      <LabButton variant="primary" onClick={start}>
        {CTL.cases.report}
      </LabButton>
      {open ? (
        <Dlg
          open
          onOpenChange={setOpen}
          title={N.title}
          sub={N.sub}
          error={error}
          primary={
            <LabButton
              variant="primary"
              busy={pending}
              disabledReason={!place ? N.where : !med ? N.medicine : !what ? N.what : null}
              onClick={() =>
                run(
                  () => openCaseAction({ clientKey: key, locationId: place, medicineId: med, what }),
                  () => {
                    setOpen(false);
                    router.push(`/pharmacy/controls/cases?f=open&case=${key}`, { scroll: false });
                  },
                )
              }
            >
              {N.open}
            </LabButton>
          }
        >
          <Field label={N.where}>
            <Chips>
              {places.map(([id, name]) => (
                <Choice key={id} on={place === id} onClick={() => (setPlace(id), setMed(null))}>
                  {name}
                </Choice>
              ))}
            </Chips>
          </Field>
          {place ? (
            <Field label={N.medicine}>
              {!here.length ? <p className="text-caption text-ink-600">{N.noMeds}</p> : null}
              <Chips>
                {here.map((m) => (
                  <Choice key={m.medicineId} on={med === m.medicineId} onClick={() => setMed(m.medicineId)}>
                    {m.controlled ? fill(N.controlled, { name: m.name }) : m.name}
                  </Choice>
                ))}
              </Chips>
            </Field>
          ) : null}
          <Field label={N.what}>
            <div className="flex flex-col gap-1.5">
              {N.whatList.map((t) => (
                <Choice key={t} on={what === t} onClick={() => setWhat(t)}>
                  {t}
                </Choice>
              ))}
            </div>
          </Field>
        </Dlg>
      ) : null}
    </>
  );
}
