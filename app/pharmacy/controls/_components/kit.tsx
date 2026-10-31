"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { CTL } from "@/content/pharmacy-rework-controls";
import { cn } from "@/lib/utils";

/** The Controls dialogs' shared parts: a tap chip, a stepper, the dialog frame, and an action runner. */
export function Choice({
  on,
  onClick,
  children,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-tide-row min-h-11 px-3 py-2 text-left text-[13.5px] sm:min-h-9",
        on ? "bg-tide-lagoon-tint font-semibold" : "bg-card shadow-tide-card",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13.5px] font-medium">{label}</span>
      {children}
    </div>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/** A whole-number stepper (no typing needed; typing still works). */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  label,
}: {
  value: number | null;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  label: string;
}) {
  const v = value ?? 0;
  const btn = "bg-card shadow-tide-card size-11 rounded-full text-[18px] sm:size-9";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label={`${label} −`} className={btn} onClick={() => onChange(Math.max(min, v - step))}>
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= min) onChange(n);
        }}
        className="bg-card shadow-tide-card h-11 w-16 rounded-full text-center text-[15px] tabular-nums sm:h-9"
      />
      <button type="button" aria-label={`${label} +`} className={btn} onClick={() => onChange(v + step)}>
        +
      </button>
    </div>
  );
}

export function Dlg({
  open,
  onOpenChange,
  title,
  sub,
  width = "medium",
  error,
  primary,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  sub?: ReactNode;
  width?: "wide" | "medium";
  error?: string | null;
  primary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <EditorDialog open={open} onOpenChange={onOpenChange} width={width}>
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
        <LabButton variant="quiet" onClick={() => onOpenChange(false)}>
          {CTL.common.cancel}
        </LabButton>
        {primary}
      </div>
    </EditorDialog>
  );
}

type Res = { ok: true } | { ok: false; error: string };

/** Run an action; on success refresh the page and call `done`, else keep the words. */
export function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Res>, done?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn().catch(() => ({ ok: false as const, error: CTL.common.failed }));
      if (!r.ok) return setError(r.error);
      done?.();
      router.refresh();
    });
  return { pending, error, setError, run };
}

export const newKey = () => crypto.randomUUID();
