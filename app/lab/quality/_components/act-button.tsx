"use client";

import type { ComponentProps } from "react";

import { LabButton } from "../../_components/v2/button";

/**
 * The lab button for the quality, stock and equipment forms, which render both inside the Lab Workspace v2 shell
 * and on the old pages (flag off) until Step 11. The lagoon fill exists only inside the shell, so a primary
 * button falls back to the house teal outside it. Busy and disabled-with-a-reason are LabButton's own.
 */
export function ActButton({ style, ...props }: ComponentProps<typeof LabButton>) {
  const fill = props.variant === "primary" && !props.disabledReason;
  return (
    <LabButton
      {...props}
      style={
        fill
          ? {
              backgroundColor: "var(--tide-lagoon, var(--color-primary))",
              color: "var(--tide-on-lagoon, var(--color-primary-foreground))",
              ...style,
            }
          : style
      }
    />
  );
}
