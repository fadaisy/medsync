"use client";

import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import type { ReactNode } from "react";
import { useId, useState, useTransition } from "react";
import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { Field, newKey, Refusal, SELECT, TARGET } from "../places/_components/store-kit";

/**
 * Lane C's client pieces on top of the store kit: a person's confirmation with their own password and code (a
 * signer, a witness, a second approver; D-PH1-42: typed once, never kept in state after the answer), an
 * arithmetic disclosure (a button that expands in place and is announced, Section 10) and a copy button.
 */

export interface Person {
  userId: string;
  label: string;
}

export function AttestBox({
  people,
  action,
  attest,
  done,
  onDone,
  label,
}: {
  people: readonly Person[];
  action: string;
  attest: (raw: unknown) => Promise<ActionResult>;
  done: { id: string; who: string } | null;
  onDone: (a: { id: string; who: string }) => void;
  label: string;
}) {
  const ids = { who: useId(), password: useId(), code: useId() };
  const [who, setWho] = useState(people.length === 1 ? people[0]!.userId : "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done)
    return (
      <p role="status" className="text-body-s inline-flex items-center gap-1.5">
        <CheckIcon aria-hidden className="size-4" />
        {SUPPLY_COMMON.confirmed(done.who)}
      </p>
    );
  const confirm = () =>
    start(async () => {
      const r = await attest({ clientKey: newKey(), userId: who, password, code, action });
      setPassword("");
      setCode("");
      if (!r.ok) return setError(r.error);
      setError(null);
      onDone({ id: r.id, who: people.find((p) => p.userId === who)?.label ?? "" });
    });
  return (
    <fieldset className="border-border flex flex-col gap-3 rounded-md border p-3">
      <legend className="text-body-s px-1">{label}</legend>
      <p className="text-caption text-muted-foreground">{SUPPLY_COMMON.witnessHint}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={SUPPLY_COMMON.who} id={ids.who}>
          <select
            id={ids.who}
            className={SELECT}
            value={who}
            onChange={(e) => setWho(e.target.value)}
          >
            <option value="" disabled>
              {SUPPLY_COMMON.choose}
            </option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={SUPPLY_COMMON.theirPassword} id={ids.password}>
          <Input
            id={ids.password}
            type="password"
            autoComplete="off"
            value={password}
            maxLength={200}
            onChange={(e) => setPassword(e.target.value)}
            className={TARGET}
          />
        </Field>
        <Field label={SUPPLY_COMMON.theirCode} id={ids.code}>
          <Input
            id={ids.code}
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${TARGET} font-mono tabular-nums`}
          />
        </Field>
      </div>
      <span className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          className={TARGET}
          disabled={pending || !who || !password || code.replace(/\s/g, "").length !== 6}
          onClick={confirm}
        >
          {SUPPLY_COMMON.confirm}
        </Button>
        <Refusal error={error} />
      </span>
    </fieldset>
  );
}

/** Section 10: the arithmetic behind a figure, a button that expands in place; its state is announced. */
export function Disclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="text-body-s text-primary inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline print:hidden"
      >
        <ChevronDownIcon aria-hidden className={`size-4 ${open ? "rotate-180" : ""}`} />
        {open ? SUPPLY_COMMON.hideWorking : SUPPLY_COMMON.showWorking}
      </button>
      <div id={id} hidden={!open} role="region" aria-live="polite" className="text-caption">
        {children}
      </div>
    </div>
  );
}

/** Copies plain text after logging it (the order's quantities; Law 10: a person types them elsewhere). */
export function CopyButton({
  label,
  text,
  log,
}: {
  label: string;
  text: string;
  log: (clientKey: string) => Promise<ActionResult>;
}) {
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2 print:hidden">
      <Button
        type="button"
        variant="secondary"
        className={TARGET}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await log(newKey());
            if (!r.ok) return setSaid(r.error);
            await navigator.clipboard.writeText(text).catch(() => undefined);
            setSaid(SUPPLY_COMMON.copied);
          })
        }
      >
        <CopyIcon aria-hidden className="size-4" />
        {label}
      </Button>
      <span role="status" className="text-caption">
        {said}
      </span>
    </span>
  );
}
