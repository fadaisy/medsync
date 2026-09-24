"use client";

import type { Prescribe } from "./arrest-console-log";
import type { LogFn } from "./arrest-console-writes";
import type { ArrestProcedure, ArrestState } from "@/lib/resus/model";
import { useMemo, useState } from "react";
import { DropletIcon, HandIcon, PillIcon, WindIcon } from "lucide-react";

import { recordArrestProcedureV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Etco2Entry, NoteButton } from "./arrest-console-entry";
import { arrestLog, BtnText, consoleBtn, PROC_LABEL } from "./arrest-console-model";
import { useDeskCtx } from "./desk-context";

/**
 * LOG, second half — airway (BVM → SGA → ETT, ALS-AIR-01; the ETT asks for the sustained
 * ETCO₂ trace and warns, never blocks — ALS-AIR-03), access (IO prompt after failed IV,
 * ALS-ACC-01), the special procedures (pads vector change for refractory VF, ALS-SHK-04;
 * uterine displacement and hysterotomy while the pregnancy modifier is on, ALS-MOD-07;
 * decompression, pericardiocentesis), other drug (the full prescribe dialog), a free note,
 * and EtCO₂ quick entry with the last three values (ALS-ETC-02) — last, a full row on a
 * phone, so no tile leaves a hole.
 */

type EttTrace = "yes" | "no" | "unavailable";
const TRACE_TEXT: Record<EttTrace, string> = {
  yes: "confirmed",
  no: "NOT confirmed",
  unavailable: "capnography not available",
};

/** One arrest procedure — the same row the server writes (actions-arrest.ts). */
export function logProcedure(
  log: LogFn,
  seq: number,
  p: ArrestProcedure,
  o: { ettTrace?: EttTrace; to?: { userId: string; name: string } } = {},
): void {
  const trace = p === "airway_ett" && o.ettTrace ? ` — ETCO₂ trace ${TRACE_TEXT[o.ettTrace]}` : "";
  const who = p === "compressor_swap" && o.to ? ` → ${o.to.name}` : "";
  const label = `${PROC_LABEL[p]}${trace}${who}`;
  const toUserId = o.to?.userId ?? null;
  const toName = o.to?.name ?? null;
  log({
    key: `proc:${p}`,
    label,
    row: {
      kind: "procedure",
      step: "arrest",
      arrestSeq: seq,
      payload: {
        arrestSeq: seq,
        arrestProcedure: p,
        ettTrace: o.ettTrace ?? null,
        toUserId,
        toName,
        label,
      },
    },
    run: (b) =>
      recordArrestProcedureV2({
        ...b,
        arrestSeq: seq,
        arrestProcedure: p,
        ettTrace: o.ettTrace,
        toUserId,
        toName,
      }),
    toast:
      o.ettTrace && o.ettTrace !== "yes"
        ? { tone: "warn", extra: "check the tube position" }
        : undefined,
  });
}

const AIRWAY_WORD = {
  none: "None recorded",
  bvm: "Bag-valve-mask",
  sga: "Supraglottic airway",
  ett: "Tracheal tube",
};
const menuItem = "text-body-s min-h-11 px-3";

export function ConsoleTools({
  arrest,
  log,
  onPrescribe,
}: {
  arrest: ArrestState;
  log: LogFn;
  onPrescribe: Prescribe;
}) {
  const [ettAsk, setEttAsk] = useState(false);
  const seq = arrest.arrestSeq;
  const { airway, access } = arrest;
  const proc = (p: ArrestProcedure) => logProcedure(log, seq, p);
  const { store } = useDeskCtx();
  const done = useMemo(
    () =>
      new Set(
        arrestLog(store.activeEvents, seq).flatMap((e) =>
          e.kind === "procedure" ? [e.payload.arrestProcedure] : [],
        ),
      ),
    [store.activeEvents, seq],
  );
  const padsDue = arrest.shocks.refractoryVf && !done.has("pads_antero_posterior");
  const pregnant = arrest.modifiers.some((m) => m.id === "pregnancy");
  const procs: ArrestProcedure[] = [
    "pads_antero_posterior",
    ...(pregnant ? (["left_uterine_displacement", "hysterotomy"] as const) : []),
    "decompression",
    "pericardiocentesis",
  ];
  const ettUnconfirmed = airway.level === "ett" && airway.ettTrace !== "yes";
  const accessCaption = access.promptIo
    ? `IV failed ×${access.ivFailedAttempts} — go IO`
    : access.iv && access.io
      ? "IV + IO in place"
      : access.iv
        ? "IV in place"
        : access.io
          ? "IO in place"
          : access.ivFailedAttempts > 0
            ? `IV failed ×${access.ivFailedAttempts}`
            : "None recorded";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className={consoleBtn(ettUnconfirmed ? "due" : "neutral")} />
          }
        >
          <WindIcon aria-hidden className="size-5 shrink-0" />
          <BtnText
            label="Airway"
            caption={
              AIRWAY_WORD[airway.level] +
              (airway.level === "ett" && airway.ettTrace
                ? ` · trace ${TRACE_TEXT[airway.ettTrace]}`
                : "")
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuItem className={menuItem} onClick={() => proc("airway_bvm")}>
            Bag-valve-mask
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItem} onClick={() => proc("airway_sga")}>
            Supraglottic airway
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItem} onClick={() => setEttAsk(true)}>
            Tracheal tube…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className={consoleBtn(access.promptIo ? "due" : "neutral")} />
          }
        >
          <DropletIcon aria-hidden className="size-5 shrink-0" />
          <BtnText label="Access" caption={accessCaption} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuItem className={menuItem} onClick={() => proc("iv_attempt_failed")}>
            IV attempt failed
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItem} onClick={() => proc("iv_access")}>
            IV access obtained
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItem} onClick={() => proc("io_access")}>
            IO access obtained{access.promptIo ? " — suggested" : ""}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button type="button" className={consoleBtn(padsDue ? "due" : "neutral")} />}
        >
          <HandIcon aria-hidden className="size-5 shrink-0" />
          <BtnText
            label="Procedure…"
            caption={
              padsDue
                ? "Refractory VF — antero-posterior pads"
                : pregnant && !done.has("hysterotomy")
                  ? "Pregnancy — displacement, hysterotomy"
                  : "Pads, decompression, more"
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          {procs.map((p) => (
            <DropdownMenuItem key={p} className={menuItem} onClick={() => proc(p)}>
              {PROC_LABEL[p]}
              {p === "pads_antero_posterior" && padsDue ? " — suggested" : ""}
              {done.has(p) ? " — recorded" : ""}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" className={consoleBtn("neutral")} />}>
          <PillIcon aria-hidden className="size-5 shrink-0" />
          <BtnText label="Other drug…" caption="Prescribe dialog" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          {(
            [
              ["als_adrenaline", "Adrenaline"],
              ["als_amiodarone", "Amiodarone"],
              ["als_lidocaine", "Lidocaine"],
            ] as const
          ).map(([recCode, name]) => (
            <DropdownMenuItem
              key={recCode}
              className={menuItem}
              onClick={() => onPrescribe({ recCode, recLabel: `${name} — cardiac arrest` })}
            >
              {name} — edit dose, route or concentration
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <NoteButton log={log} />
      <Etco2Entry arrest={arrest} log={log} />

      <Dialog open={ettAsk} onOpenChange={(o) => setEttAsk(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-heading-s">Tracheal tube inserted</DialogTitle>
            <DialogDescription className="text-body-s">
              Sustained ETCO₂ trace confirmed?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {(["yes", "no", "unavailable"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={consoleBtn(t === "yes" ? "primed" : "neutral", "justify-center")}
                onClick={() => {
                  setEttAsk(false);
                  logProcedure(log, seq, "airway_ett", { ettTrace: t });
                }}
              >
                {t === "yes"
                  ? "Yes — trace confirmed"
                  : t === "no"
                    ? "No"
                    : "Capnography not available"}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
