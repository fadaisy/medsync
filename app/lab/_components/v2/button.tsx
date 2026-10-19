"use client";

import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

import { Button as UiButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The lab's button (prompt 5.12). `primary` is the lagoon fill with navy text, one per card or panel (Law 9);
 * `secondary` is outlined; `text` is a link-weight button. There is no separate `disabled` prop: a button is
 * disabled exactly when it has a `disabledReason`, and the reason is printed beside it and read with it
 * (`aria-describedby`). So a disabled button without a reason cannot be written (D-UI-10).
 */
export type LabButtonVariant = "primary" | "secondary" | "text" | "quiet";

const V: Record<LabButtonVariant, string> = {
  primary:
    "bg-tide-lagoon text-tide-on-lagoon border-transparent shadow-none hover:bg-tide-lagoon-pressed active:bg-tide-lagoon-pressed font-semibold",
  secondary: "bg-card text-foreground border-ink-300 shadow-none hover:bg-ink-50 active:bg-ink-100",
  text: "bg-transparent text-primary border-transparent shadow-none hover:bg-ink-100 px-2",
  quiet:
    "bg-transparent text-ink-600 border-transparent shadow-none hover:bg-ink-100 hover:text-foreground",
};

export function LabButton({
  variant = "secondary",
  size = "md",
  disabledReason,
  busy,
  reasonPlacement = "inline",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof UiButton>, "disabled" | "variant" | "size"> & {
  variant?: LabButtonVariant;
  size?: "sm" | "md";
  /** Why the button cannot be pressed now. Present = disabled, always shown. */
  disabledReason?: string | null;
  /** An action in flight: disabled without a reason line (the label says it). */
  busy?: boolean;
  /** "inline" puts the reason beside the button, "below" under it. */
  reasonPlacement?: "inline" | "below";
  children: ReactNode;
}) {
  const id = useId();
  const blocked = !!disabledReason;
  const button = (
    <UiButton
      {...props}
      variant="secondary"
      disabled={blocked || !!busy}
      aria-describedby={blocked ? `${id}-why` : props["aria-describedby"]}
      className={cn(
        V[variant],
        size === "md"
          ? "h-9 rounded-full px-4 text-[13.5px]"
          : "h-[30px] rounded-full px-3 text-[13px]",
        "disabled:opacity-100",
        blocked && variant === "primary" && "bg-tide-sunken text-ink-600",
        blocked && variant !== "primary" && "text-ink-500",
        className,
      )}
    >
      {children}
    </UiButton>
  );
  if (!blocked) return button;
  return (
    <span
      className={cn(
        "inline-flex max-w-full gap-x-3 gap-y-1",
        reasonPlacement === "below" ? "flex-col items-start" : "flex-wrap items-center",
      )}
    >
      {button}
      <span id={`${id}-why`} className="text-caption text-muted-foreground max-w-[42ch]">
        {disabledReason}
      </span>
    </span>
  );
}
