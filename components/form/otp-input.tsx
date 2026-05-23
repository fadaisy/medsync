"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * OtpInput — N-box one-time-code input. Auto-advances on type, falls
 * back on backspace, accepts paste of the whole code.
 *
 * Used in phone/email verification during onboarding. Default length
 * 6 (matches Twilio Verify / Supabase Auth defaults). Numeric-only by
 * default — set `pattern="alphanumeric"` if you ever need that variant.
 *
 * One real <input> per box: visible cursor, native autofill on iOS for
 * SMS codes, no glasses-pretending wrappers.
 */

interface OtpInputProps {
  length?: number;
  value: string;
  onValueChange: (value: string) => void;
  /** Fired when the user fills the last box. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  pattern?: "numeric" | "alphanumeric";
  name?: string;
  /** Marks the whole group as invalid (e.g. on failed verification). */
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

const NUMERIC = /^[0-9]$/;
const ALPHANUM = /^[A-Za-z0-9]$/;

export function OtpInput({
  length = 6,
  value,
  onValueChange,
  onComplete,
  disabled,
  autoFocus,
  pattern = "numeric",
  name,
  className,
  ...ariaProps
}: OtpInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);

  const accept = pattern === "numeric" ? NUMERIC : ALPHANUM;

  // Pad/truncate value into exactly `length` characters of state.
  const chars = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  function commit(nextChars: string[]) {
    const joined = nextChars.join("");
    onValueChange(joined);
    if (joined.length === length && nextChars.every((c) => c !== "")) {
      onComplete?.(joined);
    }
  }

  function focusBox(index: number) {
    const clamped = Math.max(0, Math.min(index, length - 1));
    const target = inputsRef.current[clamped];
    if (target) {
      target.focus();
      target.select();
    }
  }

  function onInput(index: number, raw: string) {
    if (raw.length === 0) return; // handled by onKeyDown for backspace
    const ch = raw[raw.length - 1] ?? "";
    if (!accept.test(ch)) return;
    const next = [...chars];
    next[index] = pattern === "numeric" ? ch : ch.toUpperCase();
    commit(next);
    if (index < length - 1) focusBox(index + 1);
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...chars];
      if (next[index]) {
        next[index] = "";
        commit(next);
      } else if (index > 0) {
        next[index - 1] = "";
        commit(next);
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(index + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusBox(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusBox(length - 1);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").trim();
    if (!text) return;
    const filtered = text
      .split("")
      .filter((c) => accept.test(c))
      .slice(0, length);
    if (filtered.length === 0) return;
    const next = Array.from({ length }, (_, i) => {
      const c = filtered[i] ?? "";
      return pattern === "numeric" ? c : c.toUpperCase();
    });
    commit(next);
    focusBox(Math.min(filtered.length, length - 1));
  }

  return (
    <div
      role="group"
      aria-label={ariaProps["aria-label"] ?? `${length}-digit verification code`}
      aria-describedby={ariaProps["aria-describedby"]}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode={pattern === "numeric" ? "numeric" : "text"}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={ch}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={ariaProps["aria-invalid"]}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "border-border bg-background text-foreground size-11 rounded-md border text-center text-[18px] font-medium tabular-nums",
            "focus-visible:shadow-focus outline-none focus-visible:border-teal-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            ariaProps["aria-invalid"] && "border-red-500 focus-visible:border-red-500",
          )}
        />
      ))}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
