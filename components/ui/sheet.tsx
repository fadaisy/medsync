"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sheet — right-anchored slide-out panel.
 *
 * Built on base-ui Dialog primitives so it inherits the focus trap,
 * Esc-to-close, and aria-modal semantics. The visual treatment is a
 * panel that slides in from the right (motion-reduce: instant) over
 * a dimmed overlay. Use for row → detail patterns where the operator
 * needs to inspect/act without losing their place in the underlying
 * list.
 *
 * Compose like Dialog:
 *   <Sheet open={...} onOpenChange={...}>
 *     <SheetContent side="right" widthClassName="w-[480px]">
 *       <SheetHeader>
 *         <SheetTitle>…</SheetTitle>
 *         <SheetDescription>…</SheetDescription>
 *       </SheetHeader>
 *       <SheetBody>…</SheetBody>
 *       <SheetFooter>…</SheetFooter>
 *     </SheetContent>
 *   </Sheet>
 */

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-[1px]",
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        "ease-expo-out duration-200",
        "motion-reduce:animate-none motion-reduce:duration-0",
        className,
      )}
      {...props}
    />
  );
}

interface SheetContentProps extends DialogPrimitive.Popup.Props {
  side?: "right" | "left";
  /** Width class — e.g. "w-[480px]" or "sm:max-w-md w-full". */
  widthClassName?: string;
  showCloseButton?: boolean;
}

function SheetContent({
  className,
  children,
  side = "right",
  widthClassName = "w-full sm:max-w-[560px]",
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  const sideClasses =
    side === "right"
      ? "right-0 data-open:slide-in-from-right data-closed:slide-out-to-right border-l"
      : "left-0 data-open:slide-in-from-left data-closed:slide-out-to-left border-r";

  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          // Position: full-height anchored to one edge
          "bg-background text-foreground border-border fixed inset-y-0 z-50 flex flex-col shadow-2xl outline-none",
          sideClasses,
          widthClassName,
          // Motion: slide + fade, expo-out, reduced-motion safe
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          "ease-expo-out duration-250",
          "motion-reduce:animate-none motion-reduce:duration-0",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            render={
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Close panel"
                className="absolute top-3 right-3"
              />
            }
          >
            <XIcon className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("border-border flex flex-col gap-1.5 border-b px-6 py-5", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-display text-foreground text-[18px] leading-tight font-medium tracking-[-0.01em]",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-[13px] leading-normal", className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("flex-1 overflow-y-auto px-6 py-5", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "border-border bg-muted/30 flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
};
