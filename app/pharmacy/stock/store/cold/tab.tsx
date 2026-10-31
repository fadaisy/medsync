import { EmptyState, KeyFigure, KeyFigureGrid, Panel, Pill } from "@/components/tide/work/kit";
import { FilterChips } from "@/components/tide/work/space";
import { fill, PRW, RULES } from "@/content/pharmacy-rework-patients";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { coldStatus, isLive, monthGrid, pctInRange } from "@/lib/pharmacy/cold/derive";
import { coldChainData } from "@/lib/pharmacy/cold/read";
import { Contents, Excursions, PrintButton, RecordReading, TempChart } from "./_components/cold-client";

const C = PRW.cold;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const t1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

/** Store, Cold chain (rework PRD §6.4): the fridge's live line, excursions, the WHO monthly chart and its contents. */
export async function ColdChainTab({ fridge }: { fridge?: string }) {
  return <ColdChainBody fridge={fridge} base="/pharmacy/stock/store?tab=cold" />;
}

/** The same view, reused by Immunisation's fridge tab with its own base link and its fridges only. */
export async function ColdChainBody({ fridge, base, onlyAt }: { fridge?: string; base: string; onlyAt?: string }) {
  const actor = await requirePharmacyActor();
  const now = new Date().getTime();
  const id = fridge && UUID.test(fridge) ? fridge : null;
  const d = await coldChainData(actor.hospitalId, id, Math.floor(now / 60_000) * 60_000, onlyAt);
  const fridges = onlyAt ? d.fridges.filter((f) => f.locationId === onlyAt) : d.fridges;
  if (!d.fridge || !fridges.length || (onlyAt && d.fridge.locationId !== onlyAt)) return <EmptyState title={C.noFridges} next={C.noFridgesNext} />;
  const f = d.fridge;
  const last = d.series.at(-1);
  const live = isLive(last, now);
  const toAct = d.excursions.filter((e) => !e.ack).length;
  const vals = d.series.filter((p) => p.at >= now - 30 * 86_400_000).map((p) => p.v);
  const pct = pctInRange(d.series.filter((p) => p.at >= now - 30 * 86_400_000));
  const k = new Date(d.monthStart + 3 * 3_600_000);
  const days = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + 1, 0)).getUTCDate();
  const grid = monthGrid({ monthStart: d.monthStart, days, chart: d.chart, sensor: d.sensor, now });
  const freezeSensitive = d.products.some(
    (p) => p.here > 0 && RULES.epi.freezeSensitive.some((v) => p.name.toLowerCase().includes(v)),
  );
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="flex flex-col gap-4">
      {fridges.length > 1 ? (
        <FilterChips
          label={C.fridgesLabel}
          current={f.id}
          chips={fridges.map((x) => ({ key: x.id, label: x.name, href: `${base}${sep}fridge=${x.id}` }))}
        />
      ) : null}
      <Panel
        title={`${f.name} · ${f.place}`}
        note={f.sensor ? (live ? C.live : C.noLive) : C.noSensor}
        action={<RecordReading fridge={f} />}
      >
        <KeyFigureGrid className="xl:grid-cols-4">
          <KeyFigure
            label={C.kpiNow}
            value={last ? t1(last.v) : null}
            unit="°C"
            sub={last ? C.status[coldStatus(last.v)] : undefined}
          />
          <KeyFigure
            label={C.kpiMinMax}
            value={vals.length ? `${t1(Math.min(...vals))} / ${t1(Math.max(...vals))}` : null}
            unit="°C"
          />
          <KeyFigure label={C.kpiInRange} value={pct} unit="%" />
          <KeyFigure label={C.kpiToAct} value={toAct} />
        </KeyFigureGrid>
        <div className="mt-4">
          <TempChart series={d.series} now={now} />
        </div>
      </Panel>
      <Panel title={C.excursions} action={toAct ? <Pill tone="caution">{fill(C.toAct, { n: toAct })}</Pill> : null}>
        <Excursions fridgeId={f.id} list={d.excursions} freezeSensitive={freezeSensitive} />
      </Panel>
      <Panel title={C.contents}>
        <Contents
          fridge={f}
          products={d.products}
          places={d.fridges.filter((x) => x.id !== f.id).map((x) => ({ id: x.locationId, name: `${x.name} · ${x.place}` }))}
        />
      </Panel>
      <Panel title={C.month} action={<PrintButton>{C.monthPrint}</PrintButton>}>
        <MonthChart grid={grid} fridge={f} monthStart={d.monthStart} />
      </Panel>
    </div>
  );
}

function MonthChart({
  grid,
  fridge,
  monthStart,
}: {
  grid: ReturnType<typeof monthGrid>;
  fridge: { code: string; model: string | null; place: string };
  monthStart: number;
}) {
  const M = C.mc;
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", month: "long", year: "numeric" }).format(monthStart);
  const cell = "border-ink-200 border px-0.5 text-center tabular-nums";
  const hhmm = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit" }).format(ms);
  return (
    <div className="flex flex-col gap-2 print:text-[9px]">
      <p className="text-body-s flex flex-wrap gap-x-4">
        <span>
          {M.number} {fridge.code}
        </span>
        <span>
          {M.model} {fridge.model ?? ""}
        </span>
        <span>
          {M.location} {fridge.place}
        </span>
        <span>
          {M.monthW} {month}
        </span>
      </p>
      <div className="overflow-x-auto">
        <table className="text-[11px]">
          <thead>
            <tr>
              <th className={cell}>{M.day}</th>
              {grid.days.map((d) => (
                <th key={d.d} colSpan={2} className={`${cell} ${d.today ? "bg-ink-100" : ""}`}>
                  {d.d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r} className={r > RULES.cold.high || r < RULES.cold.low ? "bg-ink-50" : ""}>
                <th className={cell}>{t1(r).replace(".0", "")}</th>
                {grid.days.flatMap((d) => [
                  <td key={`${d.d}a`} className={`${cell} min-w-4`}>
                    {d.amRow === r ? "×" : ""}
                  </td>,
                  <td key={`${d.d}p`} className={`${cell} min-w-4`}>
                    {d.pmRow === r ? "×" : ""}
                  </td>,
                ])}
              </tr>
            ))}
            <tr>
              <th className={cell}>{M.fi}</th>
              {grid.days.map((d) => (
                <td key={d.d} colSpan={2} className={cell}>
                  {d.fi === "x" ? "X" : d.fi === "ok" ? M.ok : ""}
                </td>
              ))}
            </tr>
            <tr>
              <th className={cell}>{M.initials}</th>
              {grid.days.flatMap((d) => [
                <td key={`${d.d}a`} className={cell}>
                  {d.am?.initials ?? ""}
                </td>,
                <td key={`${d.d}p`} className={cell}>
                  {d.pm?.initials ?? ""}
                </td>,
              ])}
            </tr>
            {(
              [
                [M.highBand, (s: NonNullable<(typeof grid.days)[number]["sensor"]>) => (s.hiAlarm ? hhmm(s.hiAlarm) : M.ok)],
                [M.max, (s: NonNullable<(typeof grid.days)[number]["sensor"]>) => t1(s.max)],
                [M.lowBand, (s: NonNullable<(typeof grid.days)[number]["sensor"]>) => (s.loAlarm ? hhmm(s.loAlarm) : M.ok)],
                [M.min, (s: NonNullable<(typeof grid.days)[number]["sensor"]>) => t1(s.min)],
              ] as const
            ).map(([label, val]) => (
              <tr key={label}>
                <th className={`${cell} whitespace-nowrap`}>{label}</th>
                {grid.days.map((d) => (
                  <td key={d.d} colSpan={2} className={cell}>
                    {d.sensor ? val(d.sensor) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-muted-foreground">{M.key}</p>
    </div>
  );
}
