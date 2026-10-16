"use client";

import type { EntryPatient } from "../entry-actions";
import { useId, useState, useTransition } from "react";

import { CautionNotice } from "@/components/medsync/caution-notice";
import { FormDialog, FormField, SELECT_CLASS } from "@/components/medsync/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOWNTIME_PAGE, DOWNTIME_ENTRY as E } from "@/content/pharmacy-golive";
import { NOT_SUPPLIED_REASONS } from "@/content/pharmacy-review";
import { DOWNTIME_COPY, transcribedText } from "@/lib/pharmacy/downtime";
import * as actions from "../entry-actions";

/**
 * One row of a downtime sheet (5.12, wireframe §12.2). The patient by MedSync number (nobody is
 * created here); the prescription MedSync holds, a paper line already transcribed, or A paper
 * prescription typed as written; then the supply (product, batch, quantity, time from the sheet,
 * supplied by, the identity tick, the pharmacist's initials, and for a controlled drug the witness and
 * the register tick) or the not-supplied outcome. Save row · Save and next row · Sheet complete.
 */

type Section = "supply" | "not_supplied";
interface PaperLine {
  medicineAsWritten: string;
  directionsAsWritten: string;
  quantityAsWritten: string;
}
const blankLine = (): PaperLine => ({
  medicineAsWritten: "",
  directionsAsWritten: "",
  quantityAsWritten: "",
});

export function RowForm(props: {
  sheet: number;
  sheetLabel: string;
  nextRow: Record<Section, number>;
  products: { id: string; name: string; strength: string | null; issueUnit: string }[];
  batches: { id: string; productId: string; number: string; expiry: string }[];
  cadres: { code: "PHARMACIST" | "PHARMACY_TECH"; name: string }[];
  today: string;
  timeZone: string;
  /** The transcriber's own cadre name, for B-74. */
  cadreName: string;
}) {
  const id = useId();
  const f = (k: string) => `${id}-${k}`;
  const [pending, start] = useTransition();
  const [section, setSection] = useState<Section>("supply");
  const [row, setRow] = useState(props.nextRow.supply);
  const [code, setCode] = useState("");
  const [patient, setPatient] = useState<EntryPatient | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [choice, setChoice] = useState<string>("");
  const [paper, setPaper] = useState({ prescriberName: "", prescriberCadre: "", writtenOn: "" });
  const [lines, setLines] = useState<PaperLine[]>([blankLine()]);
  const [lineNo, setLineNo] = useState(1);
  const [productId, setProductId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(props.today);
  const [time, setTime] = useState("");
  const [cadre, setCadre] = useState(props.cadres[0]?.code ?? "PHARMACY_TECH");
  const [identity, setIdentity] = useState<"checked" | "not_checked" | "not_recorded">("checked");
  const [initials, setInitials] = useState("");
  const [witness, setWitness] = useState("");
  const [register, setRegister] = useState(false);
  const [outcome, setOutcome] = useState<"owed" | "buying_outside">("owed");
  const [reason, setReason] = useState<keyof typeof NOT_SUPPLIED_REASONS>("out_point");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const hm = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: props.timeZone,
  });
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: props.timeZone,
  });
  const medsyncLine = patient?.lines.find((l) => l.id === choice);
  const controlled = medsyncLine?.controlled === true;

  const find = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    start(async () => {
      const p = await actions.findPatientForEntry({ patientNumber: code });
      setPatient(p);
      setNotFound(p === null);
      setChoice("");
    });
  };

  const prescription = () => {
    if (choice === "paper")
      return {
        kind: "paper" as const,
        ...paper,
        lines: lines.map((l) => ({ ...l, quantityAsWritten: l.quantityAsWritten || null })),
        lineNo,
      };
    if (patient?.paper.some((p) => p.id === choice))
      return { kind: "paper_line" as const, paperLineId: choice };
    return { kind: "medsync" as const, lineId: choice };
  };

  const save = (next: boolean) => {
    if (!patient) return;
    setError(null);
    start(async () => {
      const r = await actions.enterDowntimeRow({
        clientKey: crypto.randomUUID(),
        sheet: props.sheet,
        section,
        row,
        patientUserId: patient.patientUserId,
        // Uganda keeps one offset all year (Africa/Kampala, UTC+3).
        suppliedAt: `${date}T${time}:00+03:00`,
        prescription: prescription(),
        supply:
          section === "supply"
            ? {
                productId,
                batchId,
                quantity: Number(quantity),
                suppliedByCadre: cadre,
                identity,
                pharmacistInitials: initials.trim() || null,
                controlled:
                  witness.trim() || register
                    ? { witnessNameAsWritten: witness.trim(), registerAttested: register }
                    : null,
              }
            : null,
        notSupplied: section === "not_supplied" ? { outcome, reasonCode: reason } : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data)
        setSaved(
          E.savedAs(hm.format(new Date(r.data.suppliedAt)), hm.format(new Date(r.data.enteredAt))),
        );
      if (next) {
        setRow(row + 1);
        setPatient(null);
        setCode("");
        setChoice("");
        setQuantity("");
        setInitials("");
        setWitness("");
        setRegister(false);
        setLines([blankLine()]);
        setLineNo(1);
      }
    });
  };

  const batches = props.batches.filter((b) => b.productId === productId);
  return (
    <section className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={E.section} id={f("section")}>
          <select
            id={f("section")}
            className={SELECT_CLASS}
            value={section}
            onChange={(e) => {
              const s = e.target.value as Section;
              setSection(s);
              setRow(props.nextRow[s]);
            }}
          >
            <option value="supply">{E.sections.supply}</option>
            <option value="not_supplied">{E.sections.not_supplied}</option>
          </select>
        </FormField>
        <FormField label={E.row} id={f("row")}>
          <Input
            id={f("row")}
            type="number"
            min={1}
            max={99}
            value={row}
            onChange={(e) => setRow(Number(e.target.value))}
            className="min-h-11 w-24 font-mono"
          />
        </FormField>
        <form onSubmit={find} className="flex items-end gap-2">
          <FormField label={E.patient} id={f("code")}>
            <Input
              id={f("code")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              className="min-h-11 font-mono"
            />
          </FormField>
          <Button type="submit" variant="secondary" className="min-h-11" disabled={pending}>
            {E.find}
          </Button>
        </form>
      </div>

      {notFound ? <CautionNotice lead={DOWNTIME_COPY.notRegistered} /> : null}

      {patient ? (
        <>
          <p className="text-body-s" aria-live="polite">
            {patient.identity ? E.foundAs(patient.identity.name, patient.identity.mrn) : code}
          </p>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-caption mb-1.5 font-medium">{E.prescription}</legend>
            {patient.lines.map((l) => (
              <label key={l.id} className="text-body-s flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={f("rx")}
                  checked={choice === l.id}
                  onChange={() => setChoice(l.id)}
                />
                {day.format(new Date(l.createdAt))} · {l.drugName}
                {l.concentration ? ` ${l.concentration}` : ""} · {l.dose} · {l.frequency}
              </label>
            ))}
            {section === "supply"
              ? patient.paper.map((p) => (
                  <label key={p.id} className="text-body-s flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name={f("rx")}
                      checked={choice === p.id}
                      onChange={() => setChoice(p.id)}
                    />
                    {E.paperLine(p.medicine, p.prescriber, p.writtenOn)}
                  </label>
                ))
              : null}
            <label className="text-body-s flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={f("rx")}
                checked={choice === "paper"}
                onChange={() => setChoice("paper")}
              />
              {E.paper}
            </label>
          </fieldset>

          {choice === "paper" ? (
            <div className="border-border flex flex-col gap-3 rounded-md border p-3">
              <p className="text-caption text-muted-foreground">
                {transcribedText(props.cadreName)}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label={E.prescriberName} id={f("pn")}>
                  <Input
                    id={f("pn")}
                    value={paper.prescriberName}
                    maxLength={120}
                    onChange={(e) => setPaper({ ...paper, prescriberName: e.target.value })}
                    className="min-h-11"
                  />
                </FormField>
                <FormField label={E.prescriberCadre} id={f("pc")}>
                  <Input
                    id={f("pc")}
                    value={paper.prescriberCadre}
                    maxLength={80}
                    onChange={(e) => setPaper({ ...paper, prescriberCadre: e.target.value })}
                    className="min-h-11"
                  />
                </FormField>
                <FormField label={E.writtenOn} id={f("pw")}>
                  <Input
                    id={f("pw")}
                    type="date"
                    max={props.today}
                    value={paper.writtenOn}
                    onChange={(e) => setPaper({ ...paper, writtenOn: e.target.value })}
                    className="min-h-11"
                  />
                </FormField>
              </div>
              <fieldset className="flex flex-col gap-3">
                <legend className="text-caption mb-1.5 font-medium">{E.paperLines}</legend>
                {lines.map((l, i) => {
                  const set = (patch: Partial<PaperLine>) =>
                    setLines(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="grid items-end gap-3 sm:grid-cols-[auto_1fr_2fr_1fr]">
                      <label className="text-body-s flex min-h-11 items-center gap-2">
                        <input
                          type="radio"
                          name={f("line")}
                          checked={lineNo === i + 1}
                          onChange={() => setLineNo(i + 1)}
                        />
                        <span className="sr-only">{E.thisRow}</span>
                        <span className="font-mono tabular-nums">{i + 1}</span>
                      </label>
                      <FormField label={E.medicineAsWritten} id={f(`m${i}`)}>
                        <Input
                          id={f(`m${i}`)}
                          value={l.medicineAsWritten}
                          maxLength={200}
                          onChange={(e) => set({ medicineAsWritten: e.target.value })}
                          className="min-h-11"
                        />
                      </FormField>
                      <FormField label={E.directionsAsWritten} id={f(`d${i}`)}>
                        <Input
                          id={f(`d${i}`)}
                          value={l.directionsAsWritten}
                          maxLength={500}
                          onChange={(e) => set({ directionsAsWritten: e.target.value })}
                          className="min-h-11"
                        />
                      </FormField>
                      <FormField label={E.quantityAsWritten} id={f(`q${i}`)}>
                        <Input
                          id={f(`q${i}`)}
                          value={l.quantityAsWritten}
                          maxLength={80}
                          onChange={(e) => set({ quantityAsWritten: e.target.value })}
                          className="min-h-11"
                        />
                      </FormField>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 self-start"
                  onClick={() => setLines([...lines, blankLine()])}
                  disabled={lines.length >= 20}
                >
                  {E.addLine}
                </Button>
              </fieldset>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={E.date} id={f("date")}>
              <Input
                id={f("date")}
                type="date"
                max={props.today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-11"
              />
            </FormField>
            <FormField label={E.time} id={f("time")}>
              <Input
                id={f("time")}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="min-h-11 font-mono"
              />
            </FormField>
          </div>

          {section === "supply" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label={E.product} id={f("product")}>
                <select
                  id={f("product")}
                  className={SELECT_CLASS}
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setBatchId("");
                  }}
                >
                  <option value="" />
                  {props.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.strength ? `, ${p.strength}` : ""}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={E.batch} id={f("batch")}>
                <select
                  id={f("batch")}
                  className={SELECT_CLASS}
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  <option value="" />
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.number} · {b.expiry}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={E.quantity} id={f("qty")}>
                <Input
                  id={f("qty")}
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="min-h-11 w-28 font-mono"
                />
              </FormField>
              <FormField label={E.suppliedBy} id={f("by")}>
                <select
                  id={f("by")}
                  className={SELECT_CLASS}
                  value={cadre}
                  onChange={(e) => setCadre(e.target.value as typeof cadre)}
                >
                  {props.cadres.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-caption mb-1.5 font-medium">{E.identity}</legend>
                {(Object.keys(E.identities) as (keyof typeof E.identities)[]).map((k) => (
                  <label key={k} className="text-body-s flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name={f("identity")}
                      checked={identity === k}
                      onChange={() => setIdentity(k)}
                    />
                    {E.identities[k]}
                  </label>
                ))}
              </fieldset>
              <FormField label={E.initials} id={f("initials")}>
                <Input
                  id={f("initials")}
                  value={initials}
                  maxLength={10}
                  onChange={(e) => setInitials(e.target.value)}
                  className="min-h-11 w-28 font-mono"
                />
              </FormField>
              {choice ? (
                <details open={controlled} className="sm:col-span-3">
                  <summary className="text-body-s min-h-11 cursor-pointer font-medium">
                    {E.controlledHeading}
                  </summary>
                  <div className="grid gap-4 pt-2 sm:grid-cols-2">
                    <FormField label={E.witness} id={f("witness")}>
                      <Input
                        id={f("witness")}
                        value={witness}
                        maxLength={120}
                        onChange={(e) => setWitness(e.target.value)}
                        className="min-h-11"
                      />
                    </FormField>
                    <label className="text-body-s flex min-h-11 items-center gap-2 self-end">
                      <input
                        type="checkbox"
                        checked={register}
                        onChange={(e) => setRegister(e.target.checked)}
                      />
                      {E.register}
                    </label>
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="flex flex-col gap-1">
                <legend className="text-caption mb-1.5 font-medium">{E.outcome}</legend>
                {(Object.keys(E.outcomes) as (keyof typeof E.outcomes)[]).map((k) => (
                  <label key={k} className="text-body-s flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name={f("outcome")}
                      checked={outcome === k}
                      onChange={() => setOutcome(k)}
                    />
                    {E.outcomes[k]}
                  </label>
                ))}
              </fieldset>
              <FormField label={E.why} id={f("why")}>
                <select
                  id={f("why")}
                  className={SELECT_CLASS}
                  value={reason}
                  onChange={(e) => setReason(e.target.value as typeof reason)}
                >
                  {Object.entries(NOT_SUPPLIED_REASONS).map(([k, w]) => (
                    <option key={k} value={k}>
                      {w}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          )}
        </>
      ) : null}

      {error ? (
        <div role="alert">
          <CautionNotice lead={error} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={pending || !patient || !choice || !time}
          onClick={() => save(false)}
        >
          {E.save}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={pending || !patient || !choice || !time}
          onClick={() => save(true)}
        >
          {E.saveNext}
        </Button>
        <FormDialog
          label={E.complete}
          title={E.complete}
          description={E.completeConfirm}
          submit={E.complete}
          cancel={DOWNTIME_PAGE.cancel}
          variant="ghost"
          onSave={async () => {
            const r = await actions.completeSheet({ number: props.sheet });
            return r.ok ? { ok: true } : { ok: false, error: r.error ?? E.failed };
          }}
        >
          <p className="text-body-s font-mono">{props.sheetLabel}</p>
        </FormDialog>
      </div>
      {saved ? (
        <p className="text-body-s tabular-nums" aria-live="polite">
          {saved}
        </p>
      ) : null}
    </section>
  );
}
