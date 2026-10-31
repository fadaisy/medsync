"use client";

import type { PharmacyDialogProps } from "../../../_components/pharmacy-dialog";
import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import type { LineResult } from "@/lib/pharmacy/stores/receiving";
import type { ScanOutcome, ScanProduct } from "@/lib/pharmacy/stores/scan-fill";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CheckIcon, PrinterIcon, ScanLineIcon } from "lucide-react";

import { scanProductAction } from "@/app/pharmacy/catalogue-actions";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resultWords, STORE } from "@/content/pharmacy-stores-store";
import { readScan } from "@/lib/pharmacy/stores/scan-fill";
import { PharmacyDialog, Refusal } from "../../../_components/pharmacy-dialog";
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

export { Refusal };

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

/** The store's dialog: the pharmacy's one dialog (D-PW-10) with the store's words. */
export function StoreDialog(props: PharmacyDialogProps) {
  return (
    <PharmacyDialog {...props} cancelLabel={STORE.places.cancel} doneLabel={STORE.count.done} />
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
  const read = async () => {
    if (!value.trim()) return;
    const o = readScan(value, products);
    setNote(o.note);
    onRead(o);
    // Catalogue slice Step 7: a GTIN no product here carries may be linked through the catalogue to one of them.
    if (o.kind === "gs1" && !o.productId && o.scan.gtin) {
      const r = await scanProductAction({ raw: value });
      if (r.ok && r.productId && products.some((p) => p.id === r.productId)) {
        const found = {
          ...o,
          productId: r.productId,
          note: o.note.replace(STORE.scan.unknownGtin, "").trim(),
        };
        setNote(found.note);
        onRead(found);
      }
    }
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
