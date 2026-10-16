"use client";

import type { ReactNode } from "react";

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

/** Shared by the lab's Phase 3 forms (stock, equipment). */
export const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-sm border px-2 outline-none sm:min-h-9";
export const inputClass = "min-h-11 sm:min-h-9";
export const num = (s: string) => (s.trim() === "" ? null : Number(s));
export const newKey = () => `lab3:${crypto.randomUUID()}`;

/** One centred landscape pop-up (ADR 0161): header, body, footer with Cancel and the action. */
export function Pop({
  label,
  title,
  lede,
  width = "medium",
  variant = "secondary",
  open,
  setOpen,
  action,
  children,
  sr,
}: {
  label: string;
  title: string;
  lede?: string;
  width?: "medium" | "wide";
  variant?: "primary" | "secondary" | "ghost";
  open: boolean;
  setOpen: (o: boolean) => void;
  action?: ReactNode;
  children: ReactNode;
  sr?: string;
}) {
  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      width={width}
      trigger={
        <DialogTrigger render={<Button variant={variant} className="min-h-11 w-fit sm:min-h-8" />}>
          {label}
          {sr ? <span className="sr-only"> {sr}</span> : null}
        </DialogTrigger>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {lede ? <SheetDescription>{lede}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">{children}</SheetBody>
        <SheetFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {action}
        </SheetFooter>
      </div>
    </EditorDialog>
  );
}
