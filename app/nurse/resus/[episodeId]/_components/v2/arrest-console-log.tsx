"use client";

import type { ArrestDrug, DrugButton, RecCode } from "./arrest-console-drugs";
import type { LogFn } from "./arrest-console-writes";
import type { ArrestContext, ArrestState, BayProfile } from "@/lib/resus/model";
import { ChevronDownIcon, PillIcon, SyringeIcon, ZapIcon } from "lucide-react";

import { recordArrestDrugV2, setBayProfileV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getEmergencyDrug } from "@/lib/prescribing/reference/emergency-drug-catalog";
import { cn } from "@/lib/utils";
import { adrenalineButton, antiarrhythmicButton, episodeTotalsLine } from "./arrest-console-drugs";
import { BtnText, consoleBtn, WAVEFORM_LABEL } from "./arrest-console-model";
import { ShockControl } from "./arrest-console-shock";
import { ConsoleTools } from "./arrest-console-tools";
import { useDeskCtx } from "./desk-context";

/**
 * LOG — every arrest event in one tap. Shock (energy from the bay profile, ALS-NRG-01/02),
 * the protocol drugs through the fast path (D4, ALS-DRG-05: clear → one tap records;
 * withheld, delayed or a safety block → the prescribe dialog pre-filled, with the reasons),
 * then airway / access / procedure / other drug / note / EtCO₂. Every number is a signed
 * catalog constant; a child sees none (ALS-MOD-16). The button rules: arrest-console-drugs.ts.
 */

export type Prescribe = (d: { recCode: RecCode; recLabel: string; reasons?: string[] }) => void;

const DRUG_ID: Record<ArrestDrug, string> = {
  adrenaline: "adrenaline_arrest_iv",
  amiodarone: "amiodarone_arrest_iv",
  lidocaine: "lidocaine_arrest_iv",
};

export function LogRow({
  arrest,
  now,
  ctx,
  stackOk,
  bayProfiles,
  log,
  onPrescribe,
}: {
  arrest: ArrestState;
  now: number;
  ctx: ArrestContext;
  stackOk: boolean;
  bayProfiles: BayProfile[];
  log: LogFn;
  onPrescribe: Prescribe;
}) {
  const { store } = useDeskCtx();
  const seq = arrest.arrestSeq;
  const route = arrest.access.io && !arrest.access.iv ? "io" : "iv";
  const child = arrest.paediatric;

  /** One tap when a signed default exists; otherwise the dialog, with the reasons why. */
  const give = ({ drug, doseMg, reasons, rec }: DrugButton) => {
    const d = getEmergencyDrug(DRUG_ID[drug]);
    if (doseMg === null || !d) return onPrescribe({ ...rec, reasons });
    const dose = `${doseMg} mg`;
    const label = `${d.name} ${dose} ${route.toUpperCase()} — administered`;
    log({
      key: `drug:${drug}`,
      label,
      row: {
        kind: "drug",
        step: "arrest",
        arrestSeq: seq,
        payload: {
          arrestSeq: seq,
          arrestDrug: drug,
          fastPath: true,
          prescribing: {
            drugId: d.id,
            drugKey: d.drugKey,
            drugName: d.name,
            dose,
            route,
            amountMg: doseMg,
          },
          state: "performed",
          label,
        },
      },
      run: (b) => recordArrestDrugV2({ ...b, arrestSeq: seq, drug, route }),
      drug: rec,
    });
  };

  const adr = arrest.adrenaline;
  const adrBtn = adrenalineButton(arrest, ctx, now, route, store.activeEvents);
  const aa = antiarrhythmicButton(arrest, ctx, store.activeEvents);
  const totals = episodeTotalsLine(arrest);

  return (
    <div role="group" aria-label="Log" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-overline text-muted-foreground uppercase">Log</p>
        <BayChip
          bay={ctx.bayProfile}
          profiles={bayProfiles}
          child={child}
          onPick={(id) =>
            log({
              key: `bay:${id}`,
              label: "Defibrillator profile set",
              row: {
                kind: "note",
                step: "pre",
                payload: {
                  noteKind: "bay_profile",
                  bayProfileId: id,
                  label: "Defibrillator profile set",
                },
              },
              run: (b) => setBayProfileV2({ ...b, bayProfileId: id }),
              toast: false,
            })
          }
        />
      </div>
      {totals ? <p className="text-body-s font-medium">{totals}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <ShockControl arrest={arrest} stackOk={stackOk} log={log} />
        <button
          type="button"
          data-console-key="a"
          onClick={() => give(adrBtn)}
          className={consoleBtn(
            adr.status === "overdue"
              ? "overdue"
              : adr.status === "due_now" || adr.status === "window_open"
                ? "due"
                : "neutral",
          )}
        >
          <SyringeIcon aria-hidden className="size-5 shrink-0" />
          <BtnText label={adrBtn.label} caption={adrBtn.caption} />
        </button>
        {aa.show ? (
          <button
            type="button"
            data-console-key="m"
            onClick={() => give(aa)}
            className={consoleBtn(arrest.antiarrhythmic.status === "due" ? "due" : "neutral")}
          >
            <PillIcon aria-hidden className="size-5 shrink-0" />
            <BtnText label={aa.label} caption={aa.caption} />
          </button>
        ) : null}
        <ConsoleTools arrest={arrest} log={log} onPrescribe={onPrescribe} />
      </div>
    </div>
  );
}

/** "Bay 2 · rectilinear biphasic ▾" — the registered defibrillator, or "highest setting". */
function BayChip({
  bay,
  profiles,
  child,
  onPick,
}: {
  bay: BayProfile | null;
  profiles: BayProfile[];
  child: boolean;
  onPick: (id: string | null) => void;
}) {
  const text = child
    ? "Energy: weight-based (PLS not built)"
    : bay
      ? `${bay.label} · ${WAVEFORM_LABEL[bay.waveform]}`
      : "Energy: highest setting";
  const chip = "text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3";
  if (child || profiles.length === 0)
    return (
      <span className={cn(chip, "border-border text-muted-foreground")}>
        <ZapIcon aria-hidden className="size-4" />
        {text}
      </span>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" className={cn(chip, "tap border-border hover:bg-muted")} />}
        aria-label={`Defibrillator: ${text}. Change`}
      >
        <ZapIcon aria-hidden className="size-4" />
        {text}
        <ChevronDownIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {profiles.map((p) => (
          <DropdownMenuItem
            key={p.id}
            className="text-body-s min-h-11 px-3"
            onClick={() => onPick(p.id)}
          >
            {p.label} · {WAVEFORM_LABEL[p.waveform]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem className="text-body-s min-h-11 px-3" onClick={() => onPick(null)}>
          No profile — highest setting
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
