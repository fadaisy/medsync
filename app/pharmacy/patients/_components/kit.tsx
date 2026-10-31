"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MinusIcon, PlusIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { PRW } from "@/content/pharmacy-rework-patients";
import { cn } from "@/lib/utils";

/** The P4 pages' small client kit: a chip, a stepper and a centred dialog that runs one server action. */
export function Chip({
  on,
  onClick,
  children,
  disabled,
}: {
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on ?? false}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "focus-visible:shadow-focus inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] outline-none disabled:opacity-50",
        on
          ? "bg-tide-navy-900 text-tide-on-band font-semibold"
          : "bg-card text-ink-700 hover:bg-ink-50 font-medium shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
      )}
    >
      {children}
    </button>
  );
}

export function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {children}
    </div>
  );
}

/** A whole-number stepper; empty until stepped or typed (never pre-filled with a dose). */
export function Stepper({
  label,
  value,
  onChange,
  max,
  unit,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  max?: number;
  unit?: string;
}) {
  const set = (n: number) => onChange(Math.max(0, Math.min(max ?? Infinity, n)));
  const btn =
    "bg-tide-sunken hover:bg-ink-100 focus-visible:shadow-focus grid size-11 place-items-center rounded-full outline-none";
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={btn} aria-label={`${label} −1`} onClick={() => set((value ?? 0) - 1)}>
        <MinusIcon className="size-4" aria-hidden />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value ?? ""}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "");
          onChange(d === "" ? null : Math.min(max ?? Infinity, Number(d)));
        }}
        className="bg-card rounded-tide-field h-11 w-20 text-center tabular-nums shadow-[inset_0_0_0_1px_var(--color-ink-300)]"
      />
      <button type="button" className={btn} aria-label={`${label} +1`} onClick={() => set((value ?? 0) + 1)}>
        <PlusIcon className="size-4" aria-hidden />
      </button>
      {unit ? <span className="text-body-s text-muted-foreground">{unit}</span> : null}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13.5px] font-medium">{label}</span>
      {children}
    </div>
  );
}

export const inputCls =
  "bg-card rounded-tide-field h-11 w-full px-3 shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none focus-visible:shadow-focus";

type Result = { ok: true; id: string } | { ok: false; error: string };

/**
 * A centred dialog (EditorDialog) whose footer button runs one server action. A refusal stays in the dialog, in
 * words; success closes it and refreshes the page.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  sub,
  submit,
  blocked,
  run,
  wide,
  foot,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  sub?: string;
  submit?: string;
  /** Why the button cannot be pressed yet; null when it can. */
  blocked?: string | null;
  run?: () => Promise<Result>;
  wide?: boolean;
  foot?: ReactNode;
  children: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <EditorDialog open={open} onOpenChange={onOpenChange} width={wide ? "wide" : "medium"}>
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{title}</DialogTitle>
        {sub ? <p className="text-body-s text-ink-600">{sub}</p> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        {children}
        {error ? (
          <p role="alert" className="text-body-s text-ink-800">
            {error}
          </p>
        ) : null}
      </div>
      <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3">
        {foot ? <span className="text-caption text-muted-foreground mr-auto max-w-prose">{foot}</span> : null}
        <LabButton variant="quiet" onClick={() => onOpenChange(false)}>
          {run ? PRW.common.cancel : PRW.common.close}
        </LabButton>
        {run && submit ? (
          <LabButton
            variant="primary"
            busy={pending}
            disabledReason={blocked ?? null}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await run();
                if (!r.ok) return setError(r.error);
                onOpenChange(false);
                router.refresh();
              })
            }
          >
            {submit}
          </LabButton>
        ) : null}
      </div>
    </EditorDialog>
  );
}

/** A per-dialog idempotency key that survives re-renders and is renewed only when the dialog opens again. */
export function useClientKey(open: boolean) {
  const [k, setK] = useState(() => crypto.randomUUID());
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setK(crypto.randomUUID());
  }
  return k;
}
