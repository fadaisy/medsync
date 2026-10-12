"use client";

import type { FormEvent, ReactNode } from "react";
import { useId, useState, useTransition } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * A centred form dialog (ADR 0161) opened by its own button, which takes focus back on close: the
 * fields, the server's refusal in words (amber, icon and word), Cancel and the one action. The save
 * returns `{ ok, error }`; success closes the dialog.
 */
export function FormDialog({
  label,
  title,
  description,
  submit,
  cancel,
  variant = "secondary",
  width = "medium",
  onSave,
  children,
}: {
  label: string;
  title: string;
  description?: ReactNode;
  submit: string;
  cancel: string;
  variant?: "primary" | "secondary" | "ghost";
  width?: "medium" | "wide";
  onSave: (data: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errorId = useId();
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await onSave(data);
      if (r.ok) setOpen(false);
      else setError(r.error);
    });
  };
  return (
    <EditorDialog
      width={width}
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null);
        setOpen(next);
      }}
      trigger={
        <DialogTrigger render={<Button variant={variant} className="min-h-11" />}>
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
          <p id={errorId} role="status" className="empty:hidden">
            {error ? (
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {error}
              </StatusWord>
            ) : null}
          </p>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={() => setOpen(false)}
          >
            {cancel}
          </Button>
          <Button type="submit" className="min-h-11" disabled={pending}>
            {submit}
          </Button>
        </SheetFooter>
      </form>
    </EditorDialog>
  );
}

/** A labelled field: the label names the control (Section 10). */
export function FormField({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const formText = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const SELECT_CLASS =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-md border px-2.5 outline-none";
export const TEXTAREA_CLASS =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-24 w-full rounded-md border px-2.5 py-2 outline-none";
