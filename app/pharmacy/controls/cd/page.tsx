import type { EmrDb } from "@/lib/emr/db";
import type { CdMove } from "@/lib/pharmacy/cd/derive";
import { cache } from "react";

import { EmptyState, KeyFigure, KeyFigureGrid, Panel, Pill } from "@/components/tide/work/kit";
import { FilterChips } from "@/components/tide/work/space";
import { CTL } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import {
  cdFlags,
  cdRegisters,
  checkDue,
  checkStatus,
  lastCheck,
  mgFmt,
} from "@/lib/pharmacy/cd/derive";
import { loadCd } from "@/lib/pharmacy/cd/read";
import { when } from "@/lib/pharmacy/cd/sql";
import { isInCharge } from "@/lib/pharmacy/cd/store";
import { tabOf } from "@/lib/pharmacy/ia";
import { PageTabs } from "../../_components/page-tabs";
import { CheckButton, FlagList, PaperList } from "./_components/cd-client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

/** One read per request: the controlled ledger, checks and places (3 queries) and whether the viewer is the in-charge. */
const cdPage = cache(async (hospitalId: string, userId: string) => {
  const d = db as unknown as EmrDb;
  const [data, inCharge] = await Promise.all([
    loadCd(d, hospitalId),
    isInCharge(d, userId, hospitalId),
  ]);
  return { ...data, inCharge };
});

/**
 * Controlled drugs (rework PRD §6.5): Registers, To fix, Balance checks and Paper. The register is the ledger itself;
 * every fix is a signed, witnessed action. The shell owns the h1.
 */
export default async function ControlledDrugsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = tabOf("cd", sp.tab);
  const actor = await requirePharmacyActor();
  const data = await cdPage(actor.hospitalId, actor.userId);
  const now = new Date();
  const flags = cdFlags({ ...data, now });
  const toFix = flags.filter((f) => f.k !== "paper");
  const paper = flags.filter((f) => f.k === "paper");
  const registers = cdRegisters(data.moves);
  const placeName = Object.fromEntries(data.places.map((p) => [p.id, p.name]));
  const held = data.places.filter((p) => registers.some((r) => r.placeId === p.id));
  const due = held.filter((p) => checkDue(data.checks, p, now));
  const doses24 = data.moves.filter(
    (m) => m.dose && now.getTime() - m.at.getTime() < 86_400_000,
  ).length;
  const forPlace = (placeId: string) =>
    registers
      .filter((r) => r.placeId === placeId && r.balance > 0)
      .map((r) => ({ medicineId: r.medicineId, name: r.medicineName, balance: r.balance }));

  let body;
  if (tab === "flags")
    body = (
      <Panel title={CTL.flags.title} note={CTL.flags.note}>
        <FlagList
          flags={toFix}
          placeName={placeName}
          cases={Object.fromEntries(data.cases)}
          checks={data.checks}
          moves={data.moves}
          forPlace={Object.fromEntries(held.map((p) => [p.id, forPlace(p.id)]))}
        />
      </Panel>
    );
  else if (tab === "paper")
    body = (
      <Panel title={CTL.paper.title} note={CTL.paper.note}>
        <PaperList flags={paper} placeName={placeName} inCharge={data.inCharge} />
      </Panel>
    );
  else if (tab === "checks")
    body = (
      <div className="flex flex-col gap-4">
        <Panel title={CTL.checks.places} note={CTL.checks.placesNote}>
          {held.length ? (
            <ul className="flex flex-col gap-2">
              {held.map((p) => {
                const last = lastCheck(data.checks, p.id);
                return (
                  <li
                    key={p.id}
                    className="bg-card shadow-tide-card rounded-tide-row flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-[14px] font-semibold">{p.name}</span>
                      <span className="text-caption text-ink-600">
                        {last
                          ? fill(CTL.register.checked, { when: when(last.at) })
                          : CTL.register.never}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {checkDue(data.checks, p, now) ? (
                        <Pill tone="caution">{CTL.flags.tag.due}</Pill>
                      ) : null}
                      <CheckButton place={p} items={forPlace(p.id)} label={CTL.checks.checkNow} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact title={CTL.register.none} />
          )}
        </Panel>
        <Panel title={CTL.checks.log}>
          {data.checks.length ? (
            <ul className="flex flex-col gap-2">
              {data.checks.map((c) => {
                const s = checkStatus(c);
                return (
                  <li
                    key={c.id}
                    className="bg-card shadow-tide-card rounded-tide-row flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="text-[14px] font-semibold">
                        {placeName[c.placeId]} · {when(c.at)}
                      </span>
                      <span className="text-caption text-ink-600">
                        {c.lines
                          .map(
                            (l) => `${l.counted} (${fill(CTL.checks.regShort, { n: l.expected })})`,
                          )
                          .join(" · ")}
                      </span>
                      <span className="text-caption text-ink-600">
                        {c.by} ·{" "}
                        {c.handover
                          ? fill(CTL.checks.fromHandover, { name: c.witness ?? "" })
                          : (c.witness ?? CTL.register.noWitness)}
                      </span>
                    </div>
                    <Pill tone={s === "open" ? "caution" : s === "ok" ? "passed" : "neutral"}>
                      {CTL.checks[s]}
                    </Pill>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact title={CTL.checks.none} />
          )}
        </Panel>
      </div>
    );
  else {
    const keyOf = (r: { medicineId: string; placeId: string }) => `${r.medicineId}~${r.placeId}`;
    const sel = registers.find((r) => keyOf(r) === one(sp.reg)) ?? registers[0];
    let bal = 0;
    const rows = sel
      ? data.moves
          .filter((m) => m.medicineId === sel.medicineId && m.placeId === sel.placeId)
          .map((m) => ({ m, bal: (bal += m.qty) }))
          .reverse()
      : [];
    const place = sel ? data.places.find((p) => p.id === sel.placeId) : undefined;
    body = (
      <div className="flex flex-col gap-4">
        <KeyFigureGrid>
          <KeyFigure
            label={CTL.kpi.registers}
            value={registers.length}
            sub={fill(CTL.kpi.registersSub, {
              meds: new Set(registers.map((r) => r.medicineId)).size,
              places: held.length,
            })}
          />
          <KeyFigure label={CTL.kpi.doses} value={doses24} />
          <KeyFigure
            label={CTL.kpi.toFix}
            value={toFix.length}
            href="/pharmacy/controls/cd?tab=flags"
          />
          <KeyFigure
            label={CTL.kpi.due}
            value={due.length}
            href="/pharmacy/controls/cd?tab=checks"
          />
        </KeyFigureGrid>
        {sel && place ? (
          <>
            <FilterChips
              label={CTL.register.choose}
              current={keyOf(sel)}
              chips={registers.map((r) => ({
                key: keyOf(r),
                label: `${r.medicineName} · ${placeName[r.placeId]}`,
                href: `/pharmacy/controls/cd?tab=register&reg=${encodeURIComponent(keyOf(r))}`,
                count: r.balance,
              }))}
            />
            <Panel
              title={`${sel.medicineName} · ${place.name}`}
              note={fill(CTL.register.balance, { n: sel.balance })}
              action={
                <CheckButton place={place} items={forPlace(place.id)} label={CTL.register.check} />
              }
            >
              <RegisterRows rows={rows} placeName={placeName} />
              <p className="text-caption text-ink-600 mt-3">{CTL.register.hint}</p>
            </Panel>
          </>
        ) : (
          <EmptyState title={CTL.register.none} why={CTL.register.noneNext} />
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PageTabs
        page="cd"
        current={tab}
        counts={{ flags: toFix.length, checks: due.length, paper: paper.length }}
      />
      {body}
    </div>
  );
}

type Row = { m: CdMove; bal: number };

function RegisterRows({ rows, placeName }: { rows: Row[]; placeName: Record<string, string> }) {
  const R = CTL.register;
  const who = (m: CdMove) =>
    m.dose
      ? `${m.dose.patient}${m.dose.bed ? ` · ${m.dose.bed}` : ""}`
      : `${R.kinds[m.kind] ?? m.kind}${m.note ? ` · ${m.note}` : ""}`;
  const dose = (m: CdMove) => {
    if (!m.dose) return "";
    const left = m.dose.residueDisposed
      ? R.residueOk
      : m.events.some((e) => e.kind === "residue_recorded")
        ? R.residueLate
        : R.residueMissing;
    const res = m.dose.residueMg > 0 ? ` · ${fill(left, { mg: mgFmt(m.dose.residueMg) })}` : "";
    return `${mgFmt(m.dose.doseMg)} mg ${m.dose.route}${res}`;
  };
  const witness = (m: CdMove) => {
    if (m.witness) return m.witness;
    if (m.paperWitness) return fill(R.paper, { name: m.paperWitness });
    const added = m.events.find((e) => e.kind === "witness_added")?.witness;
    return added ? `${added} · ${R.addedLate}` : R.noWitness;
  };
  const marks = (m: CdMove) => (
    <>
      {m.late || m.dose?.lateEntry ? <Pill tone="caution">{R.lateEntry}</Pill> : null}
      {m.reversed ? <Pill>{R.corrected}</Pill> : null}
    </>
  );
  return (
    <>
      <table className="hidden w-full text-left text-[13px] sm:table">
        <thead className="text-caption text-ink-600">
          <tr>
            {R.cols.map((c) => (
              <th key={c} className="px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, bal }, i) => (
            <tr key={m.id} className="border-border border-t align-top">
              <td className="px-2 py-2 tabular-nums">{rows.length - i}</td>
              <td className="px-2 py-2 whitespace-nowrap">{when(m.at)}</td>
              <td className="px-2 py-2">
                <div className="flex flex-col gap-1">
                  <span>{who(m)}</span>
                  <span className="flex flex-wrap gap-1">{marks(m)}</span>
                  {m.late ? (
                    <span className="text-caption text-ink-600">
                      {fill(R.entered, { when: when(m.recordedAt), name: m.by })}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-2 py-2">{m.dose?.prescriber ?? ""}</td>
              <td className="px-2 py-2">{dose(m)}</td>
              <td className="px-2 py-2 tabular-nums">{m.qty > 0 ? m.qty : ""}</td>
              <td className="px-2 py-2 tabular-nums">{m.qty < 0 ? -m.qty : ""}</td>
              <td className="px-2 py-2 font-semibold tabular-nums">{bal}</td>
              <td className="px-2 py-2">{m.dose?.givenBy ?? m.by}</td>
              <td className="px-2 py-2">{witness(m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map(({ m, bal }) => (
          <li
            key={m.id}
            className="bg-card shadow-tide-card rounded-tide-row flex flex-col gap-1 px-3 py-2.5 text-[13.5px]"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{who(m)}</span>
              <span className="tabular-nums">
                {m.qty > 0 ? `+${m.qty}` : m.qty} → <b>{bal}</b>
              </span>
            </div>
            <span className="text-caption text-ink-600">
              {when(m.at)} · {placeName[m.placeId]}
              {m.dose ? ` · ${dose(m)}` : ""}
            </span>
            <span className="text-caption text-ink-600">
              {m.dose?.givenBy ?? m.by} · {witness(m)}
            </span>
            <span className="flex flex-wrap gap-1">{marks(m)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
