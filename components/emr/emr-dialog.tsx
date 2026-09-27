"use client";

import type { ReactNode } from "react";
import { XIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import {
  SheetBody,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Every EMR pop-up: the house centred landscape card (EditorDialog, ADR 0161), never a sheet from
 * an edge. Title, optional description, a body that scrolls, optional footer, and a ✕ that comes
 * last in the DOM (placed top-right) so opening still focuses the first control in the body. Esc,
 * the ✕ and the backdrop close it; focus returns to the trigger. Motion: 150 ms, centred origin
 * (UI-BRIEF §5); reduced motion is the primitive's.
 */
export function EmrDialog({
  open,
  onOpenChange,
  title,
  kicker,
  description,
  trigger,
  footer,
  width = "medium",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** A small line above the title ("Review of systems · Cardiovascular"); not part of the name. */
  kicker?: ReactNode;
  description?: ReactNode;
  trigger?: ReactNode;
  footer?: ReactNode;
  width?: "wide" | "medium";
  children: ReactNode;
}) {
  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      width={width}
      trigger={trigger}
      className="ease-expo-out duration-100"
    >
      <SheetHeader className="pr-14">
        {kicker ? (
          <p className="text-caption text-muted-foreground tracking-[0.06em] uppercase">{kicker}</p>
        ) : null}
        <SheetTitle className="font-sans">{title}</SheetTitle>
        {description ? <SheetDescription>{description}</SheetDescription> : null}
      </SheetHeader>
      <SheetBody>{children}</SheetBody>
      {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      <SheetClose
        render={
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Close panel"
            className="absolute top-4 right-4"
          />
        }
      >
        <XIcon className="size-4" />
      </SheetClose>
    </EditorDialog>
  );
}
