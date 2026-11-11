"use client";

import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * The pharmacy's one form dialog (Workspace v2 GATE A D-PW-10; it replaces three copies: the review's ReviewDialog,
 * the wards' ActionDialog and the store's StoreDialog, which now only name their words). A centred EditorDialog
 * (ADR 0161): its button, its form, the refusal in words, Cancel and the one action. Targets are 44 px.
 */
export const TARGET = "min-h-11";
export const newKey = () => crypto.randomUUID();

export function Refusal({ error, id }: { error: string | null; id?: string }) {
  return (
    <p id={id} role="status" className="empty:hidden">
      {error ? (
        <StatusWord tone="caution" glyph={TriangleAlertIcon}>
          {error}
        </StatusWord>
      ) : null}
    </p>
  );
}

export interface PharmacyDialogProps {
  label: string;
  title: string;
  description?: ReactNode;
  submit: string;
  variant?: "primary" | "secondary" | "ghost";
  width?: "medium" | "wide" | "xl";
  onOpen?: () => void;
  /** "stay" keeps the dialog open (a count's second step). */
  onSave: (key: string, data: FormData) => Promise<ActionResult<unknown> | "stay">;
  /** The work is finished: the action goes and Cancel reads `doneLabel`. */
  done?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function PharmacyDialog({
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
  cancelLabel,
  doneLabel = cancelLabel,
  refresh = true,
  children,
}: PharmacyDialogProps & {
  cancelLabel: string;
  doneLabel?: string;
  /** Refresh the page after a save (the wards' dialogs revalidate themselves and do not). */
  refresh?: boolean;
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
      if (refresh) router.refresh();
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
          <Refusal id={errorId} error={error} />
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            onClick={() => setOpen(false)}
          >
            {done ? doneLabel : cancelLabel}
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
