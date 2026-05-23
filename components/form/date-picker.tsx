"use client";

import type { DateRange } from "react-day-picker";
import * as React from "react";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * DatePicker — Popover + react-day-picker, with three modes:
 *
 *   <DatePicker mode="single"   value={date}        onValueChange={…} />
 *   <DatePicker mode="range"    value={dateRange}   onValueChange={…} />
 *   <DatePicker mode="datetime" value={dateAndTime} onValueChange={…} />
 *
 * Used in onboarding for: date of birth (single, dropdown captions),
 * license issue/expiry (single), hospital first-admit shift window
 * (range), preferred call window (datetime).
 *
 * The trigger renders as a button shaped like the Combobox trigger so
 * a row of inputs looks consistent. ARIA: button + popover dialog —
 * react-day-picker brings its own grid/listbox semantics.
 */

export type DatePickerMode = "single" | "range" | "datetime";

export interface DatePickerCommonProps {
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Earliest selectable date (inclusive). */
  fromDate?: Date;
  /** Latest selectable date (inclusive). */
  toDate?: Date;
  /** Show month/year dropdowns. Default true for single, false otherwise. */
  withDropdownCaption?: boolean;
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

interface SingleProps extends DatePickerCommonProps {
  mode: "single";
  value: Date | null;
  onValueChange: (value: Date | null) => void;
}

interface RangeProps extends DatePickerCommonProps {
  mode: "range";
  value: DateRange | null;
  onValueChange: (value: DateRange | null) => void;
}

interface DateTimeProps extends DatePickerCommonProps {
  mode: "datetime";
  value: Date | null;
  onValueChange: (value: Date | null) => void;
  /** Granularity for the time picker, in minutes. Default 15. */
  minuteStep?: number;
}

type DatePickerProps = SingleProps | RangeProps | DateTimeProps;

// ─── Formatting helpers ─────────────────────────────────────────────

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDay(d: Date | null | undefined) {
  return d ? dayFormat.format(d) : "";
}

function formatTime(d: Date | null | undefined) {
  if (!d) return "";
  return d.toTimeString().slice(0, 5);
}

function formatRange(range: DateRange | null | undefined) {
  if (!range) return "";
  if (range.from && range.to) {
    return `${formatDay(range.from)} → ${formatDay(range.to)}`;
  }
  if (range.from) return `${formatDay(range.from)} →`;
  return "";
}

function mergeDateAndTime(date: Date, hours: number, minutes: number) {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

// ─── Shared DayPicker styling ───────────────────────────────────────

const dayPickerClassNames = {
  root: "p-2.5",
  months: "flex gap-4",
  month: "flex flex-col gap-2",
  month_caption: "flex justify-center items-center h-9",
  caption_label: "text-[13px] font-medium text-foreground",
  nav: "absolute right-2.5 top-2.5 flex items-center gap-1",
  button_previous:
    "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500",
  button_next:
    "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500",
  chevron: "size-3.5",
  dropdowns: "flex items-center gap-1",
  dropdown_root: "relative",
  dropdown:
    "border-border bg-card hover:border-gray-300 dark:hover:border-gray-700 appearance-none rounded-md border px-2 py-1 text-[12px] font-medium text-foreground focus-visible:border-teal-500 focus-visible:shadow-focus outline-none",
  month_grid: "border-collapse",
  weekdays: "flex",
  weekday:
    "text-muted-foreground inline-flex w-8 items-center justify-center text-[11px] font-normal uppercase tracking-wide",
  weeks: "",
  week: "flex mt-0.5",
  day: "inline-flex size-8 items-center justify-center p-0 text-[12px]",
  day_button:
    "inline-flex size-8 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 transition-colors duration-100",
  today: "font-semibold text-teal-600 dark:text-teal-500",
  selected: "[&_button]:bg-teal-500 [&_button]:text-white [&_button]:hover:bg-teal-600",
  range_start: "[&_button]:bg-teal-500 [&_button]:text-white [&_button]:rounded-r-none",
  range_end: "[&_button]:bg-teal-500 [&_button]:text-white [&_button]:rounded-l-none",
  range_middle:
    "[&_button]:bg-teal-50 [&_button]:dark:bg-teal-500/10 [&_button]:text-foreground [&_button]:rounded-none [&_button]:hover:bg-teal-100 [&_button]:dark:hover:bg-teal-500/15",
  outside: "text-muted-foreground/40",
  disabled: "text-muted-foreground/30 cursor-not-allowed",
  hidden: "invisible",
} as const;

// ─── Trigger ────────────────────────────────────────────────────────

interface TriggerProps {
  id?: string;
  placeholder: string;
  display: string;
  disabled?: boolean;
  required?: boolean;
  triggerClassName?: string;
  icon?: React.ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

function Trigger({
  id,
  placeholder,
  display,
  disabled,
  required,
  triggerClassName,
  icon,
  ...ariaProps
}: TriggerProps) {
  return (
    <PopoverTrigger
      id={id}
      disabled={disabled}
      aria-required={required}
      aria-label={ariaProps["aria-label"]}
      aria-describedby={ariaProps["aria-describedby"]}
      aria-invalid={ariaProps["aria-invalid"]}
      className={cn(
        "border-border bg-background hover:border-gray-300",
        "flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-[13px]",
        "focus-visible:shadow-focus outline-none focus-visible:border-teal-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[popup-open]:border-teal-500",
        ariaProps["aria-invalid"] && "border-red-500 focus-visible:border-red-500",
        triggerClassName,
      )}
    >
      <span
        className={cn("truncate text-left", display ? "text-foreground" : "text-muted-foreground")}
      >
        {display || placeholder}
      </span>
      {icon ?? (
        <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" strokeWidth={1.75} />
      )}
    </PopoverTrigger>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function DatePicker(props: DatePickerProps) {
  const {
    id,
    name,
    placeholder,
    disabled,
    required,
    fromDate,
    toDate,
    className,
    triggerClassName,
    withDropdownCaption,
  } = props;

  const [open, setOpen] = React.useState(false);

  // All hooks above any early returns so React's hook order stays stable.
  const datetimeMinuteStep = props.mode === "datetime" ? (props.minuteStep ?? 15) : 15;
  const minuteOptions = React.useMemo(() => {
    const out: number[] = [];
    for (let m = 0; m < 60; m += datetimeMinuteStep) out.push(m);
    return out;
  }, [datetimeMinuteStep]);

  if (props.mode === "single") {
    const display = formatDay(props.value);
    const useDropdown = withDropdownCaption ?? true;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Trigger
          id={id}
          placeholder={placeholder ?? "Select date"}
          display={display}
          disabled={disabled}
          required={required}
          triggerClassName={triggerClassName}
          aria-label={props["aria-label"]}
          aria-describedby={props["aria-describedby"]}
          aria-invalid={props["aria-invalid"]}
        />
        <PopoverContent className={cn("w-auto", className)}>
          <DayPicker
            mode="single"
            selected={props.value ?? undefined}
            onSelect={(date) => {
              props.onValueChange(date ?? null);
              if (date) setOpen(false);
            }}
            startMonth={fromDate}
            endMonth={toDate}
            disabled={(d) => {
              if (fromDate && d < fromDate) return true;
              if (toDate && d > toDate) return true;
              return false;
            }}
            captionLayout={useDropdown ? "dropdown" : "label"}
            classNames={dayPickerClassNames}
            defaultMonth={props.value ?? undefined}
          />
        </PopoverContent>
        {name ? (
          <input
            type="hidden"
            name={name}
            value={props.value ? props.value.toISOString().slice(0, 10) : ""}
          />
        ) : null}
      </Popover>
    );
  }

  if (props.mode === "range") {
    const display = formatRange(props.value);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Trigger
          id={id}
          placeholder={placeholder ?? "Select range"}
          display={display}
          disabled={disabled}
          required={required}
          triggerClassName={triggerClassName}
          aria-label={props["aria-label"]}
          aria-describedby={props["aria-describedby"]}
          aria-invalid={props["aria-invalid"]}
        />
        <PopoverContent className={cn("w-auto", className)}>
          <DayPicker
            mode="range"
            selected={props.value ?? undefined}
            onSelect={(range) => {
              props.onValueChange(range ?? null);
            }}
            startMonth={fromDate}
            endMonth={toDate}
            disabled={(d) => {
              if (fromDate && d < fromDate) return true;
              if (toDate && d > toDate) return true;
              return false;
            }}
            captionLayout={withDropdownCaption ? "dropdown" : "label"}
            numberOfMonths={2}
            classNames={dayPickerClassNames}
            defaultMonth={props.value?.from ?? undefined}
          />
          <div className="border-border flex justify-end border-t px-2 py-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={!props.value?.from || !props.value?.to}
              className="inline-flex h-7 items-center rounded-md bg-teal-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-teal-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // mode === "datetime"
  // Capture onValueChange + value as typed locals so TypeScript's
  // discriminated-union narrowing survives into the inner closures
  // below (it doesn't, otherwise — the union collapses to `never`).
  const dt: Date | null = props.value;
  const onChange: (value: Date | null) => void = props.onValueChange;
  const display = dt ? `${formatDay(dt)} · ${formatTime(dt)}` : "";

  const hours = dt?.getHours() ?? 9;
  const minutes = dt?.getMinutes() ?? 0;

  function setDate(nextDate: Date) {
    onChange(mergeDateAndTime(nextDate, hours, minutes));
  }

  function setHours(nextHours: number) {
    const base = dt ?? new Date();
    onChange(mergeDateAndTime(base, nextHours, minutes));
  }

  function setMinutes(nextMinutes: number) {
    const base = dt ?? new Date();
    onChange(mergeDateAndTime(base, hours, nextMinutes));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Trigger
        id={id}
        placeholder={placeholder ?? "Select date and time"}
        display={display}
        disabled={disabled}
        required={required}
        triggerClassName={triggerClassName}
        aria-label={props["aria-label"]}
        aria-describedby={props["aria-describedby"]}
        aria-invalid={props["aria-invalid"]}
      />
      <PopoverContent className={cn("w-auto", className)}>
        <DayPicker
          mode="single"
          selected={dt ?? undefined}
          onSelect={(date) => {
            if (date) setDate(date);
          }}
          startMonth={fromDate}
          endMonth={toDate}
          disabled={(d) => {
            if (fromDate && d < fromDate) return true;
            if (toDate && d > toDate) return true;
            return false;
          }}
          captionLayout={(withDropdownCaption ?? true) ? "dropdown" : "label"}
          classNames={dayPickerClassNames}
          defaultMonth={dt ?? undefined}
        />
        <div className="border-border flex items-center gap-2 border-t px-2.5 py-2">
          <ClockIcon className="text-muted-foreground size-3.5" strokeWidth={1.75} />
          <select
            aria-label="Hours"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="border-border bg-card text-foreground focus-visible:shadow-focus appearance-none rounded-md border px-2 py-1 text-[12px] outline-none hover:border-gray-300 focus-visible:border-teal-500 dark:hover:border-gray-700"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-[12px]">:</span>
          <select
            aria-label="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="border-border bg-card text-foreground focus-visible:shadow-focus appearance-none rounded-md border px-2 py-1 text-[12px] outline-none hover:border-gray-300 focus-visible:border-teal-500 dark:hover:border-gray-700"
          >
            {minuteOptions.map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={!dt}
            className="inline-flex h-7 items-center rounded-md bg-teal-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-teal-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </PopoverContent>
      {name ? <input type="hidden" name={name} value={dt ? dt.toISOString() : ""} /> : null}
    </Popover>
  );
}
