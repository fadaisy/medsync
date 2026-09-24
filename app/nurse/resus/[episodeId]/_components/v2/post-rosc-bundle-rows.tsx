"use client";

import type { SegmentOption } from "./after-arrest-shared";
import type { BundleItemView } from "@/lib/resus/closeout/post-rosc";
import type { BundleItemState } from "@/lib/resus/model";
import type { PostRoscBundleItem } from "@/lib/resus/reference/post-rosc-catalog";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { BanIcon, CheckIcon, MinusIcon } from "lucide-react";

import { POST_ROSC_REF } from "@/lib/resus/reference/post-rosc-catalog";
import { PENDING_CSO, refValue } from "@/lib/resus/reference/ref";
import { cn } from "@/lib/utils";
import { Choice, Segments } from "./after-arrest-shared";

/** The post-ROSC bundle's rows (post-rosc-bundle.tsx): an open item, "Obeys commands?", a recorded line. */
export const OBEYS_ID = "PR-D-01";

export const STATES: SegmentOption<BundleItemState>[] = [
  { value: "done", label: "Done", icon: CheckIcon, on: "bg-teal-50 text-teal-800" },
  {
    value: "not_indicated",
    label: "Not indicated",
    icon: MinusIcon,
    on: "bg-muted text-foreground",
  },
  {
    value: "not_available",
    label: "Not available here",
    icon: BanIcon,
    on: "bg-muted text-foreground",
  },
];

export type LineState = Pick<SegmentOption<string>, "label" | "icon" | "on">;

/** Signed text, or the pending marker (Law 3 — never a number from an unsigned entry). */
export function signedText(id: string): string {
  const e = POST_ROSC_REF[id];
  return e?.status === "signed" ? e.text : PENDING_CSO;
}

/**
 * A row that mounts in place of the focused one (a line collapsing, a row
 * re-opening) takes the focus, so a keyboard user never drops to <body>.
 */
function useFocusOnMount<T extends HTMLElement>(focus: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!focus || !el) return;
    const target =
      el instanceof HTMLButtonElement
        ? el
        : (el.querySelector<HTMLElement>('[aria-pressed="true"]') ??
          el.querySelector<HTMLElement>("button"));
    target?.focus();
  }, [focus]);
  return ref;
}

/** A recorded item: its state and text on one line (one control — tap to change). */
export function RecordedLine({
  text,
  state,
  note,
  disabled,
  focus,
  onEdit,
}: {
  text: string;
  state: LineState;
  note?: ReactNode;
  disabled: boolean;
  focus: boolean;
  onEdit: () => void;
}) {
  const ref = useFocusOnMount<HTMLButtonElement>(focus);
  const Icon = state.icon;
  return (
    <li data-action-row>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={onEdit}
        className="text-body-s hover:bg-muted focus-visible:shadow-focus -mx-2 flex min-h-11 w-[calc(100%+1rem)] min-w-0 items-center gap-2 rounded-md px-2 text-left outline-none disabled:pointer-events-none"
      >
        <span
          className={cn(
            "text-caption inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium",
            state.on,
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {state.label}
        </span>
        <span className="text-foreground min-w-0 flex-1 truncate">{text}</span>
        {disabled ? null : (
          <span className="text-caption text-muted-foreground shrink-0">Change</span>
        )}
      </button>
      {note}
    </li>
  );
}

const ROW = "grid gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4";

export function ItemRow({
  item,
  value,
  note,
  disabled,
  focus,
  onPick,
}: {
  item: PostRoscBundleItem;
  value: BundleItemView;
  note?: ReactNode;
  disabled: boolean;
  focus: boolean;
  onPick: (s: BundleItemState) => void;
}) {
  const ref = useFocusOnMount<HTMLLIElement>(focus);
  const text = signedText(item.id);
  return (
    <li ref={ref} data-action-row className={ROW}>
      <div className="min-w-0 space-y-1">
        <p className="text-body-s text-foreground">
          {text}
          {item.showsNumber ? (
            <span className="text-caption bg-muted text-foreground ml-2 inline-block rounded px-1.5 py-0.5 font-mono tabular-nums">
              {refValue(POST_ROSC_REF[item.id]!)}
            </span>
          ) : null}
        </p>
        {note}
      </div>
      <Segments
        value={value === "open" ? null : value}
        options={STATES}
        label={`State: ${text.slice(0, 60)}`}
        disabled={disabled}
        onPick={onPick}
      />
    </li>
  );
}

export function ObeysRow({
  obeys,
  child,
  disabled,
  focus,
  onPick,
}: {
  obeys: boolean | null;
  child: boolean;
  disabled: boolean;
  focus: boolean;
  onPick: (v: boolean) => void;
}) {
  const ref = useFocusOnMount<HTMLLIElement>(focus);
  return (
    <li ref={ref} data-action-row className={ROW}>
      <p className="text-body-s text-foreground">
        Obeys commands?
        {child ? null : (
          <span className="text-caption bg-muted ml-2 inline-block rounded px-1.5 py-0.5 font-mono tabular-nums">
            {refValue(POST_ROSC_REF[OBEYS_ID]!)}
          </span>
        )}
      </p>
      <div className="flex gap-2" role="group" aria-label="Obeys commands?">
        <Choice selected={obeys === true} disabled={disabled} onClick={() => onPick(true)}>
          Yes
        </Choice>
        <Choice selected={obeys === false} disabled={disabled} onClick={() => onPick(false)}>
          No — comatose
        </Choice>
      </div>
    </li>
  );
}
