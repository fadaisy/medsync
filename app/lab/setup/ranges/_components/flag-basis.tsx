"use client";

import type { CutoffConcept } from "@/lib/lab/cutoffs-read";
import { useId, useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { saveConfigDraftAction } from "@/lib/lab/catalogue-v2-actions";
import { Said, useAct } from "../../criticals/_components/setup-forms";
import { SchemeSign } from "./scheme-sign";

type Basis = "reference" | "scheme";

/**
 * "What flags {result}" (§5.12, DS-2): the reference interval or the decision cut-offs. Choosing saves a
 * flag-basis draft; the basis in force does not change until the laboratory lead and the CSO have both
 * signed.
 */
export function FlagBasis({
  conceptId,
  display,
  schemeLabel,
  basis,
  inForceFrom,
  userId,
}: {
  conceptId: string;
  display: string;
  schemeLabel: string;
  basis: CutoffConcept["basis"];
  /** The in-force basis' date, already in words. */
  inForceFrom: string | null;
  userId: string;
}) {
  const { pending, message, act } = useAct();
  const open = basis.drafts.find((d) => !d.leadSigned);
  const waiting = basis.drafts.find((d) => d.leadSigned);
  const now: Basis = basis.signed?.basis ?? "reference";
  const [choice, setChoice] = useState<Basis>(
    (open ?? waiting)?.payload.basis ?? basis.signed?.basis ?? "reference",
  );
  const name = useId();
  const words = (b: Basis) =>
    b === "reference" ? "Reference interval" : `Decision cut-offs: ${schemeLabel}`;
  const choose = (b: Basis) => {
    setChoice(b);
    act(
      () => saveConfigDraftAction({ kind: "flag_basis", key: conceptId, payload: { basis: b } }),
      "Draft saved. The basis in force stays until the laboratory lead and the CSO have both signed.",
    );
  };
  return (
    <fieldset className="flex flex-col gap-2" disabled={pending}>
      <legend className="text-body-s mb-1 font-medium">What flags {display}</legend>
      {(["reference", "scheme"] as const).map((b) => (
        <label key={b} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
          <input
            type="radio"
            name={name}
            value={b}
            checked={choice === b}
            onChange={() => choose(b)}
            className="size-4 accent-teal-600"
          />
          {words(b)}
        </label>
      ))}
      <p className="text-body-s text-muted-foreground">
        In force now: {words(now)}
        {basis.signed
          ? ` (version ${basis.signed.version}, signed ${inForceFrom})`
          : " (no basis signed yet, so results flag on the reference interval)"}
        .
      </p>
      {waiting ? (
        <p className="text-body-s flex flex-wrap items-center gap-2">
          <StatusWord tone="caution">Waiting for the CSO</StatusWord>
          {words(waiting.payload.basis)}, version {waiting.version}. {words(now)} stays in force
          until both signatures land.
        </p>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord tone="caution">Draft</StatusWord>
            {words(open.payload.basis)}, version {open.version}. {words(now)} stays in force until
            the laboratory lead and the CSO have both signed.
          </p>
          <SchemeSign configId={open.id} authoredByMe={open.authoredBy === userId} />
        </div>
      ) : null}
      <Said message={message} />
    </fieldset>
  );
}
