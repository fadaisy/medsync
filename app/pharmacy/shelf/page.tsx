import type { DialogBatch } from "../stock/_components/stock-dialogs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KeyFigure, KeyFigureGrid, NotSet, Panel, Pill } from "@/app/lab/_components/v2/kit";
import { PillTabs, SpaceHeader } from "@/app/lab/_components/v2/space";
import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";
import { PHWS2_SHELF as S } from "@/content/pharmacy-workspace-v2-shelf";
import { expiryText } from "@/content/pharmacy-stock";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { controlledMedicineIds, getControlledRegister } from "@/lib/pharmacy/controlled-read";
import { dosesCountFor } from "@/lib/pharmacy/page-data";
import { getStockPage } from "@/lib/pharmacy/stock/read";
import { DRUGS } from "@/lib/prescribing/formulary";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { hasTab, pharmacyV2 } from "../_lib/v2";
import { ControlledBody } from "../controlled/body";
import { EmergencyDosesBody } from "../emergency-doses/body";
import { AdjustDialog } from "../stock/_components/stock-dialogs";
import { StockBody } from "../stock/body";
import { shelfStrip, shelfView } from "./_lib/strip";

export const metadata: Metadata = { title: "Shelf · Pharmacy" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});
const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});

const LINK = "text-body-s text-primary font-medium underline-offset-4 hover:underline";

/**
 * Shelf (GATE A §3, board Shelf): Stock · Controlled drugs · Emergency doses (`?view=`), each tab rendering the old
 * page's own body, so every filter, dialog and print stays (Law 2). Above them the strip from getStockPage; beside
 * Stock the open controlled differences and the 7-day emergency dose count. GATE A §1 drops the Counts tab (the
 * "Not counted" filter stays in the stock table), the cold chain figure and emergency dose matching.
 */
export default async function ShelfPage({ searchParams }: { searchParams: Promise<SP> }) {
  const v2 = await pharmacyV2();
  if (!v2.live) notFound();
  const sp = await searchParams;
  const has = (k: string) => hasTab(v2, "shelf", k);
  const view = shelfView(sp, has);
  if (!view) notFound();

  const h = v2.scope.hospitalId;
  const actor = has("stock") || has("controlled") ? await requirePharmacyActor() : null;
  const point = actor?.points.find((p) => p.id === actor.pointId) ?? null;
  const canStock = !!actor?.access.permissions.has("pharmacy.stock");
  const now = new Date();
  const [stock, register, doses, signed] = await Promise.all([
    actor && point && has("stock") ? getStockPage(actor, point, now) : null,
    point && has("controlled") ? getControlledRegister(h, point.id, null) : null,
    has("emergency") ? dosesCountFor(h) : null,
    point && canStock && view === "stock" ? controlledMedicineIds(db, h) : null,
  ]);

  const tabs = v2.tabs
    .filter((t) => t.place === "shelf")
    .map((t) => ({
      key: t.key,
      label: (PHWS2.tabs.shelf as Record<string, string>)[t.key] ?? t.key,
      href: t.href,
      count:
        t.key === "controlled" ? (register?.differences.length ?? null) : t.key === "emergency" ? doses : null,
      attention: t.key === "controlled",
    }));

  // CD-5, as the Stock page: a controlled product moves only with a witness, on Controlled drugs.
  const plain = (m: string) => !signed?.has(m) && !DRUGS.find((d) => d.id === m)?.flags.controlled;
  const unitOf = new Map(stock?.products.map((p) => [p.id, p.issueUnit]));
  const batches: DialogBatch[] = (stock?.batches ?? [])
    .filter((b) => plain(b.medicineId))
    .map((b) => ({
      id: b.id,
      productId: b.productId,
      medicineId: b.medicineId,
      medicineName: b.medicineName,
      batchNumber: b.batchNumber,
      expiryText: expiryText(b),
      issueUnit: unitOf.get(b.productId) ?? "",
    }));

  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp))
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  const here = `/pharmacy/shelf${q.size ? `?${q}` : ""}`;

  const strip = stock && point ? shelfStrip(stock.rows, stock.figures) : null;
  const F = S.strip;

  const controlledCard =
    view === "stock" && register ? (
      <Panel
        title={S.controlled.title}
        note={S.controlled.note}
        action={
          <Link href="/pharmacy/shelf?view=controlled" className={LINK}>
            {S.controlled.register}
          </Link>
        }
      >
        {register.differences.length ? (
          <>
            <Pill tone="caution">
              {register.differences.length === 1
                ? S.controlled.openOne
                : fill(S.controlled.open, { n: register.differences.length })}
            </Pill>
            <ul className="text-body-s flex flex-col gap-1">
              {register.differences.slice(0, 3).map((d) => (
                <li key={d.id}>
                  {fill(S.controlled.line, {
                    batch: d.batchNumber,
                    counted: d.counted,
                    recorded: d.recorded,
                  })}
                </li>
              ))}
            </ul>
            {register.differences.length > 3 ? (
              <p className="text-caption text-muted-foreground">
                {fill(S.controlled.more, { n: register.differences.length - 3 })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-body-s text-muted-foreground">{S.controlled.none}</p>
        )}
      </Panel>
    ) : null;

  const emergencyCard =
    view === "stock" && doses !== null ? (
      <Panel
        title={S.emergency.title}
        action={
          <Link href="/pharmacy/shelf?view=emergency" className={LINK}>
            {S.emergency.see}
          </Link>
        }
      >
        <span className="text-[26px] leading-[30px] font-semibold tabular-nums">{doses}</span>
        <p className="text-body-s text-muted-foreground">{S.emergency.body}</p>
      </Panel>
    ) : null;

  return (
    <div className="flex flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-6 sm:px-6">
        <SpaceHeader
          className="mb-0"
          tabs={<PillTabs tabs={tabs} current={view} label={S.tabsLabel} />}
          action={
            view === "stock" && canStock && point && stock ? (
              <AdjustDialog what={point.name} batches={batches} label={S.adjust} variant="primary" />
            ) : null
          }
        />
        {strip && point ? (
          <Panel
            title={fill(F.label, { point: point.name })}
            note={fill(S.asOf, { time: time.format(now) })}
            action={
              <Link href={here} className={LINK}>
                {S.refresh}
              </Link>
            }
          >
            <KeyFigureGrid className="xl:grid-cols-4">
              <KeyFigure label={F.medicines} value={strip.medicines} />
              <KeyFigure
                label={F.out}
                value={strip.out}
                sub={
                  strip.outVital === null ? (
                    <NotSet
                      label={F.vitalNotSet}
                      href="/pharmacy/setup?view=national"
                      canSet={hasTab(v2, "setup", "national")}
                    />
                  ) : strip.outVital > 0 ? (
                    <Pill tone="caution">{fill(F.vital, { n: strip.outVital })}</Pill>
                  ) : (
                    fill(F.vital, { n: 0 })
                  )
                }
              />
              <KeyFigure label={F.low} value={strip.low} sub={F.lowSub} />
              <KeyFigure
                label={F.lastCount}
                value={strip.lastCount ? time.format(strip.lastCount) : F.lastCountNone}
                sub={strip.lastCount ? day.format(strip.lastCount) : undefined}
              />
            </KeyFigureGrid>
          </Panel>
        ) : null}
      </div>
      {view === "stock" ? (
        controlledCard || emergencyCard ? (
          <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pr-6">
            <div className="min-w-0">
              <StockBody />
            </div>
            <aside className="flex flex-col gap-4 px-4 pb-6 sm:px-6 lg:px-0 lg:pt-6">
              {controlledCard}
              {emergencyCard}
            </aside>
          </div>
        ) : (
          <StockBody />
        )
      ) : view === "controlled" ? (
        <ControlledBody searchParams={Promise.resolve(sp as { medicine?: string; from?: string; to?: string })} />
      ) : (
        <EmergencyDosesBody searchParams={Promise.resolve(sp as { cart?: string; period?: string })} />
      )}
    </div>
  );
}
