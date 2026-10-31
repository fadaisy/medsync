"use client";

import type { FormComponent, FoundPatient } from "@/lib/lab/downtime-actions";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Input } from "@/components/ui/input";
import { LABWS2_DOWNTIME } from "@/content/lab-workspace-v2-downtime";
import { unitWords } from "@/lib/emr/unit-words";
import {
  enterDowntimeFormAction,
  findPatientAction,
  testComponentsAction,
} from "@/lib/lab/downtime-actions";
import { LabButton } from "@/components/tide/work/button";
import { DateTimeField } from "../../_components/v2/fields";
import { PAPER_TIMES_START } from "../../bench/downtime/_lib/steps";

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";
type CheckKind = "repeated" | "checked_not_repeated" | "could_not_check";

/**
 * Enter a paper form (§5.9, artboard 13; DT-3 to DT-7). The order of the paper: number, patient,
 * request, the form's times, who released it on paper, the results, then any critical and the call
 * written on it. Save and next keeps the page for the next form. Budget: four results in ≤ 90 s.
 */
export function EnterForm({
  unused,
  tests,
  clinicians,
  timeZone,
}: {
  unused: number[];
  tests: { id: string; display: string }[];
  clinicians: { userId: string; name: string }[];
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formNumber, setFormNumber] = useState(unused[0] ? String(unused[0]) : "");
  const [mrn, setMrn] = useState("");
  const [patient, setPatient] = useState<FoundPatient | null>(null);
  const [request, setRequest] = useState("");
  const [newTest, setNewTest] = useState("");
  const [requester, setRequester] = useState("");
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

  const loadComponents = (testId: string) =>
    start(async () => {
      const r = await testComponentsAction({ testId });
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setComponents(r.data!.components);
      setValues({});
      setCritical({});
    });
  const find = () =>
    start(async () => {
      setSaid(null);
      const r = await findPatientAction({ mrn });
      if (!r.ok) {
        setPatient(null);
        return setSaid({ ok: false, text: r.error });
      }
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
    setPatient(null);
    setMrn("");
    setRequest("");
    setNewTest("");
    setComponents([]);
    setValues({});
    setCritical({});
    setRepeatValues({});
    setCallTo("");
    setCallAt("");
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
        text: `Saved as: resulted ${fmt.format(new Date(r.data!.resultedAt))}, entered ${fmt.format(new Date(r.data!.enteredAt))}.`,
      });
      if (next) {
        reset();
        const rest = unused.filter((n) => String(n) !== formNumber);
        setFormNumber(rest[0] ? String(rest[0]) : "");
      }
      router.refresh();
    });

  const anyCritical = Object.values(critical).some(Boolean);
  const saveWhy = !formNumber
    ? LABWS2_DOWNTIME.enter.whyForm
    : !collected || !resulted
      ? LABWS2_DOWNTIME.enter.timesMissing
      : null;
  return (
    <section
      aria-labelledby="enter-form"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="enter-form" className="text-heading-s">
        Enter a form
      </h2>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="text-body-s flex flex-col gap-1">
          <span className="text-muted-foreground">Form number</span>
          <select
            name="formNumber"
            value={formNumber}
            onChange={(e) => setFormNumber(e.target.value)}
            className={selectClass}
          >
            <option value="">Choose</option>
            {unused.map((n) => (
              <option key={n} value={n}>
                DT-{String(n).padStart(5, "0")}
              </option>
            ))}
          </select>
        </label>
        <div className="text-body-s flex flex-col gap-1">
          <label htmlFor="dt-mrn" className="text-muted-foreground">
            Patient MRN, from the form
          </label>
          <div className="flex gap-2">
            <Input
              id="dt-mrn"
              value={mrn}
              onChange={(e) => setMrn(e.target.value)}
              className="min-h-11 w-48 font-mono sm:min-h-9"
            />
            <LabButton
              type="button"
              onClick={find}
              busy={pending}
              disabledReason={mrn.trim().length < 3 ? LABWS2_DOWNTIME.enter.findWhy : null}
            >
              Find
            </LabButton>
          </div>
        </div>
      </div>

      {patient ? (
        <>
          <p className="text-body-s flex flex-wrap gap-x-3">
            <span className="font-medium">{patient.name}</span>
            <span className="text-muted-foreground font-mono tabular-nums">{patient.mrn}</span>
            <span>{patient.ageSex}</span>
          </p>
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">The request this form answers</span>
            <select
              name="request"
              value={request}
              onChange={(e) => chooseRequest(e.target.value)}
              className={selectClass}
            >
              <option value="">Choose</option>
              {patient.openOrders.map((o) => (
                <option key={o.orderId} value={o.orderId}>
                  {o.test} (in MedSync)
                </option>
              ))}
              {patient.openVisit ? (
                <option value="new">A paper request, not in MedSync</option>
              ) : null}
            </select>
          </label>
          {request === "new" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-body-s flex flex-col gap-1">
                <span className="text-muted-foreground">Test</span>
                <select
                  name="newTest"
                  value={newTest}
                  onChange={(e) => {
                    setNewTest(e.target.value);
                    if (e.target.value) loadComponents(e.target.value);
                  }}
                  className={selectClass}
                >
                  <option value="">Choose</option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.display}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-body-s flex flex-col gap-1">
                <span className="text-muted-foreground">Requested by (on the form)</span>
                <select
                  name="requester"
                  value={requester}
                  onChange={(e) => setRequester(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Choose</option>
                  {clinicians.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <DateTimeField
              label="Collected, from the form"
              name="collected"
              value={collected}
              onChange={setCollected}
              quick={false}
            />
            <DateTimeField
              label="Result time, from the form"
              name="resulted"
              value={resulted}
              onChange={setResulted}
              quick={false}
              min={collected || undefined}
            />
            <label className="text-body-s flex flex-col gap-1">
              <span className="text-muted-foreground">Released on paper by</span>
              <Input
                name="releasedBy"
                value={releasedBy}
                onChange={(e) => setReleasedBy(e.target.value)}
                maxLength={120}
                className="min-h-11 sm:min-h-9"
              />
            </label>
          </div>
          {components.length ? (
            <div role="group" aria-label="Results" className="flex flex-col gap-2">
              {components.map((c) => (
                <div
                  key={c.conceptId}
                  className="grid grid-cols-[minmax(8rem,14rem)_10rem_1fr] items-center gap-3 border-b pb-2"
                >
                  <label htmlFor={`dt-${c.conceptId}`} className="text-body-s font-medium">
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
                        className="min-h-11 w-28 text-right tabular-nums sm:min-h-9"
                      />
                      <span className="text-body-s text-muted-foreground">
                        {unitWords(c.unit) ?? c.unit}
                      </span>
                    </span>
                  ) : (
                    <select
                      id={`dt-${c.conceptId}`}
                      value={values[c.conceptId] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [c.conceptId]: e.target.value }))}
                      className={selectClass}
                    >
                      <option value="">—</option>
                      {c.answers.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`${c.display}: marked critical on the form?`}
                      value={critical[c.conceptId] ?? ""}
                      onChange={(e) =>
                        setCritical((x) => ({
                          ...x,
                          [c.conceptId]: e.target.value as CheckKind | "",
                        }))
                      }
                      className={selectClass}
                    >
                      <option value="">Not marked critical</option>
                      <option value="repeated">Critical: repeated</option>
                      <option value="checked_not_repeated">Critical: checked, not repeated</option>
                      <option value="could_not_check">Critical: no check written</option>
                    </select>
                    {critical[c.conceptId] === "repeated" ? (
                      <Input
                        aria-label={`${c.display} repeat value`}
                        value={repeatValues[c.conceptId] ?? ""}
                        onChange={(e) =>
                          setRepeatValues((x) => ({ ...x, [c.conceptId]: e.target.value }))
                        }
                        className="min-h-11 w-24 tabular-nums sm:min-h-9"
                      />
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {anyCritical ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-s font-medium">
                The call written on the form (leave empty if nobody was phoned: a live alert opens)
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  aria-label="Phoned to"
                  value={callTo}
                  onChange={(e) => setCallTo(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Nobody was phoned</option>
                  {clinicians.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <DateTimeField
                  label="Time of the call"
                  value={callAt}
                  onChange={setCallAt}
                  quick={false}
                />
                <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={readBack}
                    onChange={(e) => setReadBack(e.target.checked)}
                    className="size-4 accent-teal-600"
                  />
                  They read it back
                </label>
              </div>
            </fieldset>
          ) : null}
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">
              If the form&apos;s times fall outside a recorded downtime, say why
            </span>
            <Input
              value={outsideReason}
              onChange={(e) => setOutsideReason(e.target.value)}
              maxLength={200}
              className="min-h-11 sm:min-h-9"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <LabButton
              type="button"
              onClick={() => save(false)}
              busy={pending}
              disabledReason={saveWhy}
            >
              Save
            </LabButton>
            {saveWhy ? null : (
              <LabButton type="button" onClick={() => save(true)} busy={pending}>
                Save and next form
              </LabButton>
            )}
          </div>
        </>
      ) : null}
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
      </p>
    </section>
  );
}
