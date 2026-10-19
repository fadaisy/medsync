"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fill, LABWS2 } from "@/content/lab-workspace-v2";
import {
  dateKey,
  dayWords,
  formatTime,
  localValue,
  monthGrid,
  monthTitle,
  parseTime,
  shiftMonth,
  splitValue,
  WEEK_HEAD,
} from "@/lib/lab/field-kit";
import { cn } from "@/lib/utils";

/**
 * Lab Workspace v2 field kit, the parts with state (prompt 5.12): the date-time field, the date field, the
 * month calendar, pick-from-a-list (combobox, or chips for four or fewer), and the number stepper. Each keeps
 * the value string a native control produced and posts it under `name` in a hidden input, so the forms and
 * actions around it are unchanged (Law 1).
 */

const K = LABWS2.kit;
const FIELD =
  "bg-card text-foreground h-9 rounded-tide-field border border-input px-3 text-body-s outline-none focus-visible:border-ring focus-visible:shadow-focus aria-[invalid=true]:border-amber-600";

/** The server's clock, carried into the browser: `now` is the server time when the page rendered. */
function useServerNow(now?: string) {
  const [offset] = useState(() => (now ? Date.parse(now) - Date.now() : 0));
  return () => new Date(Date.now() + offset);
}

function Label({ id, children, hint }: { id: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span id={id} className="text-label text-foreground">
        {children}
      </span>
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
    </span>
  );
}

/** A month calendar of date keys. Days after `max` are not offered. */
export function MonthCalendar({
  value,
  todayKey,
  max,
  min,
  onPick,
}: {
  value: string;
  todayKey: string;
  max?: string;
  min?: string;
  onPick: (key: string) => void;
}) {
  const start = (value || todayKey).split("-").map(Number);
  const [ym, setYm] = useState({ y: start[0]!, mo: start[1]! });
  const weeks = monthGrid(ym.y, ym.mo);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={K.prevMonth}
          className="hover:bg-muted grid size-8 place-items-center rounded-full"
          onClick={() => setYm(shiftMonth(ym.y, ym.mo, -1))}
        >
          <ChevronLeftIcon aria-hidden className="size-4" />
        </button>
        <span className="text-label text-foreground" aria-live="polite">
          {monthTitle(ym.y, ym.mo)}
        </span>
        <button
          type="button"
          aria-label={K.nextMonth}
          className="hover:bg-muted grid size-8 place-items-center rounded-full"
          onClick={() => setYm(shiftMonth(ym.y, ym.mo, 1))}
        >
          <ChevronRightIcon aria-hidden className="size-4" />
        </button>
      </div>
      <table className="w-full border-collapse text-center" role="grid">
        <thead>
          <tr>
            {WEEK_HEAD.map((d) => (
              <th
                key={d}
                scope="col"
                className="text-caption text-muted-foreground pb-1 font-medium"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={i}>
              {w.map((k, j) => {
                if (!k) return <td key={j} />;
                const off = (max && k > max) || (min && k < min);
                const on = k === value;
                return (
                  <td key={k} className="p-0.5">
                    <button
                      type="button"
                      disabled={!!off}
                      aria-pressed={on}
                      aria-label={dayWords(k, todayKey)}
                      onClick={() => onPick(k)}
                      className={cn(
                        "text-body-s size-8 rounded-full tabular-nums",
                        on ? "bg-tide-lagoon text-tide-on-lagoon font-semibold" : "hover:bg-muted",
                        k === todayKey && !on && "shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
                        off && "text-ink-400 hover:bg-transparent",
                      )}
                    >
                      {Number(k.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Date and time in one field (5.12): the day in words with a calendar, a typed 24-hour time that accepts 0810,
 * 8.10 or 8:10 and shows what it read, and quick picks. Value: "YYYY-MM-DDTHH:mm" (as `datetime-local`).
 * `quick` off for paper-form times, which always come from the form (5.14).
 */
export function DateTimeField({
  label,
  hint,
  name,
  value,
  defaultValue = "",
  onChange,
  now,
  quick = true,
  allowFuture = false,
  min,
  minLabel,
  error,
  required,
  className,
}: {
  label: string;
  hint?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  /** Server time at render (ISO). Quick picks and "today" use it, not the browser's clock. */
  now?: string;
  quick?: boolean;
  allowFuture?: boolean;
  /** Earliest allowed value ("YYYY-MM-DDTHH:mm"); earlier says `endsBefore`. */
  min?: string;
  minLabel?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
}) {
  const id = useId();
  const serverNow = useServerNow(now);
  const [inner, setInner] = useState(defaultValue);
  const v = value ?? inner;
  const set = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };
  const { day, time } = splitValue(v);
  const [typed, setTyped] = useState(time);
  const [seen, setSeen] = useState(time);
  const [open, setOpen] = useState(false);
  // A value set from outside (a quick pick, the calendar, the parent) replaces what was typed.
  if (seen !== time) {
    setSeen(time);
    setTyped(time);
  }
  const todayKey = dateKey(serverNow());
  const parsed = typed ? parseTime(typed) : null;
  const nowLocal = localValue(serverNow());
  const own =
    typed && !parsed
      ? K.timeInvalid
      : v && min && v < min
        ? fill(K.endsBefore, { time: minLabel ?? splitValue(min).time })
        : v && !allowFuture && v > nowLocal
          ? fill(K.inFuture, { time: splitValue(nowLocal).time })
          : !day && typed
            ? K.dayMissing
            : null;
  const shown = error ?? own;
  const commitTime = (t: string) => {
    const p = parseTime(t);
    if (p) set(`${day || todayKey}T${formatTime(p)}`);
    else if (!t) set("");
  };
  const pickAgo = (mins: number) =>
    set(localValue(new Date(serverNow().getTime() - mins * 60_000)));

  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      role="group"
      aria-labelledby={`${id}-l`}
    >
      <Label id={`${id}-l`} hint={hint}>
        {label}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            className={cn(FIELD, "inline-flex min-w-[11.5rem] items-center gap-2 text-left")}
            aria-label={`${label}: ${day ? dayWords(day, todayKey) : K.pickDay}`}
          >
            <CalendarIcon aria-hidden className="text-muted-foreground size-4" />
            <span className={cn(!day && "text-muted-foreground")}>
              {day ? dayWords(day, todayKey) : K.pickDay}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <MonthCalendar
              value={day}
              todayKey={todayKey}
              max={allowFuture ? undefined : todayKey}
              onPick={(k) => {
                set(`${k}T${time || (parsed ? formatTime(parsed) : "00:00")}`);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <input
          aria-label={`${label}, ${K.timeLabel}`}
          aria-describedby={`${id}-t`}
          aria-invalid={!!(typed && !parsed)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="08:10"
          required={required}
          className={cn(FIELD, "w-[5.5rem] text-center tabular-nums")}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={(e) => commitTime(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTime(typed);
            }
          }}
        />
        {quick ? (
          <span className="flex flex-wrap gap-1">
            <QuickChip onClick={() => pickAgo(0)}>{K.quick.now}</QuickChip>
            <QuickChip onClick={() => pickAgo(15)}>{K.quick.min15}</QuickChip>
            <QuickChip onClick={() => pickAgo(60)}>{K.quick.hour1}</QuickChip>
            <QuickChip
              onClick={() => {
                const y = new Date(serverNow().getTime() - 86_400_000);
                set(`${dateKey(y)}T${time || "08:00"}`);
              }}
            >
              {K.quick.yesterday}
            </QuickChip>
            <QuickChip onClick={() => setOpen(true)}>{K.quick.pick}</QuickChip>
          </span>
        ) : null}
      </div>
      <span
        id={`${id}-t`}
        className={cn("text-caption", shown ? "text-amber-800" : "text-muted-foreground")}
        role={shown ? "status" : undefined}
      >
        {shown ??
          (parsed && typed !== formatTime(parsed)
            ? fill(K.timeParsed, { time: formatTime(parsed) })
            : K.timeHint)}
      </span>
      {name ? <input type="hidden" name={name} value={v} /> : null}
    </div>
  );
}

function QuickChip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-caption bg-tide-sunken text-ink-700 hover:bg-ink-200 focus-visible:shadow-focus h-7 rounded-full px-2.5 font-medium outline-none"
    >
      {children}
    </button>
  );
}

/** A day only (5.12): the day in words and the month calendar. Value "YYYY-MM-DD" (as `type="date"`). */
export function DateField({
  label,
  hint,
  name,
  value,
  defaultValue = "",
  onChange,
  now,
  allowFuture = false,
  min,
  required,
  hideLabel,
  className,
}: {
  label: string;
  hint?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  now?: string;
  allowFuture?: boolean;
  min?: string;
  required?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  const serverNow = useServerNow(now);
  const [inner, setInner] = useState(defaultValue);
  const v = value ?? inner;
  const [open, setOpen] = useState(false);
  const todayKey = dateKey(serverNow());
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {hideLabel ? null : (
        <Label id={`${id}-l`} hint={hint}>
          {label}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(FIELD, "inline-flex w-fit min-w-[11.5rem] items-center gap-2 text-left")}
          aria-label={`${label}: ${v ? dayWords(v, todayKey) : K.pickDay}`}
        >
          <CalendarIcon aria-hidden className="text-muted-foreground size-4" />
          <span className={cn(!v && "text-muted-foreground")}>
            {v ? dayWords(v, todayKey) : K.pickDay}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <MonthCalendar
            value={v}
            todayKey={todayKey}
            max={allowFuture ? undefined : todayKey}
            min={min}
            onPick={(k) => {
              if (value === undefined) setInner(k);
              onChange?.(k);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={v} required={required} /> : null}
    </div>
  );
}

export interface PickOption {
  value: string;
  label: string;
  /** The secondary line: unit, section, availability (5.12). */
  detail?: string;
  /** Shown but not choosable, with `detail` saying why. */
  unavailable?: boolean;
}

/**
 * Pick from a list by name (5.12). Four or fewer choices render as chips; more as a searchable combobox
 * (ARIA 1.2 combobox with a listbox; ↑↓, Enter, Esc). The value posts under `name`.
 */
export function PickField({
  label,
  hint,
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = K.choose,
  forceList,
  hideLabel,
  required,
  className,
}: {
  label: string;
  hint?: string;
  name?: string;
  options: readonly PickOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  forceList?: boolean;
  hideLabel?: boolean;
  required?: boolean;
  className?: string;
}) {
  const id = useId();
  const [inner, setInner] = useState(defaultValue);
  const v = value ?? inner;
  const set = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };
  const hidden = name ? <input type="hidden" name={name} value={v} required={required} /> : null;
  if (options.length <= 4 && !forceList)
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {hideLabel ? null : (
          <Label id={`${id}-l`} hint={hint}>
            {label}
          </Label>
        )}
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={v === o.value}
              disabled={o.unavailable}
              onClick={() => set(o.value)}
              className={cn(
                "text-body-s focus-visible:shadow-focus flex min-h-9 flex-col items-start justify-center rounded-full px-3.5 py-1 text-left outline-none",
                v === o.value
                  ? "bg-tide-navy-900 text-tide-on-band font-medium"
                  : "bg-card text-foreground hover:bg-ink-50 shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
                o.unavailable && "text-ink-500",
              )}
            >
              <span>{o.label}</span>
              {o.detail ? (
                <span
                  className={cn(
                    "text-caption",
                    v === o.value ? "text-tide-on-band-2" : "text-muted-foreground",
                  )}
                >
                  {o.detail}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {hidden}
      </div>
    );
  return (
    <Combobox
      id={id}
      label={label}
      hint={hint}
      options={options}
      value={v}
      onChange={set}
      placeholder={placeholder}
      hideLabel={hideLabel}
      className={className}
    >
      {hidden}
    </Combobox>
  );
}

function Combobox({
  id,
  label,
  hint,
  options,
  value,
  onChange,
  placeholder,
  hideLabel,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  options: readonly PickOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const chosen = options.find((o) => o.value === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((o) => `${o.label} ${o.detail ?? ""}`.toLowerCase().includes(q))
      : options;
  }, [options, query]);
  const choose = (o: PickOption | undefined) => {
    if (!o || o.unavailable) return;
    onChange(o.value);
    setQuery("");
    setOpen(false);
  };
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div className={cn("relative flex flex-col gap-1.5", className)}>
      {hideLabel ? null : (
        <Label id={`${id}-l`} hint={hint}>
          {label}
        </Label>
      )}
      <div className="relative">
        <input
          role="combobox"
          aria-label={hideLabel ? label : undefined}
          aria-labelledby={hideLabel ? undefined : `${id}-l`}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-o${active}` : undefined}
          autoComplete="off"
          className={cn(FIELD, "w-full pr-9")}
          placeholder={
            chosen ? `${chosen.label}${chosen.detail ? ` · ${chosen.detail}` : ""}` : placeholder
          }
          value={open ? query : chosen ? chosen.label : ""}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              choose(shown[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        />
      </div>
      {open ? (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="bg-popover shadow-tide-float rounded-tide-row absolute top-full z-50 mt-1 max-h-72 w-full min-w-[16rem] overflow-auto p-1"
        >
          {shown.length === 0 ? (
            <li className="text-body-s text-muted-foreground px-3 py-2">{K.noMatch}</li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-o${i}`}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.unavailable || undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer flex-col rounded-[10px] px-3 py-1.5",
                  i === active && "bg-muted",
                  o.value === value && "font-medium",
                  o.unavailable && "cursor-default",
                )}
              >
                <span
                  className={cn("text-body-s", o.unavailable ? "text-ink-500" : "text-foreground")}
                >
                  {o.label}
                </span>
                {o.detail ? (
                  <span className="text-caption text-muted-foreground">{o.detail}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
      {children}
    </div>
  );
}

/** A count with − and + (5.12), with the effect stated under it ("Forms DT-0418 to DT-0427 will print"). */
export function NumberStepper({
  label,
  name,
  value,
  defaultValue = 1,
  onChange,
  min = 0,
  max = 999,
  effect,
  className,
}: {
  label: string;
  name?: string;
  value?: number;
  defaultValue?: number;
  onChange?: (n: number) => void;
  min?: number;
  max?: number;
  effect?: (n: number) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const [inner, setInner] = useState(defaultValue);
  const n = value ?? inner;
  const set = (x: number) => {
    const c = Math.max(min, Math.min(max, Number.isFinite(x) ? Math.round(x) : min));
    if (value === undefined) setInner(c);
    onChange?.(c);
  };
  const btn =
    "bg-card text-foreground grid size-9 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-ink-300)] hover:bg-ink-50 focus-visible:shadow-focus outline-none disabled:text-ink-400";
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={`${id}-l`} className="text-label text-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          aria-label={K.decrease}
          disabled={n <= min}
          onClick={() => set(n - 1)}
        >
          <MinusIcon aria-hidden className="size-4" />
        </button>
        <input
          aria-labelledby={`${id}-l`}
          aria-describedby={effect ? `${id}-e` : undefined}
          inputMode="numeric"
          className={cn(FIELD, "w-16 text-center tabular-nums")}
          value={n}
          onChange={(e) => set(Number(e.target.value))}
        />
        <button
          type="button"
          className={btn}
          aria-label={K.increase}
          disabled={n >= max}
          onClick={() => set(n + 1)}
        >
          <PlusIcon aria-hidden className="size-4" />
        </button>
      </div>
      {effect ? (
        <span id={`${id}-e`} className="text-caption text-muted-foreground" aria-live="polite">
          {effect(n)}
        </span>
      ) : null}
      {name ? <input type="hidden" name={name} value={n} /> : null}
    </div>
  );
}
