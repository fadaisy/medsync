"use client";

import type { WitnessOption } from "@/lib/pharmacy/controlled-read";
import { useId, useState, useTransition } from "react";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTROLLED_UI } from "@/content/pharmacy-controlled";
import { expiryText } from "@/content/pharmacy-stock";
import { CONTROLLED_COPY } from "@/lib/pharmacy/controlled";
import * as actions from "../controlled-actions";
import { Refusal, SELECT, TARGET } from "./review-dialogs";

/**
 * The two blocks every controlled action shares (5.9, wireframe §9): the witness, first, and the count,
 * batch by batch. The witness chooses their own name from the staff allowed to witness (never the
 * supplier, who is not listed) and types their own password and authenticator code; both fields are
 * emptied after every try and nothing typed is kept (D-PH1-42). The count's figures are typed, not
 * pre-filled, and committed by "Check the count" before MedSync's figure is shown; once committed they
 * cannot be retyped (CD-3).
 */

const U = CONTROLLED_UI;

export interface Witnessed {
  attestationId: string;
  cadre: string;
  at: string;
}

export type WitnessAction =
  | "controlled_supply"
  | "controlled_count"
  | "controlled_receipt"
  | "back_entry_confirmed";

export function WitnessBlock({
  witnesses,
  action,
  witnessed,
  onWitnessed,
  timeZone,
}: {
  witnesses: WitnessOption[];
  action: WitnessAction;
  witnessed: Witnessed | null;
  onWitnessed: (w: Witnessed) => void;
  timeZone: string;
}) {
  const ids = { who: useId(), password: useId(), code: useId() };
  const [who, setWho] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });

  if (witnessed)
    return (
      <p role="status" className="text-body-s inline-flex items-center gap-1.5">
        <CheckIcon aria-hidden className="size-4" />
        {U.witness.done(witnessed.cadre, time.format(new Date(witnessed.at)))}{" "}
        <span className="text-muted-foreground">{U.witness.method}</span>
      </p>
    );
  if (!witnesses.length) return <p className="text-body-s">{U.witness.nobody}</p>;

  const confirm = () =>
    start(async () => {
      const r = await actions.attestWitness({
        clientKey: crypto.randomUUID(),
        witnessUserId: who,
        password,
        code,
        action,
      });
      setPassword("");
      setCode("");
      if (!r.ok) return setError(r.error);
      setError(null);
      onWitnessed({ attestationId: r.id, cadre: r.cadre ?? "", at: r.at ?? r.serverTime });
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.who} className="text-caption">
            {U.witness.pick}
          </Label>
          <select
            id={ids.who}
            className={SELECT}
            value={who}
            onChange={(e) => setWho(e.target.value)}
          >
            <option value="" disabled>
              {U.witness.choose}
            </option>
            {witnesses.map((w) => (
              <option key={w.userId} value={w.userId}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.password} className="text-caption">
            {U.witness.password}
          </Label>
          <Input
            id={ids.password}
            type="password"
            autoComplete="off"
            value={password}
            maxLength={200}
            onChange={(e) => setPassword(e.target.value)}
            className={TARGET}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.code} className="text-caption">
            {U.witness.code}
          </Label>
          <Input
            id={ids.code}
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9 ]*"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-11 font-mono tabular-nums"
          />
        </div>
      </div>
      <p className="text-caption text-muted-foreground">{U.witness.hint}</p>
      <span className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          className={TARGET}
          disabled={pending || !who || !password || code.replace(/\s/g, "").length !== 6}
          onClick={confirm}
        >
          {U.witness.confirm}
        </Button>
        <Refusal error={error} />
      </span>
    </div>
  );
}

export interface CountBatch {
  id: string;
  batchNumber: string;
  expiry: string;
  expiryMonthOnly: boolean;
}
export interface CountedLine {
  batchId: string;
  batchNumber: string;
  counted: number;
  recorded: number;
}

/**
 * CD-3: "In the cupboard before", typed per batch; Check the count commits it (a witnessed count event)
 * and only the answer carries MedSync's figure. A difference is shown in amber with B-51; the supply
 * continues from the counted figure. `supplying` adds "Supplying" and "In the cupboard after".
 */
export function ControlledCount({
  medicineId,
  medicine,
  unit,
  scope,
  witness,
  batches,
  result,
  onCounted,
  supplying,
}: {
  medicineId: string;
  medicine: string;
  unit: string;
  scope: "controlled_supply" | "controlled_shift";
  witness: Witnessed | null;
  batches: CountBatch[];
  result: CountedLine[] | null;
  onCounted: (lines: CountedLine[]) => void;
  supplying?: ReadonlyMap<string, number>;
}) {
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!batches.length) return <p className="text-body-s">{U.count.noBatches}</p>;
  const whole = (s: string | undefined) => !!s && /^\d+$/.test(s.trim());
  const ready = !!witness && batches.every((b) => whole(typed[b.id]));

  const check = () =>
    start(async () => {
      const r = await actions.recordControlledCount({
        clientKey: crypto.randomUUID(),
        medicineId,
        scope,
        witnessAttestationId: witness!.attestationId,
        lines: batches.map((b) => ({ batchId: b.id, counted: Number(typed[b.id]!.trim()) })),
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      onCounted(r.lines);
    });

  return (
    <div className="flex flex-col gap-3">
      {!witness ? <p className="text-body-s text-muted-foreground">{U.witness.first}</p> : null}
      <ul className="divide-border flex flex-col divide-y">
        {batches.map((b) => {
          const line = result?.find((l) => l.batchId === b.id);
          const out = supplying?.get(b.id) ?? 0;
          return (
            <li key={b.id} className="flex flex-col gap-2 py-2">
              <span className="text-body-s flex flex-wrap items-end gap-3">
                <span className="font-mono tabular-nums">
                  {b.batchNumber} · {expiryText(b)}
                </span>
                <span className="flex flex-col gap-1">
                  <Label htmlFor={`count-${b.id}`} className="text-caption">
                    {U.count.before}: {medicine}, {b.batchNumber}
                    {unit ? ` (${unit})` : ""}
                  </Label>
                  <Input
                    id={`count-${b.id}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    disabled={!witness || !!result}
                    value={line ? String(line.counted) : (typed[b.id] ?? "")}
                    onChange={(e) => setTyped((t) => ({ ...t, [b.id]: e.target.value }))}
                    className="min-h-11 w-28 font-mono tabular-nums"
                  />
                </span>
              </span>
              {line ? (
                <span className="text-body-s flex flex-wrap items-center gap-2">
                  {line.counted === line.recorded ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckIcon aria-hidden className="size-4" />
                      {U.count.counted(line.counted)} · {U.count.record(line.recorded)} ·{" "}
                      {U.count.matches}
                    </span>
                  ) : (
                    <>
                      <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                        {U.count.counted(line.counted)} · {U.count.record(line.recorded)}
                      </StatusWord>
                      <span>
                        {CONTROLLED_COPY.difference} {U.count.continues(line.counted)}
                      </span>
                    </>
                  )}
                  {supplying ? (
                    <span className="font-mono tabular-nums">
                      · {U.count.supplying} {out} · {U.count.after} {line.counted - out}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {result ? null : (
        <span className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            disabled={pending || !ready}
            onClick={check}
          >
            {U.count.check}
          </Button>
          <Refusal error={error} />
        </span>
      )}
    </div>
  );
}
