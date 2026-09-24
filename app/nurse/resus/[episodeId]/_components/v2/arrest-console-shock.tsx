"use client";

import type { LogFn } from "./arrest-console-writes";
import type { ArrestState } from "@/lib/resus/model";
import { useState } from "react";
import { ChevronDownIcon, ZapIcon } from "lucide-react";

import { recordShockV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import { ALS_REFS } from "@/lib/resus/reference/als-catalog";
import { BtnText, consoleBtn, ConsolePopover } from "./arrest-console-model";
import { shockLabel } from "./record-format";

/**
 * [Shock · 200 J ▾] — one tap logs a shock at the bay profile's energy (ALS-NRG-01) or
 * "highest setting" (ALS-NRG-02). ▾ edits the energy, and offers a stacked shock only in a
 * witnessed + monitored VF/pVT (ALS-SHK-03). A child has no default energy (ALS-MOD-16):
 * the tap opens the editor for the clinician's own number. The hypothermia delay
 * (ALS-MOD-02) is a hint, never a block. The toast carries the oxygen-at-shock reminder.
 */

const OXYGEN = ALS_REFS["ALS-CPR-10"];
const OXYGEN_REMINDER = OXYGEN?.status === "signed" ? OXYGEN.text : undefined;
const MAX_J = 400; // the server's accepted range (recordShockV2), not a clinical value

type Source = "profile" | "highest" | "manual";

export function ShockControl({
  arrest,
  stackOk,
  log,
}: {
  arrest: ArrestState;
  stackOk: boolean;
  log: LogFn;
}) {
  const [open, setOpen] = useState(false);
  const [joules, setJoules] = useState("");
  const [stacked, setStacked] = useState(false);
  const seq = arrest.arrestSeq;
  const { energy, count, delayed, lastAtMs } = arrest.shocks;
  const child = energy.kind === "suppressed_child";
  const lastRhythm = arrest.rhythms[arrest.rhythms.length - 1];
  const primed =
    lastRhythm?.rhythm === "vf_pvt" && (lastAtMs === null || lastAtMs < lastRhythm.atMs);

  const shock = (energyJ: number | null, energySource: Source, isStacked = false) => {
    const label = shockLabel(energyJ, energySource, isStacked);
    log({
      key: "shock",
      label,
      row: {
        kind: "shock",
        step: "arrest",
        arrestSeq: seq,
        payload: { arrestSeq: seq, energyJ, energySource, stacked: isStacked, label },
      },
      run: (b) =>
        recordShockV2({ ...b, arrestSeq: seq, energyJ, energySource, stacked: isStacked }),
      toast: { extra: OXYGEN_REMINDER },
    });
    setOpen(false);
  };

  const n = Number(joules);
  const valid = joules.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_J;
  const label = child
    ? "Shock"
    : energy.kind === "profile"
      ? `Shock · ${energy.joules}\u00a0J`
      : "Shock · highest setting";
  const caption = delayed
    ? "Delayed — hypothermia"
    : primed
      ? `VF/pVT · shock ${count + 1}`
      : `${count} given`;

  return (
    <div className="flex gap-1">
      <button
        type="button"
        data-console-key="s"
        onClick={() =>
          child
            ? setOpen(true)
            : energy.kind === "profile"
              ? shock(energy.joules, "profile")
              : shock(null, "highest")
        }
        className={consoleBtn(delayed ? "due" : primed ? "primed" : "neutral", "flex-1")}
      >
        <ZapIcon aria-hidden className="size-5 shrink-0" />
        <BtnText label={label} caption={caption} />
      </button>
      <ConsolePopover
        open={open}
        onOpenChange={setOpen}
        label="Shock energy"
        trigger={
          <button
            type="button"
            aria-label="Shock options — energy, stacked"
            className={consoleBtn("neutral", "w-11 shrink-0 justify-center px-0")}
          />
        }
        triggerContent={<ChevronDownIcon aria-hidden className="size-5" />}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) shock(n, "manual", stackOk && stacked);
          }}
        >
          <label className="text-caption text-muted-foreground flex flex-col gap-1">
            Energy delivered (J)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_J}
              step={1}
              value={joules}
              onChange={(e) => setJoules(e.target.value)}
              placeholder={energy.kind === "profile" ? String(energy.joules) : "Joules"}
              className="border-border bg-background text-body-l sm:text-body-m text-foreground focus-visible:shadow-focus min-h-11 rounded-sm border px-2.5 font-mono tabular-nums outline-none focus-visible:border-teal-500"
            />
          </label>
          {stackOk ? (
            <label className="text-body-s flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={stacked}
                onChange={(e) => setStacked(e.target.checked)}
                className="size-5 accent-teal-600"
              />
              Stacked shock — witnessed, monitored VF/pVT (the stack counts as one shock)
            </label>
          ) : null}
          <button
            type="submit"
            disabled={!valid}
            className={consoleBtn("primed", "justify-center")}
          >
            {valid ? `Log shock at ${n} J` : "Enter the energy"}
          </button>
          <button
            type="button"
            onClick={() =>
              child
                ? shock(null, "manual")
                : energy.kind === "profile"
                  ? shock(energy.joules, "profile", stackOk && stacked)
                  : shock(null, "highest", stackOk && stacked)
            }
            className={consoleBtn("neutral", "min-h-11 justify-center")}
          >
            {child
              ? "Log without energy"
              : energy.kind === "profile"
                ? `Log at ${energy.joules} J (bay profile)`
                : "Log at highest setting"}
          </button>
        </form>
      </ConsolePopover>
    </div>
  );
}
