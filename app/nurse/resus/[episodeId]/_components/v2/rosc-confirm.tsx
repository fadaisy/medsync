"use client";

import type { RoscSign } from "@/lib/resus/model";
import { useState } from "react";
import { CheckIcon, HeartPulseIcon, SquareIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROSC_SIGNS } from "@/lib/resus/model";
import { cn } from "@/lib/utils";
import { consoleBtn } from "./arrest-console-model";

/**
 * ROSC (confirm) → which signs were present (ALS-ROSC-01/02): palpable pulse, blood pressure /
 * arterial waveform, ETCO₂ rise, signs of life. At least one sign is the record's minimum
 * (the server asks for it); the parent records `recordRoscV2` and the page moves to
 * post-ROSC by phase. Mount it only while open so each opening starts fresh.
 */

const SIGN_LABEL: Record<RoscSign, string> = {
  pulse: "Palpable pulse",
  bp_arterial_waveform: "Blood pressure / arterial waveform",
  etco2_rise: "ETCO₂ rise",
  signs_of_life: "Signs of life — consciousness, purposeful movement",
};

export function RoscConfirm({
  presetPulse,
  onConfirm,
  onClose,
}: {
  /** "Organised: pulse? Yes" pre-ticks the pulse. */
  presetPulse: boolean;
  onConfirm: (signs: RoscSign[]) => void;
  onClose: () => void;
}) {
  const [signs, setSigns] = useState<RoscSign[]>(presetPulse ? ["pulse"] : []);
  const toggle = (s: RoscSign) =>
    setSigns((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        className="data-closed:animate-none data-open:animate-none sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-heading-s flex items-center gap-2">
            <HeartPulseIcon aria-hidden className="size-5 text-teal-600" />
            Return of spontaneous circulation
          </DialogTitle>
          <DialogDescription className="text-body-s">
            Which signs are present? Tick every one you see.
          </DialogDescription>
        </DialogHeader>
        <div role="group" aria-label="ROSC signs" className="flex flex-col gap-2">
          {ROSC_SIGNS.map((s) => {
            const on = signs.includes(s);
            const Icon = on ? CheckIcon : SquareIcon;
            return (
              <button
                key={s}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(s)}
                className={consoleBtn(on ? "done" : "neutral", "min-h-12")}
              >
                <Icon aria-hidden className="size-5 shrink-0" />
                <span className="text-body-m font-medium">{SIGN_LABEL[s]}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter className="items-center">
          <p
            className={cn(
              "text-caption text-muted-foreground mr-auto",
              signs.length > 0 && "sr-only",
            )}
          >
            Choose at least one sign
          </p>
          <button
            type="button"
            onClick={onClose}
            className={consoleBtn("neutral", "min-h-11 justify-center")}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={signs.length === 0}
            onClick={() => onConfirm(signs)}
            className={consoleBtn("primed", "min-h-11 justify-center")}
          >
            <CheckIcon aria-hidden className="size-4" />
            Confirm ROSC
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
