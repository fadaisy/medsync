"use client";

import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import type { LineResult } from "@/lib/pharmacy/stores/receiving";
import type { ScanOutcome, ScanProduct } from "@/lib/pharmacy/stores/scan-fill";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CheckIcon, PrinterIcon, ScanLineIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { resultWords, STORE } from "@/content/pharmacy-stores-store";
import { readScan } from "@/lib/pharmacy/stores/scan-fill";
import { attestStoreWitness } from "../../actions";

export { expiryForField } from "@/lib/pharmacy/stores/scan-fill";
export type { ScanOutcome, ScanProduct } from "@/lib/pharmacy/stores/scan-fill";

/**
 * The store's shared client pieces (Pharmacy Phase 2, Step 4): the centred dialog (ADR 0161, EditorDialog), the
 * field, the result word (amber with an icon for every result except Matches; nothing green, no red), the scan
 * field (5.11: a keyboard wedge types the scan; GS1 prefills, anything else stays typed text; nothing requires a
 * scan), the witness (D-PH1-42) and the logged print button (print CSS only). Targets are 44 px.
 */

export const TARGET = "min-h-11";
export const SELECT =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-md border px-2.5 outline-none";
export const newKey = () => crypto.randomUUID();
export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const num = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Number(v);
};

export function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Refusal({ error }: { error: string | null }) {
  return (
    <p role="status" className="empty:hidden">
      {error ? (
        <StatusWord tone="caution" glyph={TriangleAlertIcon}>
          {error}
        </StatusWord>
      ) : null}
    </p>
  );
}

/** RG-2: Matches is neutral; every other result is amber with an icon and its word (Law 13). */
export function ResultWords({ results }: { results: readonly LineResult[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {results.map((r, i) =>
        r.kind === "matches" ? (
          <StatusWord key={i}>{resultWords(r)}</StatusWord>
        ) : (
          <StatusWord key={i} tone="caution">
            {resultWords(r)}
          </StatusWord>
        ),
      )}
    </span>
  );
}

/** One centred dialog: its button, its form, the refusal in words, Cancel and the one action. */
export function StoreDialog({
  label,
  title,
  description,
  submit,
  variant = "secondary",
  width = "medium",
  onOpen,
  onSave,
  done,
  disabled,
  children,
}: {
  label: string;
  title: string;
  description?: ReactNode;
  submit: string;
  variant?: "primary" | "secondary" | "ghost";
  width?: "medium" | "wide" | "xl";
  onOpen?: () => void;
  /** "stay" keeps the dialog open (a count's second step). */
  onSave: (key: string, data: FormData) => Promise<ActionResult<unknown> | "stay">;
  done?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errorId = useId();
  const change = (next: boolean) => {
    if (next) {
      setKey(newKey());
      setError(null);
      onOpen?.();
    }
    setOpen(next);
  };
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await onSave(key, data);
      if (r === "stay") return setError(null);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <EditorDialog
      width={width}
      open={open}
      onOpenChange={change}
      trigger={
        <DialogTrigger render={<Button variant={variant} className={TARGET} disabled={disabled} />}>
          {label}
        </DialogTrigger>
      }
    >
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col" aria-describedby={errorId}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {children}
          <div id={errorId}>
            <Refusal error={error} />
          </div>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            onClick={() => setOpen(false)}
          >
            {done ? STORE.count.done : STORE.places.cancel}
          </Button>
          {done ? null : (
            <Button type="submit" className={TARGET} disabled={pending}>
              {submit}
            </Button>
          )}
        </SheetFooter>
      </form>
    </EditorDialog>
  );
}

/** A keyboard-wedge field: a scanner types the code and presses Enter. Typing works the same. */
export function ScanField({
  onRead,
  products,
}: {
  onRead: (o: ScanOutcome) => void;
  products: readonly ScanProduct[];
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const read = () => {
    if (!value.trim()) return;
    const o = readScan(value, products);
    setNote(o.note);
    onRead(o);
  };
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="inline-flex items-center gap-1.5">
        <ScanLineIcon aria-hidden className="size-4" />
        {STORE.scan.label}
      </Label>
      <Input
        id={id}
        value={value}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            read();
          }
        }}
        onBlur={read}
        className={`${TARGET} font-mono`}
      />
      <p className="text-caption text-muted-foreground" role="status">
        {note ?? STORE.scan.hint}
      </p>
    </div>
  );
}

export interface WitnessOption {
  userId: string;
  label: string;
}

/**
 * D-PH1-42 at the store: the witness picks their own name and types their own password and code; both fields
 * are emptied after every try and nothing typed is kept.
 */
export function StoreWitness({
  witnesses,
  action,
  witnessed,
  onWitnessed,
}: {
  witnesses: readonly WitnessOption[];
  action: "controlled_receipt" | "controlled_transfer" | "controlled_count";
  witnessed: { attestationId: string; at: string } | null;
  onWitnessed: (w: { attestationId: string; at: string }) => void;
}) {
  const ids = { who: useId(), password: useId(), code: useId() };
  const [who, setWho] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const A = STORE.attest;
  if (witnessed)
    return (
      <p role="status" className="text-body-s inline-flex items-center gap-1.5">
        <CheckIcon aria-hidden className="size-4" />
        {A.done(
          new Date(witnessed.at).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        )}
      </p>
    );
  if (!witnesses.length) return <p className="text-body-s">{A.nobody}</p>;
  const confirm = () =>
    start(async () => {
      const r = await attestStoreWitness({
        clientKey: newKey(),
        witnessUserId: who,
        password,
        code,
        action,
      });
      setPassword("");
      setCode("");
      if (!r.ok) return setError(r.error);
      setError(null);
      onWitnessed({ attestationId: r.id, at: r.at ?? r.serverTime });
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={A.who} id={ids.who}>
          <select
            id={ids.who}
            className={SELECT}
            value={who}
            onChange={(e) => setWho(e.target.value)}
          >
            <option value="" disabled>
              {A.choose}
            </option>
            {witnesses.map((w) => (
              <option key={w.userId} value={w.userId}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={A.password} id={ids.password}>
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
        <Field label={A.code} id={ids.code}>
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
          {A.confirm}
        </Button>
        <Refusal error={error} />
      </span>
    </div>
  );
}

/** A print logged first (pharmacy_print_events), then the browser's print of this page's print section. */
export function PrintButton({
  label,
  log,
  section,
}: {
  label: string;
  log: (clientKey: string) => Promise<ActionResult<unknown>>;
  /** Which `data-print-section` prints; the others are hidden while it does. */
  section?: string;
}) {
  const [error, setError] = useState<string | null>(null);
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
            if (!r.ok) return setError(r.error);
            setError(null);
            const skipped = section
              ? [...document.querySelectorAll<HTMLElement>("[data-print-section]")].filter(
                  (el) => el.dataset.printSection !== section,
                )
              : [];
            skipped.forEach((el) => (el.style.display = "none"));
            window.print();
            skipped.forEach((el) => (el.style.display = ""));
          })
        }
      >
        <PrinterIcon aria-hidden className="size-4" />
        {label}
      </Button>
      <Refusal error={error} />
    </span>
  );
}

/** An action button with no form: runs, refreshes, shows a refusal in words. */
export function ActButton({
  label,
  run,
  variant = "primary",
  disabled,
}: {
  label: string;
  run: () => Promise<ActionResult<unknown>>;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={variant}
        className={TARGET}
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const r = await run();
            if (!r.ok) return setError(r.error);
            setError(null);
            router.refresh();
          })
        }
      >
        {label}
      </Button>
      <Refusal error={error} />
    </span>
  );
}
