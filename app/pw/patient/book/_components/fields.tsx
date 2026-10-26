"use client";

import type { ComponentProps } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

/** A many-line note at the kit's field look (controls.tsx TextField is one line): 17 px, a visible label. */
export function TextArea({
  label,
  hint,
  className,
  ...rest
}: ComponentProps<"textarea"> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-base leading-5 font-semibold">
        {label}
        {hint ? <span className="text-pw-ink-3 font-medium">{` · ${hint}`}</span> : null}
      </label>
      <textarea
        id={id}
        rows={3}
        {...rest}
        className={cn(
          "rounded-pw-field bg-pw-surface text-pw-ink ring-pw-line-strong placeholder:text-pw-ink-4 min-h-[104px] w-full min-w-0 resize-y px-4 py-3 text-[17px] leading-6 ring-[1.5px] ring-inset",
          "focus:ring-pw-focus focus:ring-2 focus:outline-none",
        )}
      />
    </div>
  );
}

/** "Step 2 of 3 · A few questions", with the three bars (mobile/src/features/symptoms/steps.tsx StepHead). */
export function StepHead({ n, words, text }: { n: 1 | 2 | 3; words: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-pw-ink-2 text-[15px] font-semibold">{text}</p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={n}
        aria-label={words}
        className="flex gap-1.5"
      >
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full", i <= n ? "bg-pw-act" : "bg-pw-line")}
          />
        ))}
      </div>
    </div>
  );
}
