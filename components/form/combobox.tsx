"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Combobox — searchable single-select.
 *
 * MedSync onboarding default for any list a user must pick one item
 * from but the list is long enough that scrolling is unusable on
 * mobile (>~15 options). Districts, hospitals, councils, cadres,
 * roles, specialties — all use this.
 *
 * Built on Base UI Combobox so ARIA combobox pattern + keyboard nav
 * (arrows, Enter, Esc, type-to-filter) are handled correctly.
 *
 * API:
 *   <Combobox
 *     items={[{value, label, ...}]}
 *     value={selected}
 *     onValueChange={setSelected}
 *     placeholder="Search…"
 *     disabled={false}
 *     id="district"
 *     name="district"
 *   />
 *
 * The `items` array accepts any object with `value` and `label`;
 * additional fields (e.g. `description`) are surfaced via `renderItem`.
 */

export interface ComboboxItem {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface ComboboxProps {
  items: ReadonlyArray<ComboboxItem>;
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function Combobox({
  items,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  disabled,
  id,
  name,
  required,
  className,
  triggerClassName,
  ...ariaProps
}: ComboboxProps) {
  const selectedLabel = React.useMemo(
    () => items.find((it) => it.value === value)?.label ?? null,
    [items, value],
  );

  return (
    <ComboboxPrimitive.Root
      items={items.map((it) => it.value)}
      value={value ?? ""}
      onValueChange={(next) => {
        const nextStr = typeof next === "string" ? next : "";
        onValueChange(nextStr === "" ? null : nextStr);
      }}
      disabled={disabled}
    >
      <ComboboxPrimitive.Trigger
        id={id}
        aria-required={required}
        {...ariaProps}
        className={cn(
          "border-border bg-background hover:border-gray-300",
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-[13px]",
          "focus-visible:shadow-focus outline-none focus-visible:border-teal-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[popup-open]:border-teal-500",
          triggerClassName,
        )}
      >
        <span
          className={cn(
            "truncate text-left",
            selectedLabel ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {selectedLabel ?? placeholder}
        </span>
        <ChevronDownIcon
          className="text-muted-foreground size-3.5 shrink-0 transition-transform duration-150 data-[popup-open]:rotate-180"
          strokeWidth={1.75}
        />
      </ComboboxPrimitive.Trigger>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={6} className="z-50">
          <ComboboxPrimitive.Popup
            className={cn(
              "border-border bg-popover text-popover-foreground shadow-popover",
              "flex max-h-[280px] w-[var(--anchor-width)] flex-col rounded-lg border outline-none",
              "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
              "transition-opacity duration-100 ease-out motion-reduce:transition-none",
              className,
            )}
          >
            <div className="border-border flex items-center gap-2 border-b px-2.5 py-2">
              <SearchIcon className="text-muted-foreground size-3.5" strokeWidth={1.75} />
              <ComboboxPrimitive.Input
                placeholder={searchPlaceholder}
                className="text-foreground placeholder:text-muted-foreground/70 flex-1 bg-transparent text-[13px] outline-none"
              />
            </div>

            <ComboboxPrimitive.Empty className="text-muted-foreground px-3 py-4 text-center text-[12px] italic">
              {emptyMessage}
            </ComboboxPrimitive.Empty>

            <ComboboxPrimitive.List className="flex flex-col overflow-y-auto p-1">
              {items.map((item) => (
                <ComboboxPrimitive.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className={cn(
                    "flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 text-[13px]",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                    "data-[disabled]:opacity-50",
                    "outline-none",
                  )}
                >
                  <CheckIcon
                    className={cn(
                      "text-primary mt-0.5 size-3.5 shrink-0",
                      "opacity-0 data-[selected]:opacity-100",
                    )}
                    strokeWidth={2}
                  />
                  <div className="flex flex-col">
                    <span className="text-foreground">{item.label}</span>
                    {item.description ? (
                      <span className="text-muted-foreground text-[11px]">{item.description}</span>
                    ) : null}
                  </div>
                </ComboboxPrimitive.Item>
              ))}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
      {/* Own the form-submission value rather than relying on Base UI's
       * internal hidden input, which became unreliable inside multi-step
       * forms where some steps are CSS-hidden (caused "Pick a council"
       * after step 2 in /signup/clinical even though the user had
       * selected one). */}
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
    </ComboboxPrimitive.Root>
  );
}
