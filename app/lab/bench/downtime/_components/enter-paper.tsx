"use client";

import type { FormComponent, FoundPatient } from "@/lib/lab/downtime-actions";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Ident, Panel, Pill, TwoIds } from "@/components/tide/work/kit";
import { Input } from "@/components/ui/input";
import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_DOWNTIME } from "@/content/lab-workspace-v2-downtime";
import { sheetLabel } from "@/lib/downtime/sheets";
import { unitWords } from "@/lib/emr/unit-words";
import {
  enterDowntimeFormAction,
  findPatientAction,
  testComponentsAction,
} from "@/lib/lab/downtime-actions";
import { localValue } from "@/lib/lab/field-kit";
import { cn } from "@/lib/utils";
import { entryStep, formTimesProblem, PAPER_TIMES_START, saveBlock } from "../_lib/steps";
import { DateTimeField, PickField } from "../../../_components/v2/fields";

const E = LABWS2_DOWNTIME.enter;
type CheckKind = "repeated" | "checked_not_repeated" | "could_not_check";
const label = (n: number) => sheetLabel(n, "lab");
const FIELD = "min-h-9 rounded-tide-field";

export interface EnteredForm {
  key: string;
  number: number;
  detail: string;
}

/**
 * Enter paper forms (prompt 5.10; DT-3 to DT-7, unchanged): the printed forms beside a three-step entry.
 * 1, find the patient and confirm the patient and order; 2, the form's own times (no default, 5.14);
 * 3, the results, any critical and the call written on the form. Saved with `enterDowntimeFormAction`.
 */
export function EnterPaper({
  unused,
  entered,
  tests,
  clinicians,
  timeZone,
  now,
}: {
  unused: number[];
  entered: EnteredForm[];
  tests: { id: string; display: string }[];
  clinicians: { userId: string; name: string }[];
  timeZone: string;
  now: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formNumber, setFormNumber] = useState(unused[0] ? String(unused[0]) : "");
  const [mrn, setMrn] = useState("");
  const [patient, setPatient] = useState<FoundPatient | null>(null);
  const [request, setRequest] = useState("");
  const [newTest, setNewTest] = useState("");
  const [requester, setRequester] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [components, setComponents] = useState<FormComponent[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [collected, setCollected] = useState<string>(PAPER_TIMES_START.collected);
  const [resulted, setResulted] = useState<string>(PAPER_TIMES_START.resulted);
  const [releasedBy, setReleasedBy] = useState("");
  const [outsideReason, setOutsideReason] = useState("");
  const [critical, setCritical] = useState<Record<string, CheckKind | "">>({});
  const [repeatValues, setRepeatValues] = useState<Record<string, string>>({});
  const [callTo, setCallTo] = useState("");
  const [callAt, setCallAt] = useState<string>(PAPER_TIMES_START.callAt);
  const [readBack, setReadBack] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const keyRef = useRef(crypto.randomUUID());
  const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });

  const nowLocal = localValue(new Date());
  const times = formTimesProblem(collected, resulted, nowLocal);
  const step = entryStep({ confirmed, collected, resulted, nowLocal });
  const valuesEntered = components.filter((c) => (values[c.conceptId] ?? "").trim()).length;
  const block = saveBlock({ formNumber, confirmed, times, releasedBy, valuesEntered });
  const whySave = block
    ? {
        form: E.whyForm,
        patient: E.whyPatient,
        times: E.whyTimes,
        releasedBy: E.whyReleasedBy,
        values: E.whyValues,
      }[block]
    : null;

  const loadComponents = (testId: string) =>
    start(async () => {
      const r = await testComponentsAction({ testId });
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setComponents(r.data!.components);
      setValues({});
      setCritical({});
    });
  const resetPatient = () => {
    setPatient(null);
    setConfirmed(false);
    setRequest("");
    setNewTest("");
    setRequester("");
    setComponents([]);
    setValues({});
    setCritical({});
    setRepeatValues({});
  };
  const find = () =>
    start(async () => {
      setSaid(null);
      resetPatient();
      const r = await findPatientAction({ mrn });
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setPatient(r.data!);
      const only = r.data!.openOrders.length === 1 ? r.data!.openOrders[0]! : null;
      setRequest(only ? only.orderId : "");
      if (only) loadComponents(only.testId);
    });
  const chooseRequest = (v: string) => {
    setRequest(v);
    const o = patient?.openOrders.find((x) => x.orderId === v);
    if (o) loadComponents(o.testId);
    else setComponents([]);
  };
  const reset = () => {
    keyRef.current = crypto.randomUUID();
    resetPatient();
    setMrn("");
    setCollected(PAPER_TIMES_START.collected);
    setResulted(PAPER_TIMES_START.resulted);
    setCallTo("");
    setCallAt(PAPER_TIMES_START.callAt);
    setReadBack(false);
    setOutsideReason("");
  };
  const save = (next: boolean) =>
    start(async () => {
      if (!patient) return;
      const marks = Object.entries(critical)
        .filter(([, k]) => k)
        .map(([conceptId, k]) => ({
          conceptId,
          check:
            k === "repeated"
              ? {
                  kind: "repeated" as const,
                  repeatValue: (repeatValues[conceptId] ?? "").replace(",", "."),
                }
              : k === "could_not_check"
                ? {
                    kind: "could_not_check" as const,
                    reason: "other" as const,
                    text: "Recorded on the paper form",
                  }
                : { kind: "checked_not_repeated" as const },
          sampleChecked: true,
        }));
      const r = await enterDowntimeFormAction({
        surface: "lab",
        patientUserId: patient.patientUserId,
        formNumber: Number(formNumber),
        collectedAt: new Date(collected).toISOString(),
        resultedAt: new Date(resulted).toISOString(),
        releasedOnPaperBy: releasedBy,
        outsidePeriodReason: outsideReason.trim() || null,
        orderId: request && request !== "new" ? request : null,
        newOrder:
          request === "new" && patient.openVisit
            ? {
                encounterId: patient.openVisit.encounterId,
                testId: newTest,
                requestedByUserId: requester,
                priority: "urgent",
              }
            : null,
        values: components
          .filter((c) => (values[c.conceptId] ?? "").trim())
          .map((c) =>
            c.valueType === "quantity"
              ? {
                  conceptId: c.conceptId,
                  value: values[c.conceptId]!.trim(),
                  ...(c.unit ? { unit: c.unit } : {}),
                }
              : { conceptId: c.conceptId, code: values[c.conceptId] },
          ),
        marks,
        call:
          callTo && callAt
            ? { toUserId: callTo, at: new Date(callAt).toISOString(), readBack }
            : null,
        clientKey: keyRef.current,
      });
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setSaid({
        ok: true,
        text: fill(E.saved, {
          resulted: fmt.format(new Date(r.data!.resultedAt)),
          entered: fmt.format(new Date(r.data!.enteredAt)),
        }),
      });
      if (next) {
        reset();
        const rest = unused.filter((n) => String(n) !== formNumber);
        setFormNumber(rest[0] ? String(rest[0]) : "");
      }
      router.refresh();
    });

  const useWhy = !request
    ? E.useWhyRequest
    : request === "new" && (!newTest || !requester)
      ? E.useWhyNew
      : null;
  const anyCritical = Object.values(critical).some(Boolean);
  const clinicianOptions = clinicians.map((c) => ({ value: c.userId, label: c.name }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
      <Panel title={E.listTitle} note={E.listNote}>
        {unused.length || entered.length ? (
          <ul className="flex flex-col gap-1">
            {unused.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setFormNumber(String(n))}
                  aria-pressed={formNumber === String(n)}
                  aria-label={`${E.pickForm}: ${label(n)}`}
                  className={cn(
                    "rounded-tide-row focus-visible:shadow-focus flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left outline-none",
                    formNumber === String(n) ? "bg-tide-sunken" : "hover:bg-ink-50",
                  )}
                >
                  <Ident>{label(n)}</Ident>
                  <Pill>{E.toEnter}</Pill>
                </button>
              </li>
            ))}
            {entered.map((e) => (
              <li key={e.key} className="flex min-h-11 flex-col justify-center px-3 py-1.5">
                <span className="flex items-center justify-between gap-2">
                  <Ident>{label(e.number)}</Ident>
                  <Pill tone="passed">{E.entered}</Pill>
                </span>
                <span className="text-caption text-muted-foreground">{e.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title={E.listEmpty} why={E.listEmptyWhy} next={E.listEmptyNext} />
        )}
      </Panel>

      <Panel title={formNumber ? label(Number(formNumber)) : E.chooseForm}>
        <div className="flex flex-col gap-5">
          <Step n={1} title={E.step1} current={step}>
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <PickField
                label={E.formNumber}
                hint={E.formNumberHint}
                placeholder={E.chooseForm}
                options={unused.map((n) => ({ value: String(n), label: label(n) }))}
                value={formNumber}
                onChange={setFormNumber}
                forceList
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="dt-mrn" className="text-label text-foreground">
                  {E.mrn}
                </label>
                <span className="text-caption text-muted-foreground">{E.mrnHint}</span>
                <div className="flex flex-wrap items-start gap-2">
                  <Input
                    id="dt-mrn"
                    value={mrn}
                    onChange={(e) => setMrn(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && mrn.trim().length >= 3) {
                        e.preventDefault();
                        find();
                      }
                    }}
                    className={cn(FIELD, "w-48 font-mono")}
                  />
                  <LabButton
                    type="button"
                    onClick={find}
                    busy={pending}
                    disabledReason={mrn.trim().length < 3 ? E.findWhy : null}
                  >
                    {E.find}
                  </LabButton>
                </div>
              </div>
            </div>
            {patient ? (
              <div className="bg-tide-sunken rounded-tide-tile flex flex-col gap-3 p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <TwoIds name={patient.name} mrn={patient.mrn} />
                  {patient.ageSex ? (
                    <span className="text-body-s text-muted-foreground">{patient.ageSex}</span>
                  ) : null}
                  {confirmed ? <Pill tone="passed">{E.confirmed}</Pill> : null}
                </div>
                {confirmed ? null : (
                  <>
                    <PickField
                      label={E.request}
                      placeholder={E.request}
                      options={[
                        ...patient.openOrders.map((o) => ({
                          value: o.orderId,
                          label: o.test,
                          detail: E.requestInMedSync,
                        })),
                        ...(patient.openVisit
                          ? [{ value: "new", label: E.newRequest, detail: E.newRequestDetail }]
                          : []),
                      ]}
                      value={request}
                      onChange={chooseRequest}
                    />
                    {request === "new" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <PickField
                          label={E.test}
                          placeholder={E.chooseTest}
                          options={tests.map((t) => ({ value: t.id, label: t.display }))}
                          value={newTest}
                          onChange={(v) => {
                            setNewTest(v);
                            if (v) loadComponents(v);
                          }}
                          forceList
                        />
                        <PickField
                          label={E.requestedBy}
                          placeholder={E.chooseClinician}
                          options={clinicianOptions}
                          value={requester}
                          onChange={setRequester}
                          forceList
                        />
                      </div>
                    ) : null}
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {confirmed ? null : (
                    <LabButton
                      type="button"
                      variant="primary"
                      disabledReason={useWhy}
                      onClick={() => setConfirmed(true)}
                    >
                      {E.use}
                    </LabButton>
                  )}
                  <LabButton
                    type="button"
                    variant="quiet"
                    onClick={() => {
                      resetPatient();
                      setMrn("");
                    }}
                  >
                    {E.notThis}
                  </LabButton>
                </div>
              </div>
            ) : null}
          </Step>

          <Step n={2} title={E.step2} current={step}>
            {step >= 2 ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <DateTimeField
                    label={E.collected}
                    value={collected}
                    onChange={setCollected}
                    quick={false}
                    now={now}
                  />
                  <DateTimeField
                    label={E.released}
                    hint={E.releasedHint}
                    value={resulted}
                    onChange={setResulted}
                    quick={false}
                    now={now}
                    min={collected || undefined}
                  />
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label text-foreground">{E.releasedBy}</span>
                    <Input
                      value={releasedBy}
                      onChange={(e) => setReleasedBy(e.target.value)}
                      maxLength={120}
                      className={FIELD}
                    />
                  </label>
                </div>
                <p className="text-caption text-muted-foreground">{E.timesNote}</p>
                {times && (collected || resulted) ? (
                  <StatusWord tone="caution">
                    {times === "order"
                      ? E.timesOrder
                      : times === "future"
                        ? E.timesFuture
                        : E.timesMissing}
                  </StatusWord>
                ) : null}
              </>
            ) : null}
          </Step>

          <Step n={3} title={E.step3} current={step}>
            {step === 3 ? (
              <>
                {components.length ? (
                  <div role="group" aria-label={E.step3} className="flex flex-col">
                    {components.map((c) => (
                      <div
                        key={c.conceptId}
                        className="border-border grid items-start gap-3 border-b py-2 md:grid-cols-[minmax(8rem,12rem)_12rem_1fr]"
                      >
                        <label
                          htmlFor={`dt-${c.conceptId}`}
                          className="text-body-s pt-2 font-medium"
                        >
                          {c.display}
                        </label>
                        {c.valueType === "quantity" ? (
                          <span className="flex items-center gap-2">
                            <Input
                              id={`dt-${c.conceptId}`}
                              value={values[c.conceptId] ?? ""}
                              onChange={(e) =>
                                setValues((v) => ({ ...v, [c.conceptId]: e.target.value }))
                              }
                              inputMode="decimal"
                              className={cn(FIELD, "w-28 text-right tabular-nums")}
                            />
                            <span className="text-body-s text-muted-foreground">
                              {unitWords(c.unit) ?? c.unit}
                            </span>
                          </span>
                        ) : (
                          <PickField
                            label={c.display}
                            hideLabel
                            placeholder="—"
                            options={c.answers.map((a) => ({ value: a.code, label: a.label }))}
                            value={values[c.conceptId] ?? ""}
                            onChange={(v) => setValues((x) => ({ ...x, [c.conceptId]: v }))}
                            forceList
                          />
                        )}
                        <span className="flex flex-wrap items-center gap-2">
                          <PickField
                            label={fill(E.criticalLabel, { test: c.display })}
                            hideLabel
                            options={[
                              { value: "", label: E.critical.none },
                              { value: "repeated", label: E.critical.repeated },
                              { value: "checked_not_repeated", label: E.critical.checked },
                              { value: "could_not_check", label: E.critical.noCheck },
                            ]}
                            value={critical[c.conceptId] ?? ""}
                            onChange={(v) =>
                              setCritical((x) => ({ ...x, [c.conceptId]: v as CheckKind | "" }))
                            }
                          />
                          {critical[c.conceptId] === "repeated" ? (
                            <Input
                              aria-label={`${c.display}: ${E.repeatValue}`}
                              placeholder={E.repeatValue}
                              value={repeatValues[c.conceptId] ?? ""}
                              onChange={(e) =>
                                setRepeatValues((x) => ({ ...x, [c.conceptId]: e.target.value }))
                              }
                              inputMode="decimal"
                              className={cn(FIELD, "w-28 tabular-nums")}
                            />
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-body-s text-muted-foreground">{E.noComponents}</p>
                )}
                {anyCritical ? (
                  <fieldset className="flex flex-col gap-3">
                    <legend className="text-label text-foreground">{E.callLegend}</legend>
                    <p className="text-caption text-muted-foreground">{E.callHint}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <PickField
                        label={E.phonedTo}
                        placeholder={E.nobody}
                        options={[{ value: "", label: E.nobody }, ...clinicianOptions]}
                        value={callTo}
                        onChange={setCallTo}
                        forceList
                      />
                      <DateTimeField
                        label={E.callAt}
                        value={callAt}
                        onChange={setCallAt}
                        quick={false}
                        now={now}
                        min={collected || undefined}
                      />
                    </div>
                    <label className="text-body-s flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={readBack}
                        onChange={(e) => setReadBack(e.target.checked)}
                        className="size-4 accent-teal-600"
                      />
                      {E.readBack}
                    </label>
                  </fieldset>
                ) : null}
                <label className="flex flex-col gap-1.5">
                  <span className="text-label text-foreground">{E.outside}</span>
                  <Input
                    value={outsideReason}
                    onChange={(e) => setOutsideReason(e.target.value)}
                    maxLength={200}
                    className={FIELD}
                  />
                </label>
              </>
            ) : null}
          </Step>

          <div className="flex flex-wrap items-start gap-3">
            <LabButton
              type="button"
              variant="primary"
              busy={pending}
              disabledReason={whySave}
              onClick={() => save(false)}
            >
              {E.save}
            </LabButton>
            {whySave ? null : (
              <LabButton type="button" busy={pending} onClick={() => save(true)}>
                {E.saveNext}
              </LabButton>
            )}
          </div>
          <p role="status" aria-live="polite" className="text-body-s min-h-5">
            {said ? (
              said.ok ? (
                said.text
              ) : (
                <StatusWord tone="caution">{said.text}</StatusWord>
              )
            ) : null}
          </p>
        </div>
      </Panel>
    </div>
  );
}

function Step({
  n,
  title,
  current,
  children,
}: {
  n: 1 | 2 | 3;
  title: string;
  current: number;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`dt-step-${n}`} className="flex flex-col gap-3">
      <h3
        id={`dt-step-${n}`}
        className={cn("text-heading-s", current < n ? "text-muted-foreground" : "text-foreground")}
      >
        <span className="text-caption text-muted-foreground mr-2 font-medium">
          {fill(LABWS2_DOWNTIME.enter.stepOf, { n })}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
