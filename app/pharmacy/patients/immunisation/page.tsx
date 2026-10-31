import Link from "next/link";

import { PageTabs } from "@/app/pharmacy/_components/page-tabs";
import { ColdChainBody } from "@/app/pharmacy/stock/store/cold/tab";
import { Histogram } from "@/components/tide/work/charts";
import { EmptyState, KeyFigure, KeyFigureGrid, LatePill, Panel, Pill } from "@/components/tide/work/kit";
import { PrimaryLink } from "@/components/tide/work/space";
import { fill, PRW, VACCINE_NAMES } from "@/content/pharmacy-rework-patients";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { epiPlan, epiStatus, indicators, vaxStock, vialHours } from "@/lib/pharmacy/epi/derive";
import { immunisationData } from "@/lib/pharmacy/epi/read";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import { tabOf } from "@/lib/pharmacy/ia";
import { day0, DAY, HOUR } from "@/lib/pharmacy/wards/derive";
import { DiscardVial, RegisterButton, VaccinateButton, VvmButton } from "./_components/epi-client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const E = PRW.epi;
const BASE = "/pharmacy/patients/immunisation";
const date = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric" }).format(ms);
const time = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit" }).format(ms);
const vname = (v: string) => VACCINE_NAMES[v] ?? v;

/** Immunisation (rework PRD §6.3): vaccine stock at the EPI clinic, its fridge, the clinic day and the register. */
export default async function ImmunisationPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = tabOf("immunisation", sp.tab);
  const actor = await requirePharmacyActor();
  if (!pharmacyTiersFor(actor.hospitalId).epi) return <EmptyState title={PRW.common.tierOff} />;
  const now = new Date().getTime();
  const d = await immunisationData(actor.hospitalId, tab, Math.floor(now / 60_000) * 60_000);
  const tabs = <PageTabs page="immunisation" current={tab} />;
  if (!d.setup)
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <EmptyState title={E.notSetUp} next={E.notSetUpNext} />
      </div>
    );
  const setup = d.setup;
  if (d.tab === "cold")
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <ColdChainBody fridge={typeof sp.fridge === "string" ? sp.fridge : undefined} base={`${BASE}?tab=cold`} onlyAt={setup.locationId} />
      </div>
    );
  const usable = (productId: string) => d.usable.find((u) => u.product_id === productId);

  if (d.tab === "stock") {
    const rows = setup.vaccines.map((v) => {
      const u = usable(v.productId);
      const s = vaxStock({
        vaccine: v.vaccine,
        at: u?.usable ?? 0,
        cold: d.cold.find((c) => c.product === v.productId)?.n ?? 0,
        max: v.max,
        todayUsed: u?.today ?? 0,
        week: u?.week ?? 0,
        perDay: (u?.days ?? []).reduce((a, b) => a + b, 0) / 14,
      });
      const batches = d.batches.filter((b) => b.product === v.productId);
      const inUse = batches.find((b) => (b.vvm ?? 1) < 3 && Date.parse(b.exp) >= day0(now));
      return { v, s, batches, inUse };
    });
    const perDay = Array.from({ length: 14 }, (_, i) => d.usable.reduce((a, u) => a + (u.days?.[i] ?? 0), 0));
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <KeyFigureGrid className="xl:grid-cols-3">
          <KeyFigure label={E.kpiRefill} value={rows.filter((r) => r.s.k === "refill").length} />
          <KeyFigure label={E.kpiUsed} value={d.usable.reduce((a, u) => a + u.given_m, 0)} />
          <KeyFigure label={E.kpiVials} value={d.vials.length} />
        </KeyFigureGrid>
        <Panel title={E.stockTitle} note={E.stockNote} action={<PrimaryLink href="/pharmacy/stock/store?tab=issue">{E.refillButton}</PrimaryLink>}>
          {!rows.length ? (
            <EmptyState compact title={E.notSetUp} next={E.notSetUpNext} />
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {rows.map(({ v, s, batches, inUse }) => (
                <li key={v.vaccine} className="flex flex-col gap-1.5 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{vname(v.vaccine)}</span>
                    {s.k === "refill" ? (
                      <LatePill>{s.at ? fill(E.refill, { n: s.top }) : E.noneUsable}</LatePill>
                    ) : s.k === "watch" ? (
                      <Pill>{E.watch}</Pill>
                    ) : (
                      <Pill tone="passed">{E.ok}</Pill>
                    )}
                    <span className="text-body-s text-muted-foreground ml-auto">
                      {v.max ? fill(E.minMax, { min: s.min, max: v.max }) : E.noMax}
                    </span>
                  </div>
                  <dl className="text-body-s grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums sm:grid-cols-5">
                    {(
                      [
                        [E.atEpi, s.at],
                        [E.usedToday, s.todayUsed],
                        [E.last7, s.week],
                        [E.daysLeft, s.daysLeft ?? "–"],
                        [E.coldRoom, s.cold],
                      ] as const
                    ).map(([k, val]) => (
                      <div key={k}>
                        <dt className="text-caption text-muted-foreground">{k}</dt>
                        <dd>{val}</dd>
                      </div>
                    ))}
                  </dl>
                  {batches.length ? (
                    <ul className="text-body-s flex flex-col">
                      {batches.map((b) => (
                        <li key={b.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[12.5px]">{b.no}</span>
                          <span className="text-muted-foreground">
                            {fill(E.exp, { date: date(Date.parse(b.exp)) })} · {b.n}
                          </span>
                          {b.id === inUse?.id ? <Pill>{E.batchInUse}</Pill> : null}
                          {b.vvm ? (
                            b.vvm >= 3 ? (
                              <LatePill>{fill(E.vvm, { n: b.vvm })}</LatePill>
                            ) : (
                              <Pill>{b.vvm === 2 ? fill(E.vvmUseFirst, { n: 2 }) : fill(E.vvm, { n: b.vvm })}</Pill>
                            )
                          ) : null}
                          <VvmButton batchId={b.id} batch={b.no} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={E.chartTitle} note={E.chartNote}>
            <Histogram
              counts={perDay}
              buckets={perDay.map((_, i) => String(new Date(day0(now) - (13 - i) * DAY + 3 * HOUR).getUTCDate()))}
              medianIndex={null}
              medianLabel={null}
              alt={E.chartAlt}
              axis=""
            />
          </Panel>
          <Panel title={E.openVials}>
            {!d.vials.length ? (
              <p className="text-body-s text-muted-foreground">{E.noVials}</p>
            ) : (
              <ul className="divide-border flex flex-col divide-y">
                {d.vials.map((o) => {
                  const v = setup.vaccines.find((x) => x.productId === o.product);
                  const hrs = v ? vialHours(v.vaccine, o.total) : null;
                  const until = hrs ? Date.parse(o.opened) + hrs * HOUR : null;
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-2 py-2.5">
                      <span className="font-medium">{v ? vname(v.vaccine) : o.batch}</span>
                      <span className="text-body-s text-muted-foreground">
                        {fill(E.vialLine, { time: time(Date.parse(o.opened)), used: o.used, total: o.total })}
                      </span>
                      {until && until < now ? (
                        <LatePill>{E.vialPast}</LatePill>
                      ) : until ? (
                        <Pill>{hrs! <= 6 ? `${E.vialKeep6} · ${fill(E.vialBy, { time: time(until) })}` : `${E.vialKeep28} · ${fill(E.vialUntil, { date: date(until) })}`}</Pill>
                      ) : null}
                      {o.total - o.used > 0 ? <DiscardVial vialId={o.id} left={o.total - o.used} /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
        <Panel title={E.control} note={E.controlHint}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] tabular-nums">
              <thead className="text-muted-foreground text-left text-[12.5px]">
                <tr>
                  {[E.vaccine, E.opening, E.received, E.given, E.wasted, E.balance].map((h) => (
                    <th key={h} className="py-2 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {setup.vaccines.map((v) => {
                  const c = d.control.find((x) => x.product === v.productId);
                  return (
                    <tr key={v.vaccine}>
                      <td className="py-2 pr-3">{vname(v.vaccine)}</td>
                      <td className="py-2 pr-3">{c?.opening ?? 0}</td>
                      <td className="py-2 pr-3">{c?.received ?? 0}</td>
                      <td className="py-2 pr-3">{c?.given ?? 0}</td>
                      <td className="py-2 pr-3">{c?.wasted ?? 0}</td>
                      <td className="py-2 pr-3 font-semibold">{c?.balance ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  }

  // Clinic, clients and defaulters: the register.
  const atEpi = Object.fromEntries(setup.vaccines.map((v) => [v.vaccine, usable(v.productId)?.usable ?? 0]));
  const list = d.clients.map((c) => {
    const plan = epiPlan(c.c, c.given, now);
    return { ...c, plan, st: epiStatus(plan, c.appt) };
  });
  const t0 = day0(now);
  const statusPill = (st: (typeof list)[number]["st"]) =>
    st.k === "overdue" ? (
      <LatePill>{fill(E.late, { n: st.late })}</LatePill>
    ) : st.k === "due" ? (
      <Pill>{E.due}</Pill>
    ) : st.k === "ok" ? (
      <Pill>{fill(E.back, { date: date(st.appt) })}</Pill>
    ) : (
      <Pill tone="passed">{E.complete}</Pill>
    );
  const row = (c: (typeof list)[number], extra?: string) => (
    <li key={c.c.id}>
      <Link href={`${BASE}?tab=clients&client=${c.c.id}`} className="hover:bg-ink-50 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2">
        <span className="font-medium">{c.c.name}</span>
        <span className="text-body-s text-muted-foreground">
          {E.kindShort[c.c.kind]} · {c.c.cardNo}
          {extra ? ` · ${extra}` : ""}
        </span>
        <span className="ml-auto">{statusPill(c.st)}</span>
      </Link>
    </li>
  );
  const sel = tab === "clients" && typeof sp.client === "string" ? list.find((c) => c.c.id === sp.client) : undefined;

  let body;
  if (tab === "clinic") {
    const today = list.filter((c) => c.st.k === "due" || (c.appt != null && c.appt === t0));
    const week = list.filter((c) => c.st.k === "ok" && c.st.appt > t0 && c.st.appt <= t0 + 7 * DAY);
    const k = new Date(now + 3 * HOUR);
    const month = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 3 * HOUR;
    const monthDoses = list.flatMap((c) =>
      c.plan.filter((p) => p.rec && p.rec.at >= month).map((p) => ({ lab: p.lab, lateDays: p.due == null ? null : Math.round((day0(p.rec!.at) - p.due) / DAY) })),
    );
    const ind = indicators({
      clients: list.map((c) => ({ c: c.c, plan: c.plan })),
      month: monthDoses,
      given: d.usable.reduce((a, u) => a + u.given_m, 0),
      wasted: d.usable.reduce((a, u) => a + u.wasted_m, 0),
      zeroStock: setup.vaccines.filter((v) => !atEpi[v.vaccine]).length,
      now,
    });
    const pct = (n: number | null) => (n == null ? E.noData : fill(E.pct, { n }));
    body = (
      <>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={E.dueToday} action={<RegisterButton now={now} />}>
            {today.length ? <ul className="divide-border flex flex-col divide-y">{today.map((c) => row(c))}</ul> : <p className="text-body-s text-muted-foreground">{E.dueTodayNone}</p>}
          </Panel>
          <Panel title={E.backThisWeek}>
            {week.length ? <ul className="divide-border flex flex-col divide-y">{week.map((c) => row(c))}</ul> : <p className="text-body-s text-muted-foreground">{E.backNone}</p>}
          </Panel>
        </div>
        <Panel title={E.indicators} note={E.indicatorsHint}>
          <KeyFigureGrid>
            <KeyFigure label={E.fic} value={ind.fic.pct} unit="%" sub={`${ind.fic.n} / ${ind.fic.of}`} />
            <KeyFigure label={E.zeroDose} value={ind.zeroDose} />
            <KeyFigure label={E.timeliness} value={ind.timeliness} unit="%" />
            <KeyFigure label={E.wastage} value={ind.wastage} unit="%" />
            <KeyFigure label={E.stockouts} value={ind.zeroStock} />
            <KeyFigure label={E.target} value={null} sub={E.targetNotSet} />
          </KeyFigureGrid>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-heading-s mb-1">{E.dosesByAntigen}</h3>
              {ind.byAntigen.length ? (
                <p className="text-body-s tabular-nums">{ind.byAntigen.map((a) => `${a.lab} ${a.n}`).join(" · ")}</p>
              ) : (
                <p className="text-body-s text-muted-foreground">{E.noData}</p>
              )}
              <p className="text-body-s mt-1 tabular-nums">
                {E.td1} {ind.td1} · {E.protectedAtBirth} {ind.protectedAtBirth} · {E.hpv} {ind.hpv}
              </p>
            </div>
            <div>
              <h3 className="text-heading-s mb-1">{E.dropouts}</h3>
              <ul className="text-body-s tabular-nums">
                {ind.dropouts.map((x) => (
                  <li key={x.label}>
                    {x.label}: {pct(x.pct)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      </>
    );
  } else if (tab === "defaulters") {
    const late = list.filter((c) => c.st.k === "overdue").sort((a, b) => (b.st.k === "overdue" ? b.st.late : 0) - (a.st.k === "overdue" ? a.st.late : 0));
    body = (
      <Panel title={E.defaulters}>
        {late.length ? (
          <ul className="divide-border flex flex-col divide-y">
            {late.map((c) => row(c, [c.c.carer, c.c.village].filter(Boolean).join(" · ")))}
          </ul>
        ) : (
          <p className="text-body-s text-muted-foreground">{E.defaultersNone}</p>
        )}
      </Panel>
    );
  } else if (sel) {
    const givenN = sel.plan.filter((p) => p.s === "given").length;
    body = (
      <Panel
        title={sel.c.name}
        note={`${E.kindShort[sel.c.kind]} · ${sel.c.cardNo} · ${fill(E.born, { date: date(sel.c.dob) })} · ${sel.c.carer}`}
        action={<VaccinateButton clientId={sel.c.id} name={sel.c.name} plan={sel.plan} atEpi={atEpi} now={now} />}
      >
        <p className="text-body-s mb-3 tabular-nums">
          {givenN} {E.dosesGiven}
          {sel.st.k === "ok" ? ` · ${E.nextVisit} ${date(sel.st.appt)}` : ""}
        </p>
        <h3 className="text-heading-s mb-1">{E.card_}</h3>
        <ul className="divide-border flex flex-col divide-y">
          {sel.plan.map((p) => (
            <li key={p.lab} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="w-16 font-medium">{p.lab}</span>
              <span className="text-body-s text-muted-foreground">
                {p.contact} · {p.site}
              </span>
              <span className="text-body-s ml-auto tabular-nums">
                {p.rec ? fill(E.givenOn, { date: date(p.rec.at) }) : p.due != null ? fill(E.dueOn, { date: date(p.due) }) : p.after ? fill(E.after, { lab: p.after }) : ""}
              </span>
              {p.s === "overdue" ? <LatePill>{E.key.overdue!}</LatePill> : <Pill tone={p.s === "given" ? "passed" : "neutral"}>{E.key[p.s]!}</Pill>}
            </li>
          ))}
        </ul>
        <p className="text-caption text-muted-foreground mt-2">{E.keyHint}</p>
        <h3 className="text-heading-s mt-4 mb-1">{E.aefiTitle}</h3>
        {Object.entries(sel.given).some(([, g]) => g.aefi !== "none") ? (
          <ul className="text-body-s">
            {Object.entries(sel.given)
              .filter(([, g]) => g.aefi !== "none")
              .map(([lab, g]) => (
                <li key={lab}>
                  {lab} · {date(g.at)} · {E.aefi[g.aefi]}
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-body-s text-muted-foreground">{E.aefiNone}</p>
        )}
      </Panel>
    );
  } else
    body = (
      <Panel title={E.clients} action={<RegisterButton now={now} />}>
        {list.length ? <ul className="divide-border flex flex-col divide-y">{list.map((c) => row(c))}</ul> : <EmptyState compact title={E.clientsNone} next={E.clientsNext} />}
      </Panel>
    );

  return (
    <div className="flex flex-col gap-4">
      {tabs}
      {body}
    </div>
  );
}
