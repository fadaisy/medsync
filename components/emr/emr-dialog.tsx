"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
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
import { cn } from "@/lib/utils";

/**
 * Every EMR pop-up: the house centred landscape card (EditorDialog, ADR 0161), never a sheet from
 * an edge. Title, optional description, a body that scrolls, optional footer, and a ✕ that comes
 * last in the DOM (placed top-right) so opening still focuses the first control in the body. Esc,
 * the ✕ and the backdrop close it; focus returns to the trigger. Motion: 150 ms, centred origin
 * (UI-BRIEF §5); reduced motion is the primitive's.
 *
 * `sheet` (clerking desk v2 on a phone, D-CM-05): below 640 px only, the same dialog sits on the
 * bottom edge with a grab handle, rises in 250 ms and closes on a downward swipe too. 640 px and
 * up it is the centred card, unchanged (ADR 0161).
 */

/** Bottom-anchored below 640 px; nothing changes above it. */
const SHEET =
  "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-[20px] max-sm:rounded-b-none max-sm:max-h-[calc(100dvh-50px)] max-sm:duration-250 max-sm:data-open:zoom-in-100 max-sm:data-closed:zoom-out-100 max-sm:data-open:slide-in-from-bottom-8 max-sm:data-closed:slide-out-to-bottom-8 max-sm:[&_input]:text-base max-sm:[&_textarea]:text-base";
const SHEET_FOOTER =
  "max-sm:bg-card max-sm:flex-row max-sm:items-center max-sm:gap-2.5 max-sm:px-4 max-sm:pt-3 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-sm:[&>*]:min-h-12 max-sm:[&>*:last-child]:flex-1";
export function EmrDialog({
  open,
  onOpenChange,
  title,
  kicker,
  description,
  trigger,
  footer,
  width = "medium",
  sheet,
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
  /** Below 640 px: a bottom sheet (`tall`: full height under the app bar). */
  sheet?: boolean | "tall";
  children: ReactNode;
}) {
  const startY = useRef<number | null>(null);
  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      width={width}
      trigger={trigger}
      className={cn(
        "ease-expo-out duration-100",
        sheet && SHEET,
        sheet === "tall" && "max-sm:h-[calc(100dvh-50px)]",
      )}
    >
      {sheet ? (
        <div
          aria-hidden
          className="flex shrink-0 justify-center pt-2 sm:hidden"
          onTouchStart={(e) => (startY.current = e.touches[0]?.clientY ?? null)}
          onTouchEnd={(e) => {
            const y = e.changedTouches[0]?.clientY;
            if (startY.current !== null && y !== undefined && y - startY.current > 60)
              onOpenChange(false);
            startY.current = null;
          }}
        >
          <span className="bg-border h-[5px] w-[38px] rounded-full" />
        </div>
      ) : null}
      <SheetHeader className={cn("pr-14", sheet && "max-sm:px-4 max-sm:pt-2 max-sm:pb-3")}>
        {kicker ? (
          <p className="text-caption text-muted-foreground tracking-[0.06em] uppercase">{kicker}</p>
        ) : null}
        <SheetTitle className="font-sans">{title}</SheetTitle>
        {description ? <SheetDescription>{description}</SheetDescription> : null}
      </SheetHeader>
      <SheetBody className={cn(sheet && "max-sm:px-4 max-sm:py-4")}>{children}</SheetBody>
      {footer ? <SheetFooter className={cn(sheet && SHEET_FOOTER)}>{footer}</SheetFooter> : null}
      <SheetClose
        render={
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Close panel"
            className={cn(
              "absolute top-4 right-4",
              sheet && "max-sm:bg-muted max-sm:top-5 max-sm:size-9 max-sm:rounded-full",
            )}
          />
        }
      >
        <XIcon className="size-4" />
      </SheetClose>
    </EditorDialog>
  );
}
