"use client";

import type { Payload } from "@/lib/lab/signed-config";
import { useState } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  saveConfigDraftAction,
  setReportEgfrAction,
  signConfigAsLeadAction,
} from "@/lib/lab/catalogue-v2-actions";
import { setLabSettingsAction } from "@/lib/lab/one-menu-actions";
import { PAYLOADS } from "@/lib/lab/signed-config";
import { SETTINGS as C } from "../_lib/copy";
import { Field, Said, useAct } from "../../criticals/_components/setup-forms";

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";
const wholeNumber = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);

/** The lead's signature on an open draft, with a fresh second factor (D-LAB1-11 carried over). */
export function SignAsLead({
  configId,
  authoredByMe,
}: {
  configId: string;
  authoredByMe: boolean;
}) {
  const { pending, message, act, setMessage } = useAct();
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const sign = () =>
    act(async () => {
      const r = await signConfigAsLeadAction({ configId, exceptionNote: note.trim() || null });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: C.reauth };
      }
      return r;
    }, C.signed);
  return (
    <div className="flex flex-col gap-2">
      {authoredByMe ? (
        <Field label={C.exception}>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="min-h-11 sm:min-h-9"
          />
        </Field>
      ) : null}
      {fresh ? (
        <FreshFactor
          onCancel={() => setFresh(false)}
          onConfirmed={() => {
            setFresh(false);
            setMessage(null);
            sign();
          }}
        />
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={sign} disabled={pending}>
            {C.sign}
          </Button>
        </div>
      )}
      <Said message={message} />
    </div>
  );
}

export function ElevationForm({ initial }: { initial: Payload<"elevation"> | null }) {
  const { pending, message, act } = useAct();
  const [metres, setMetres] = useState(initial ? String(initial.metres) : "");
  const [source, setSource] = useState(initial?.source ?? "");
  const save = () =>
    act(async () => {
      const payload = { metres: wholeNumber(metres), source: source.trim() };
      if (!PAYLOADS.elevation.safeParse(payload).success)
        return { ok: false, error: C.elevation.incomplete };
      return saveConfigDraftAction({ kind: "elevation", key: "hospital", payload });
    }, C.draftSaved);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={C.elevation.metres}>
          <Input
            value={metres}
            onChange={(e) => setMetres(e.target.value)}
            inputMode="numeric"
            className="min-h-11 w-32 font-mono tabular-nums sm:min-h-9"
          />
        </Field>
        <Field label={C.elevation.source}>
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={500}
            className="min-h-11 min-w-72 sm:min-h-9"
          />
        </Field>
        <Button type="button" onClick={save} disabled={pending}>
          {C.saveDraft}
        </Button>
      </div>
      <Said message={message} />
    </div>
  );
}

export function EgfrSwitch({ on }: { on: boolean }) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={() =>
          act(() => setReportEgfrAction({ on: !on }), on ? C.egfr.turnedOff : C.egfr.turnedOn)
        }
        className="text-body-s border-border hover:bg-muted ease-expo-out focus-visible:shadow-focus inline-flex min-h-11 w-fit items-center gap-3 rounded-full border px-3 transition-colors duration-150 outline-none disabled:opacity-45 sm:min-h-9"
      >
        <span
          aria-hidden
          className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors duration-150 ${on ? "justify-end bg-teal-600" : "bg-border justify-start"}`}
        >
          <span className="bg-card size-3 rounded-full" />
        </span>
        {C.egfr.switch}
        <span className="text-muted-foreground">{on ? C.egfr.on : C.egfr.off}</span>
      </button>
      <Said message={message} />
    </div>
  );
}

type PaymentMode = "off" | "inform" | "hold";

/** §5.14: payment before the sample. The never-held line is fixed and shown by the page, not here. */
export function PaymentModeForm({ mode: saved }: { mode: PaymentMode }) {
  const { pending, message, act } = useAct();
  const [mode, setMode] = useState<PaymentMode>(saved);
  return (
    <div className="flex flex-col gap-2">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-body-s text-muted-foreground mb-1">{C.payment.mode}</legend>
        {(["off", "inform", "hold"] as const).map((m) => (
          <label key={m} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-7">
            <input
              type="radio"
              name="paymentMode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
              className="size-4 accent-teal-600"
            />
            {C.payment[m]}
          </label>
        ))}
      </fieldset>
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || mode === saved}
          onClick={() => act(() => setLabSettingsAction({ paymentMode: mode }), C.payment.saved)}
        >
          {C.payment.save}
        </Button>
      </div>
      <Said message={message} />
    </div>
  );
}

/** §5.14: the hospital's high-risk specimen procedure, a link or a document title. Empty removes it. */
export function ProcedureForm({ initial }: { initial: string | null }) {
  const { pending, message, act } = useAct();
  const [text, setText] = useState(initial ?? "");
  const save = () =>
    act(
      async () => {
        const v = text.trim();
        if (v && v.length < 3) return { ok: false, error: C.procedure.tooShort };
        return setLabSettingsAction({ highRiskProcedure: v || null });
      },
      text.trim() ? C.procedure.saved : C.procedure.cleared,
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={C.procedure.field}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            className="min-h-11 min-w-72 sm:min-h-9"
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          onClick={save}
          disabled={pending || text.trim() === (initial ?? "")}
        >
          {C.procedure.save}
        </Button>
      </div>
      <Said message={message} />
    </div>
  );
}

type Read = "" | "reactive" | "non_reactive" | "none";
type Outcome = "" | Payload<"hiv_algorithm">["rules"][number]["outcome"];
type RuleRow = { t1: Read; t2: Read; t3: Read; outcome: Outcome };
const BLANK: RuleRow = { t1: "", t2: "", t3: "", outcome: "" };

/** The serial HIV algorithm (§5.14): kits in order, the rule table, the retest interval, the circular. */
export function HivEditor({ initial }: { initial: Payload<"hiv_algorithm"> | null }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [kits, setKits] = useState(
    [1, 2, 3].map((n) => initial?.assays.find((a) => a.step === n)?.kit ?? ""),
  );
  const [rules, setRules] = useState<RuleRow[]>(
    initial?.rules.map((r) => ({
      t1: r.t1,
      t2: r.t2 ?? "none",
      t3: r.t3 ?? "none",
      outcome: r.outcome,
    })) ?? [BLANK],
  );
  const [retest, setRetest] = useState(initial ? String(initial.retestDays) : "");
  const [circular, setCircular] = useState(initial?.circular ?? "");
  const patch = (i: number, p: Partial<RuleRow>) =>
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const save = () =>
    act(async () => {
      const payload = {
        assays: kits.flatMap((kit, i) => (kit.trim() ? [{ step: i + 1, kit: kit.trim() }] : [])),
        rules: rules.map((r) => ({
          t1: r.t1,
          t2: r.t2 === "none" ? null : r.t2,
          t3: r.t3 === "none" ? null : r.t3,
          outcome: r.outcome,
        })),
        retestDays: wholeNumber(retest),
        circular: circular.trim(),
      };
      if (!PAYLOADS.hiv_algorithm.safeParse(payload).success)
        return { ok: false, error: C.hiv.incomplete };
      const r = await saveConfigDraftAction({ kind: "hiv_algorithm", key: "serial", payload });
      if (r.ok) setOpen(false);
      return r;
    }, C.draftSaved);
  const readSelect = (i: number, k: "t1" | "t2" | "t3") => (
    <select
      aria-label={`Rule ${i + 1}, test ${k.slice(1)}`}
      value={rules[i]![k]}
      onChange={(e) => patch(i, { [k]: e.target.value as Read })}
      className={selectClass}
    >
      <option value="" disabled>
        {C.hiv.choose}
      </option>
      <option value="reactive">{C.hiv.reactive}</option>
      <option value="non_reactive">{C.hiv.nonReactive}</option>
      {k === "t1" ? null : <option value="none">{C.hiv.notDone}</option>}
    </select>
  );

  return (
    <div className="flex flex-col gap-2">
      <EditorDialog
        open={open}
        onOpenChange={setOpen}
        trigger={
          <DialogTrigger render={<Button variant="secondary" className="w-fit" />}>
            {C.hiv.edit}
          </DialogTrigger>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>{C.hiv.dialogTitle}</SheetTitle>
            <SheetDescription>{C.hiv.dialogLede}</SheetDescription>
          </SheetHeader>
          <SheetBody className="grid gap-6 lg:grid-cols-[16rem_1fr]">
            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-body-s mb-1 font-medium">{C.hiv.assays}</legend>
                {kits.map((kit, i) => (
                  <Field
                    key={i}
                    label={`${C.hiv.step(i + 1)}${i === 2 ? ` ${C.hiv.optional}` : ""}`}
                  >
                    <Input
                      aria-label={C.hiv.kit(i + 1)}
                      value={kit}
                      onChange={(e) =>
                        setKits((k) => k.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      maxLength={80}
                      className="min-h-11 sm:min-h-9"
                    />
                  </Field>
                ))}
              </fieldset>
              <Field label={C.hiv.retest}>
                <Input
                  value={retest}
                  onChange={(e) => setRetest(e.target.value)}
                  inputMode="numeric"
                  className="min-h-11 w-32 font-mono tabular-nums sm:min-h-9"
                />
              </Field>
              <Field label={C.hiv.circular}>
                <Input
                  value={circular}
                  onChange={(e) => setCircular(e.target.value)}
                  maxLength={500}
                  className="min-h-11 sm:min-h-9"
                />
              </Field>
            </div>
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-body-s mb-1 font-medium">{C.hiv.rules}</legend>
              <div className="overflow-auto">
                <table className="text-body-s w-full border-collapse text-left">
                  <thead>
                    <tr className="text-caption text-muted-foreground">
                      {C.hiv.ruleColumns.map((h) => (
                        <th key={h} scope="col" className="px-1 py-1 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r, i) => (
                      <tr key={i}>
                        <td className="px-1 py-1">{readSelect(i, "t1")}</td>
                        <td className="px-1 py-1">{readSelect(i, "t2")}</td>
                        <td className="px-1 py-1">{readSelect(i, "t3")}</td>
                        <td className="px-1 py-1">
                          <select
                            aria-label={`Rule ${i + 1} outcome`}
                            value={r.outcome}
                            onChange={(e) => patch(i, { outcome: e.target.value as Outcome })}
                            className={selectClass}
                          >
                            <option value="" disabled>
                              {C.hiv.choose}
                            </option>
                            {Object.entries(C.hiv.outcomes).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}
                            disabled={rules.length === 1}
                            className="min-h-11 sm:min-h-7"
                          >
                            {C.hiv.remove}
                            <span className="sr-only"> rule {i + 1}</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRules((rs) => [...rs, BLANK])}
                  className="min-h-11 sm:min-h-7"
                >
                  {C.hiv.addRule}
                </Button>
              </div>
            </fieldset>
            <div className="lg:col-span-2">
              <Said message={message} />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {C.cancel}
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {C.saveDraft}
            </Button>
          </SheetFooter>
        </div>
      </EditorDialog>
      {!open ? <Said message={message} /> : null}
    </div>
  );
}
