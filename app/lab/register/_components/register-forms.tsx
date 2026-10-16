"use client";

import type { RegisterConfig } from "@/lib/lab/register";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAB3_REGISTER } from "@/content/lab-phase-3";
import {
  printRegisterAction,
  saveRegisterConfigAction,
  signRegisterConfigAction,
} from "@/lib/lab/hmis-actions";
import { Pop } from "../../_components/pop";
import { Said, useAct } from "../../setup/criticals/_components/setup-forms";
import { SignButton } from "../../setup/drafts/_components/sign-button";

const R = LAB3_REGISTER;
type Register = "general" | "hiv" | "tb" | "mental_health" | "sexual_reproductive_health";

/** DR-4: the print event is written first; the browser's print dialog opens only once it is recorded. */
export function PrintRegister(props: {
  register: Register;
  sectionId: string;
  day: string;
  rows: number;
}) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        disabled={pending}
        className="min-h-11 w-fit sm:min-h-8"
        onClick={() =>
          act(async () => {
            const r = await printRegisterAction(props);
            if (r.ok) window.print();
            return r;
          }, R.printed)
        }
      >
        {R.print}
      </Button>
      <Said message={message} />
    </div>
  );
}

/** DR-2: the paper register's columns, in its order and with its headings; the lead signs them alone. */
export function RegisterColumns({
  register,
  choices,
  current,
  draft,
}: {
  register: Register;
  choices: { key: string; label: string }[];
  current: RegisterConfig;
  draft: { id: string; authoredByMe: boolean } | null;
}) {
  const [open, setOpen] = useState(false);
  const start = [
    ...current.columns.map((c) => ({ ...c, on: true })),
    ...choices
      .filter((c) => !current.columns.some((x) => x.key === c.key))
      .map((c) => ({ ...c, on: false })),
  ];
  const [cols, setCols] = useState(start);
  const { pending, message, act } = useAct();
  const move = (i: number, d: -1 | 1) =>
    setCols((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  const save = () =>
    act(
      () =>
        saveRegisterConfigAction({
          register,
          payload: { columns: cols.filter((c) => c.on).map(({ key, label }) => ({ key, label })) },
        }),
      R.draftWaiting,
    );
  return (
    <Pop
      label={R.editColumns}
      title={R.editColumns}
      lede={R.editLede}
      width="wide"
      open={open}
      setOpen={setOpen}
      action={
        <Button type="button" onClick={save} disabled={pending}>
          {R.saveDraft}
        </Button>
      }
    >
      <ol className="flex flex-col gap-2">
        {cols.map((c, i) => (
          <li key={c.key} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_auto_auto]">
            <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8">
              <input
                type="checkbox"
                checked={c.on}
                onChange={(e) =>
                  setCols((l) => l.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))
                }
              />
              <span className="sr-only">{R.include}</span>
            </label>
            <Input
              aria-label={R.heading}
              value={c.label}
              maxLength={120}
              onChange={(e) =>
                setCols((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
              className="min-h-11 sm:min-h-9"
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => move(i, -1)}>
              {R.up}
              <span className="sr-only"> {c.label}</span>
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => move(i, 1)}>
              {R.down}
              <span className="sr-only"> {c.label}</span>
            </Button>
          </li>
        ))}
      </ol>
      <Said message={message} />
      {draft ? (
        <SignButton
          label={R.sign}
          okText={R.signed}
          authoredByMe={draft.authoredByMe}
          noteLabel="You saved these columns: say why no other laboratory lead can sign."
          onSign={(exceptionNote) =>
            signRegisterConfigAction({ configId: draft.id, exceptionNote })
          }
        />
      ) : null}
    </Pop>
  );
}
