import Link from "next/link";

import { PageTabs } from "@/app/pharmacy/_components/page-tabs";
import { EmptyState, LatePill, Panel, Pill } from "@/components/tide/work/kit";
import { FilterChips } from "@/components/tide/work/space";
import { fill, PRW, RULES } from "@/content/pharmacy-rework-patients";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import { tabOf } from "@/lib/pharmacy/ia";
import { day0, DAY, doseState, dosesAhead, journey, nextDose, ptStats, roundLines, slots } from "@/lib/pharmacy/wards/derive";
import { inpatientsData } from "@/lib/pharmacy/wards/read";
import { NoteButton, PickButton, RoundList, TrackButton } from "./_components/ip-client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
const I = PRW.inpatients;
const time = (ms: number, day = false) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    hour: "2-digit",
    minute: "2-digit",
    ...(day ? { weekday: "short" } : {}),
  }).format(ms);

/** Inpatients (rework PRD §6.3): each ward's patients against their medicine chart, and the round pick list. */
export default async function InpatientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = tabOf("inpatients", sp.tab);
  const actor = await requirePharmacyActor();
  if (!pharmacyTiersFor(actor.hospitalId).wards) return <EmptyState title={PRW.common.tierOff} />;
  const d = await inpatientsData({ userId: actor.userId, hospitalId: actor.hospitalId }, one(sp.ward), one(sp.pt));
  const now = new Date().getTime();
  const tabs = <PageTabs page="inpatients" current={tab} />;
  if (!d.ward)
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <EmptyState title={I.noWards} next={I.noWardsNext} />
      </div>
    );
  const ward = d.ward;
  const href = (p: Record<string, string | null>) =>
    `/pharmacy/patients/inpatients?${new URLSearchParams(
      Object.entries({ tab, ward: ward.id, ...p }).filter((e): e is [string, string] => e[1] != null),
    )}`;
  const wardHas = (med: string) => d.balances.filter((b) => b.loc === ward.id && b.med === med).reduce((a, b) => a + b.n, 0);
  const sources = (med: string) =>
    d.balances.filter((b) => b.kind !== "ward" && b.med === med).map((b) => ({ id: b.loc, name: b.name, n: b.n }));
  const name = (id: string) => d.ids.get(id)?.name ?? PRW.common.noName;
  const jOf = (r: (typeof d.regs)[number]) => journey(r, d.supplies.get(r.id) ?? [], 0, d.recs, now);

  const chips = (
    <FilterChips
      label={I.wardsLabel}
      current={ward.id}
      chips={d.wards.map((w) => ({ key: w.id, label: w.name, href: `/pharmacy/patients/inpatients?tab=${tab}&ward=${w.id}`, count: w.patients.length }))}
    />
  );

  if (tab === "round") {
    const h = ([12, 24, 48] as const).find((x) => String(x) === one(sp.h)) ?? 24;
    const pickPlaces = [...new Map(d.balances.filter((b) => b.kind !== "ward").map((b) => [b.loc, b.name])).entries()];
    const from = pickPlaces.find(([id]) => id === one(sp.from)) ?? pickPlaces[0] ?? null;
    const lines = roundLines(d.regs, d.recs, jOf, h, now).map((l) => ({
      medicineId: l.medicineId,
      drug: l.drug,
      need: l.need,
      have: l.have,
      pick: l.pick,
      placeHas: from ? d.balances.find((b) => b.loc === from[0] && b.med === l.medicineId)?.n ?? 0 : 0,
      pts: l.pts.map((p) => ({ rxId: p.r.id, who: `${name(p.r.patientId)}`, n: p.n, pick: p.pick })),
    }));
    const last = d.lastRound.get(ward.id);
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        {chips}
        <Panel
          title={fill(PRW.round.windowLabel, { h })}
          note={last ? `${fill(PRW.round.lastRound, { when: time(last.at, true) })} · ${last.recv ? PRW.round.lastConfirmed : PRW.round.lastWaiting}` : undefined}
        >
          <div className="mb-3 flex flex-col gap-2">
            <FilterChips
              label={PRW.round.windows}
              current={String(h)}
              chips={RULES.roundWindows.map((x) => ({ key: String(x), label: fill(PRW.round.windowLabel, { h: x }), href: href({ h: String(x), from: from?.[0] ?? null }) }))}
            />
            {pickPlaces.length > 1 ? (
              <FilterChips
                label={PRW.round.fromPlace}
                current={from?.[0] ?? ""}
                chips={pickPlaces.map(([id, n]) => ({ key: id, label: n, href: href({ h: String(h), from: id }) }))}
              />
            ) : null}
          </div>
          <RoundList wardId={ward.id} ward={ward.name} fromId={from?.[0] ?? null} fromName={from?.[1] ?? ""} windowH={h} lines={lines} />
        </Panel>
      </div>
    );
  }

  // MAR tab
  const rows = ward.patients.map((p) => {
    const regs = d.regs.filter((r) => r.patientId === p);
    return { id: p, regs, s: ptStats(regs, d.recs, wardHas, now), next: nextDose(regs, d.recs, now) };
  });
  const forPharmacy = d.regs.flatMap((r) => {
    const s = ptStats([r], d.recs, wardHas, now);
    const j = jOf(r);
    const out: { key: string; text: string; pt: string }[] = [];
    if (s.stock || !s.rs[0]!.c.ok)
      out.push({ key: `${r.id}:pick`, text: fill(I.pickFor, { med: r.drug, who: name(r.patientId) }), pt: r.patientId });
    if (j.onway > 0) out.push({ key: `${r.id}:wait`, text: fill(I.waitingConfirm, { med: r.drug }), pt: r.patientId });
    return out;
  });
  const sel = d.patient ? rows.find((r) => r.id === d.patient) : null;
  const t0 = day0(now);
  return (
    <div className="flex flex-col gap-4">
      {tabs}
      {chips}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Panel title={I.patients}>
          {!rows.length ? (
            <EmptyState compact title={I.noPatients} next={I.noPatientsNext} />
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={href({ pt: r.id })}
                    aria-current={r.id === d.patient ? "true" : undefined}
                    className="hover:bg-ink-50 aria-[current=true]:bg-ink-50 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5"
                  >
                    <span className="font-medium">{name(r.id)}</span>
                    <span className="text-body-s text-muted-foreground">{d.ids.get(r.id)?.mrn}</span>
                    <span className="text-body-s tabular-nums">
                      {r.s.pct == null ? I.noneDue : fill(I.adherenceOf, { pct: r.s.pct })}
                    </span>
                    <span className="ml-auto flex flex-wrap gap-1.5">
                      {r.s.stock ? <LatePill>{`${I.noStock} ${r.s.stock}`}</LatePill> : null}
                      {r.s.overdue ? <LatePill>{`${I.overdue} ${r.s.overdue}`}</LatePill> : null}
                      {r.s.dueNow ? <Pill>{`${I.dueNow} ${r.s.dueNow}`}</Pill> : null}
                      <Pill>{r.next ? fill(I.nextDose, { time: time(r.next) }) : I.noNext}</Pill>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={I.forPharmacy}>
          {forPharmacy.length ? (
            <ul className="text-body-s flex flex-col gap-2">
              {forPharmacy.map((f) => (
                <li key={f.key}>
                  <Link className="text-primary underline-offset-2 hover:underline" href={href({ pt: f.pt })}>
                    {f.text}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-s text-muted-foreground">{I.forPharmacyNone}</p>
          )}
        </Panel>
      </div>
      {sel ? (
        <>
          <Panel title={`${name(sel.id)} · ${I.chart}`} note={d.ids.get(sel.id)?.ageSex}>
            {!sel.regs.length ? (
              <p className="text-body-s text-muted-foreground">{I.noRegimens}</p>
            ) : (
              <ul className="divide-border flex flex-col divide-y">
                {sel.regs.map((r) => {
                  const j = jOf(r);
                  const today = slots(r, t0, t0 + DAY - 1);
                  return (
                    <li key={r.id} className="flex flex-col gap-2 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">{r.drug}</span>
                        <span className="text-body-s text-muted-foreground">
                          {[r.dose, r.route, r.prn ? I.prn : r.frequency].filter(Boolean).join(" · ")}
                        </span>
                        <span className="ml-auto flex flex-wrap gap-1">
                          <TrackButton
                            drug={r.drug}
                            j={j}
                            wardHas={wardHas(r.medicineId)}
                            picks={(d.supplies.get(r.id) ?? []).map((s) =>
                              `${fill(I.pickedLine, { qty: s.qty, when: time(s.at, true) })} · ${s.receivedAt ? I.confirmed : I.onTheWay}`,
                            )}
                          />
                          <PickButton
                            wardId={ward.id}
                            rxId={r.id}
                            drug={r.drug}
                            next24={dosesAhead(r, d.recs, now, now + DAY)}
                            rest={r.days == null ? null : dosesAhead(r, d.recs, now, r.start + r.days * DAY)}
                            sources={sources(r.medicineId)}
                          />
                        </span>
                      </div>
                      {today.length ? (
                        <ul className="flex flex-wrap gap-1.5" aria-label={I.chart}>
                          {today.map((ts) => {
                            const k = doseState(r, ts, d.recs, now);
                            const text = `${time(ts)} ${I.states[k]}`;
                            return (
                              <li key={ts}>
                                {k === "stock" || k === "overdue" || k === "late" ? (
                                  <LatePill>{text}</LatePill>
                                ) : (
                                  <Pill tone={k === "given" ? "passed" : "neutral"}>{text}</Pill>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel title={I.notes} action={<NoteButton patientId={sel.id} />}>
            {d.notes.length ? (
              <ul className="text-body-s flex flex-col gap-2">
                {d.notes.map((n) => (
                  <li key={n.id}>
                    <span className="text-muted-foreground tabular-nums">{time(n.at, true)} · </span>
                    {n.body}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-s text-muted-foreground">{I.noNotes}</p>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
