"use client";

import type { useScan } from "./use-scan";
import type { RefObject } from "react";

import { LabButton } from "@/components/tide/work/button";
import { RCT } from "@/content/pharmacy-receive-count";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";
import { inputCls, selectCls } from "../shared";
import { Said } from "./parts";

const S = RCT.scan;

/** The scan band (RECEIVE §D1): light teal, one input that a scanner types into, "Read", and the picker. */
export function ScanBand({
  scan,
  inputRef,
  onPicker,
}: {
  scan: ReturnType<typeof useScan>;
  inputRef: RefObject<HTMLInputElement | null>;
  onPicker: (q: string) => void;
}) {
  const { world } = useReceive();
  const { note } = scan;
  return (
    <div className="bg-tide-lagoon-tint flex flex-col gap-2 rounded-xl p-3 sm:p-4">
      <label
        htmlFor="receive-scan-box"
        className="text-foreground text-[14px] leading-5 font-semibold"
      >
        {S.label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="receive-scan-box"
          ref={inputRef}
          className={cn(inputCls(), "min-w-0 flex-1 basis-56")}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={scan.value}
          onChange={(e) => scan.setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              scan.read(e.currentTarget.value);
            }
          }}
        />
        <LabButton className="h-11 sm:h-9" onClick={() => scan.read()}>
          {S.read}
        </LabButton>
        <LabButton className="h-11 sm:h-9" onClick={() => onPicker("")}>
          {S.pick}
        </LabButton>
      </div>
      <span className="text-ink-700 text-[12.5px] leading-[18px]">{S.hint}</span>
      {note ? (
        <div role="status" className="bg-card flex flex-col gap-2 rounded-lg p-3">
          {note.kind === "warn" ? (
            <Said tone="warn">{note.text}</Said>
          ) : (
            <span className="text-foreground text-[13.5px] leading-5">{note.text}</span>
          )}
          {note.kind === "unknown" ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={cn(selectCls(), "min-w-0 flex-1 basis-56")}
                aria-label={S.unknownLabel}
                value={note.pick}
                onChange={(e) => scan.setPick(e.target.value)}
              >
                <option value="">{S.choose}</option>
                {world.meds.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <LabButton variant="primary" className="h-11 sm:h-9" onClick={scan.link}>
                {S.link}
              </LabButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
