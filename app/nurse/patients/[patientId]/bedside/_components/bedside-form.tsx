"use client";

import type { BedsideTest } from "../_lib/load";
import type { MeterRange } from "@/lib/lab/bedside";
import type { CouldNotCheckReason, MarkInput } from "@/lib/lab/criticals/marks";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BedsideTag } from "@/components/emr/chips";
import { ChoiceChips } from "@/components/emr/orders/choice-chips";
import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CRITICALS_COPY } from "@/content/lab-criticals";
import { LAB2 } from "@/content/lab-phase-2";
import { LAB3 } from "@/content/lab-phase-3";
import { LATE_ENTRY_MS, METER_RANGE, promptCritical } from "@/lib/lab/bedside";
import { recordBedsideResultAction } from "@/lib/lab/bedside-actions";
import { BEDSIDE as C } from "../_lib/copy";

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-sm border px-2 outline-none sm:min-h-9";
const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dayWords = (d: string) => day.format(new Date(`${d}T00:00:00Z`));
/** The hospital-local day of a moment (as the server reads it, Lab Phase 3 S6). */
const hospitalDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" });
/** A datetime-local value for a moment, in the browser's own time. */
const localAt = (ms: number) => {
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const newKey = () => `bedside:${crypto.randomUUID()}`;
type Line = { value: string; code: string };
type Value = { conceptId: string; value?: string; code?: string };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-s text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * The bedside form (Lab Phase 2 §5.7, artboard 7; PC-1..PC-10). The server checks everything again; this
 * screen only keeps a result that cannot be saved from looking ready: an expired lot disables Save (PC-3),
 * a future time is refused and a time more than a day ago needs a reason (PC-4). HI and LO are answers,
 * never numbers (PC-6), and HI only prompts a critical mark (PC-9: the mark is the nurse's choice).
 */
export function BedsideForm({
  surface,
  critical,
  patientUserId,
  encounterId,
  wardId,
  identity,
  operator,
  today,
  nowMs,
  tests,
}: {
  surface: "nurse" | "doctor";
  /** PC-9: null where critical alerts are off here. */
  critical: { secondCheck: boolean } | null;
  patientUserId: string;
  encounterId: string;
  wardId: string | null;
  identity: { name: string; mrn: string };
  operator: string;
  /** The server's date (UTC, as PC-3 compares), for the lot check when measured now. */
  today: string;
  /** The server's clock at render, until a time is chosen. */
  nowMs: number;
  tests: readonly BedsideTest[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [testCode, setTestCode] = useState(tests.length === 1 ? tests[0]!.code : "");
  const test = tests.find((t) => t.code === testCode) ?? null;
  const [fasting, setFasting] = useState<"yes" | "no" | null>(null);
  const [deviceId, setDeviceId] = useState(test?.devices.length === 1 ? test.devices[0]!.id : "");
  const device = test?.devices.find((d) => d.id === deviceId) ?? null;
  const [lotId, setLotId] = useState("");
  const lot = device?.lots.find((l) => l.id === lotId) ?? null;
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [earlier, setEarlierRaw] = useState<string | null>(null);
  // The moment the time was last chosen: PC-4 is checked against it, and again on the server.
  const [now, setNow] = useState(nowMs);
  const setEarlier = (v: string | null, at: number) => {
    setNow(at);
    setEarlierRaw(v);
  };
  const [lateReason, setLateReason] = useState("");
  const [clientKey, setClientKey] = useState(newKey);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [marked, setMarked] = useState(false);
  const [check, setCheck] = useState<MarkInput["check"]["kind"] | null>(null);
  const [repeat, setRepeat] = useState("");
  const [reason, setReason] = useState<CouldNotCheckReason | "">("");
  const [reasonText, setReasonText] = useState("");
  const [idChecked, setIdChecked] = useState(false);
  const [note, setNote] = useState("");
  const [solo, setSolo] = useState("");

  const chooseTest = (code: string) => {
    const t = tests.find((x) => x.code === code);
    setTestCode(code);
    setFasting(null);
    setDeviceId(t?.devices.length === 1 ? t.devices[0]!.id : "");
    setLotId("");
    setLines({});
    setMessage(null);
  };
  const patch = (conceptId: string, l: Partial<Line>) =>
    setLines((ls) => ({ ...ls, [conceptId]: { value: "", code: "", ...ls[conceptId], ...l } }));

  // PC-3 and PC-4, as the server reads them.
  const measuredMs = earlier ? new Date(earlier).getTime() : null;
  const measuredDay = measuredMs !== null ? hospitalDay.format(new Date(measuredMs)) : today;
  const future = measuredMs !== null && measuredMs > now;
  const late = measuredMs !== null && !future && now - measuredMs > LATE_ENTRY_MS;
  const expired = !!lot?.useBy && measuredDay > lot.useBy;

  const values = (test?.components ?? []).flatMap((c): Value[] => {
    const l = lines[c.conceptId];
    if (l?.code) return [{ conceptId: c.conceptId, code: l.code }];
    if (c.valueType === "quantity" && l?.value.trim())
      return [{ conceptId: c.conceptId, value: l.value.trim().replace(",", ".") }];
    return [];
  });
  const hi = values.some((v) => promptCritical((v.code ?? null) as MeterRange | null));
  const issues = [
    !test && C.issues.test,
    test?.glucose && !fasting && C.issues.fasting,
    !device && C.issues.device,
    !lot && C.issues.lot,
    values.length === 0 && C.issues.value,
    late && lateReason.trim().length < 3 && C.issues.reason,
    marked && !check && C.issues.check,
    marked && check === "repeated" && !/^-?\d+([.,]\d+)?$/.test(repeat.trim()) && C.issues.repeat,
    marked &&
      check === "could_not_check" &&
      (!reason || (reason === "other" && reasonText.trim().length < 3)) &&
      C.issues.why,
    marked && critical?.secondCheck && solo.trim().length < 3 && C.issues.alone,
  ].filter((x) => typeof x === "string");
  const markCheck = (): MarkInput["check"] =>
    check === "repeated"
      ? { kind: "repeated", repeatValue: repeat.trim().replace(",", ".") }
      : check === "could_not_check"
        ? { kind: "could_not_check", reason: reason || "other", text: reasonText.trim() || null }
        : { kind: "checked_not_repeated" };
  const blocked = issues.length > 0 || expired || future || (earlier !== null && !measuredMs);

  const save = () =>
    start(async () => {
      if (!test || !device || !lot) return;
      const r = await recordBedsideResultAction({
        surface,
        patientUserId,
        encounterId,
        testCode: test.code,
        deviceId: device.id,
        lotId: lot.id,
        wardId,
        measuredAt: new Date(measuredMs ?? Date.now()).toISOString(),
        ...(late ? { lateReason: lateReason.trim() } : {}),
        ...(test.glucose ? { fasting: fasting === "yes" } : {}),
        values,
        ...(marked
          ? {
              marks: values.map((v) => ({
                conceptId: v.conceptId,
                check: markCheck(),
                sampleChecked: idChecked,
                ...(critical?.secondCheck ? { soloReason: solo.trim() } : {}),
              })),
              note: note.trim() || null,
            }
          : {}),
        clientKey,
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: marked ? C.alerted : C.saved });
      setLines({});
      setMarked(false);
      setCheck(null);
      setRepeat("");
      setReason("");
      setReasonText("");
      setIdChecked(false);
      setNote("");
      setSolo("");
      setEarlier(null, Date.now());
      setLateReason("");
      setClientKey(newKey());
      router.refresh();
    });

  const shown = values
    .map((v) => {
      const c = test!.components.find((x) => x.conceptId === v.conceptId)!;
      if (v.code)
        return `${c.display}: ${
          v.code === "above_range"
            ? C.above
            : v.code === "below_range"
              ? C.below
              : (c.answers.find((a) => a.code === v.code)?.label ?? v.code)
        }`;
      return `${c.display}: ${v.value}${c.defaultUnit ? ` ${c.defaultUnit}` : ""}`;
    })
    .join(" · ");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-5">
        <p className="text-body-s flex flex-wrap gap-x-3">
          <span className="font-medium">{identity.name}</span>
          <span className="text-muted-foreground font-mono tabular-nums">{identity.mrn}</span>
        </p>

        <Field label={C.test}>
          <ChoiceChips
            name="bedside-test"
            label={C.test}
            options={tests.map((t) => ({ value: t.code, label: t.display }))}
            value={testCode || null}
            onChange={chooseTest}
          />
        </Field>

        {test?.glucose ? (
          <Field label={C.ate}>
            <ChoiceChips
              name="bedside-fasting"
              label={C.ate}
              options={[
                { value: "yes", label: C.fasting },
                { value: "no", label: C.notFasting },
              ]}
              value={fasting}
              onChange={setFasting}
            />
          </Field>
        ) : null}

        {test ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-body-s text-muted-foreground">{C.device}</span>
              <select
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  setLotId("");
                }}
                className={selectClass}
              >
                <option value="">{C.choose}</option>
                {test.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-body-s text-muted-foreground">{C.lot}</span>
              <select
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                disabled={!device}
                className={selectClass}
              >
                <option value="">{C.choose}</option>
                {device?.lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.useBy ? `${l.lot} · ${C.lotUseBy(dayWords(l.useBy))}` : l.lot}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {expired && lot?.useBy ? (
          <CautionNotice lead={LAB2.bedside.expiredLot(lot.lot, dayWords(lot.useBy))} />
        ) : null}
        {device?.notice ? <CautionNotice lead={device.notice} /> : null}
        {lot?.needsCheck ? <CautionNotice lead={LAB3.stripLotNeedsCheck} /> : null}

        {test ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-body-s text-muted-foreground mb-1.5">{C.result}</legend>
            {test.components.map((c) => {
              const l = lines[c.conceptId];
              return (
                <div key={c.conceptId} className="flex flex-col gap-2">
                  {test.components.length > 1 ? (
                    <span className="text-body-s font-medium">{c.display}</span>
                  ) : null}
                  {c.valueType === "quantity" ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-2">
                        <Input
                          aria-label={`${c.display}${c.defaultUnit ? `, ${c.defaultUnit}` : ""}`}
                          inputMode="decimal"
                          value={l?.value ?? ""}
                          onChange={(e) => patch(c.conceptId, { value: e.target.value, code: "" })}
                          className="min-h-11 w-28 font-mono tabular-nums sm:min-h-9"
                        />
                        {c.defaultUnit ? (
                          <span className="text-body-s text-muted-foreground">{c.defaultUnit}</span>
                        ) : null}
                      </span>
                      <ChoiceChips
                        name={`range-${c.conceptId}`}
                        label={`${c.display}, outside the meter's range`}
                        options={METER_RANGE.map((code) => ({
                          value: code,
                          label: code === "above_range" ? C.above : C.below,
                        }))}
                        value={(l?.code as MeterRange) || null}
                        onChange={(code) => patch(c.conceptId, { code, value: "" })}
                      />
                    </div>
                  ) : (
                    <ChoiceChips
                      name={`answer-${c.conceptId}`}
                      label={c.display}
                      options={c.answers.map((a) => ({ value: a.code, label: a.label }))}
                      value={l?.code || null}
                      onChange={(code) => patch(c.conceptId, { code })}
                    />
                  )}
                </div>
              );
            })}
          </fieldset>
        ) : null}
        {hi ? <CautionNotice lead={LAB2.bedside.hiPrompt} /> : null}
        {critical && values.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{C.mark}</legend>
            <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
              <input
                type="checkbox"
                checked={marked}
                onChange={(e) => setMarked(e.target.checked)}
                className="size-4 accent-teal-600"
              />
              {C.mark}
            </label>
            {marked ? (
              <div className="ml-6 flex flex-col gap-3">
                <ChoiceChips
                  name="bedside-check"
                  label={C.mark}
                  options={[
                    { value: "repeated", label: C.repeated },
                    { value: "checked_not_repeated", label: C.checked },
                    { value: "could_not_check", label: C.couldNotCheck },
                  ]}
                  value={check}
                  onChange={setCheck}
                />
                {check === "repeated" ? (
                  <Input
                    aria-label={C.repeatValue}
                    placeholder={C.repeatValue}
                    inputMode="decimal"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    className="min-h-11 w-28 font-mono tabular-nums sm:min-h-9"
                  />
                ) : null}
                {check === "could_not_check" ? (
                  <div className="flex flex-col gap-2">
                    <select
                      aria-label={C.why}
                      value={reason}
                      onChange={(e) => setReason(e.target.value as CouldNotCheckReason | "")}
                      className={selectClass}
                    >
                      <option value="">{C.why}</option>
                      {(
                        Object.entries(CRITICALS_COPY.couldNotCheck) as [
                          CouldNotCheckReason,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {reason === "other" ? (
                      <Input
                        aria-label={C.sayWhy}
                        placeholder={C.sayWhy}
                        maxLength={200}
                        value={reasonText}
                        onChange={(e) => setReasonText(e.target.value)}
                        className="min-h-11 sm:min-h-9"
                      />
                    ) : null}
                  </div>
                ) : null}
                <label className="text-body-s flex min-h-11 items-start gap-2 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={idChecked}
                    onChange={(e) => setIdChecked(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-teal-600"
                  />
                  {C.identityChecked}
                </label>
                {critical.secondCheck ? (
                  <Input
                    aria-label={C.workingAlone}
                    placeholder={C.workingAlone}
                    maxLength={200}
                    value={solo}
                    onChange={(e) => setSolo(e.target.value)}
                    className="min-h-11 sm:min-h-9"
                  />
                ) : null}
                <label className="text-body-s flex flex-col gap-1">
                  <span className="text-muted-foreground">{C.note}</span>
                  <textarea
                    value={note}
                    maxLength={280}
                    rows={2}
                    onChange={(e) => setNote(e.target.value)}
                    className="border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border px-2.5 py-2 outline-none"
                  />
                </label>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        <Field label={C.measured}>
          <ChoiceChips
            name="bedside-measured"
            label={C.measured}
            options={[
              { value: "now", label: C.now },
              { value: "earlier", label: C.earlier },
            ]}
            value={earlier === null ? "now" : "earlier"}
            onChange={(v) => {
              const at = Date.now();
              setEarlier(v === "now" ? null : localAt(at), at);
            }}
          />
          {earlier !== null ? (
            <Input
              type="datetime-local"
              aria-label={C.measured}
              value={earlier}
              max={localAt(now)}
              onChange={(e) => setEarlier(e.target.value, Date.now())}
              className="min-h-11 w-fit font-mono tabular-nums sm:min-h-9"
            />
          ) : null}
          {future ? <StatusWord tone="caution">{C.future}</StatusWord> : null}
          {late ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-body-s text-muted-foreground">{C.lateReason}</span>
              <Input
                value={lateReason}
                maxLength={200}
                onChange={(e) => setLateReason(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </label>
          ) : null}
        </Field>

        {test?.glucose ? (
          <p className="text-body-s text-muted-foreground max-w-[72ch]">
            {LAB2.bedside.notForDiagnosisGlucose}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={pending || blocked}>
            {pending ? C.saving : C.save}
          </Button>
          <span role="status" aria-live="polite" className="text-body-s">
            {message ? (
              message.ok ? (
                message.text
              ) : (
                <StatusWord tone="caution">{message.text}</StatusWord>
              )
            ) : !pending && issues.length && test ? (
              <span className="text-muted-foreground">{issues[0]}</span>
            ) : null}
          </span>
        </div>
      </div>

      <aside
        aria-labelledby="bedside-preview"
        className="border-border bg-card flex h-fit flex-col gap-3 rounded-lg border p-4"
      >
        <h2 id="bedside-preview" className="text-heading-s">
          {C.preview}
        </h2>
        <p className="text-body-s flex flex-wrap items-center gap-2">
          <span className="font-medium">{test?.display ?? "—"}</span>
          <BedsideTag />
        </p>
        <p className="text-body-s font-mono tabular-nums">{shown || "—"}</p>
        <dl className="text-body-s grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">{C.device}</dt>
          <dd>{device?.label ?? "—"}</dd>
          <dt className="text-muted-foreground">{C.lot}</dt>
          <dd>{lot?.lot ?? "—"}</dd>
          <dt className="text-muted-foreground">{C.operator}</dt>
          <dd>{operator}</dd>
          <dt className="text-muted-foreground">{C.time}</dt>
          <dd className="font-mono tabular-nums">{earlier ? earlier.replace("T", " ") : C.now}</dd>
        </dl>
        {test?.glucose ? (
          <p className="text-body-s text-muted-foreground">{LAB2.bedside.doctorLine}</p>
        ) : null}
      </aside>
    </div>
  );
}
