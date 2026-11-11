import type { EmrDb } from "@/lib/emr/db";
import type { Handover } from "@/lib/pharmacy/handover/derive";
import { cache } from "react";

import { EmptyState, KeyFigure, KeyFigureGrid, Panel, Pill } from "@/components/tide/work/kit";
import { CTL } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { hm, when } from "@/lib/pharmacy/cd/sql";
import { isInCharge } from "@/lib/pharmacy/cd/store";
import {
  hoFlags,
  hoMine,
  nextFor,
  openLines,
  slotNow,
  slotsBetween,
} from "@/lib/pharmacy/handover/derive";
import { loadHandovers } from "@/lib/pharmacy/handover/read";
import { AcceptButton, FlagAction, StartHandover } from "./_components/handover-client";

export const dynamic = "force-dynamic";

const H = CTL.handover;

/** One read per request: stations, the week's handovers and misses (3 queries) and whether the viewer is the in-charge. */
const handoverPage = cache(async (hospitalId: string, userId: string) => {
  const d = db as unknown as EmrDb;
  const [data, inCharge] = await Promise.all([
    loadHandovers(d, hospitalId),
    isInCharge(d, userId, hospitalId),
  ]);
  return { ...data, inCharge };
});

/**
 * Shift handover (rework PRD §6.5): your own station's handover at 08:00 and 17:00 (a blind count, keys, seal and open
 * items), the handovers waiting for you to accept, and for the in-charge every station's. The shell owns the h1.
 */
export default async function HandoverPage() {
  const actor = await requirePharmacyActor();
  const data = await handoverPage(actor.hospitalId, actor.userId);
  const now = new Date().getTime();
  const station = data.places.find((p) => p.id === actor.pointId) ?? null;
  const placeName = Object.fromEntries(data.places.map((p) => [p.id, p.name]));
  const flags = hoMine(hoFlags({ ...data, now }), data.inCharge, station?.id ?? null);
  const toAccept = data.handovers.filter((h) => !h.acceptedAt && h.toUserId === actor.userId);
  const sent = data.handovers.filter(
    (h) =>
      !h.acceptedAt && h.toUserId !== actor.userId && (data.inCharge || h.placeId === station?.id),
  );
  const log = data.handovers.filter((h) => data.inCharge || h.placeId === station?.id);
  const prevAt = (h: Handover) =>
    data.handovers.find((x) => x.placeId === h.placeId && x.at < h.at)?.at ??
    new Date(h.at.getTime() - 86_400_000);

  return (
    <div className="flex flex-col gap-4">
      {toAccept.map((h) => (
        <Panel
          key={h.id}
          title={H.toAccept}
          note={fill(H.toAcceptNote, { from: h.from, place: placeName[h.placeId] ?? "" })}
        >
          <HandoverSummary h={h} />
          <div className="mt-3">
            <AcceptButton handoverId={h.id} />
          </div>
        </Panel>
      ))}

      <Panel title={H.yourStation}>
        {station ? (
          <StationCard
            station={station}
            next={nextFor(data.handovers, data.misses, station.id, now)}
            slot={slotNow(data.handovers, station.id, now)}
            last={data.handovers.find((h) => h.placeId === station.id) ?? null}
            now={now}
          />
        ) : (
          <EmptyState compact title={H.noStation} />
        )}
        {sent.map((h) => (
          <p key={h.id} className="text-body-s text-ink-600 mt-2">
            {fill(H.waitingFor, { name: h.to })} · {placeName[h.placeId]}
          </p>
        ))}
      </Panel>

      {data.inCharge ? (
        <Panel title={H.oversight} note={H.oversightNote}>
          <KeyFigureGrid>
            <KeyFigure
              label={H.kpiSlots}
              value={`${slotted(data.handovers, now, 8)}/${data.places.length}`}
              sub={fill(H.kpiSlots17, { n: slotted(data.handovers, now, 17) })}
            />
            <KeyFigure label={H.kpiMissed} value={flags.filter((f) => f.k === "miss").length} />
            <KeyFigure label={H.kpiDiff} value={flags.filter((f) => f.k === "diff").length} />
            <KeyFigure
              label={H.kpiToday}
              value={data.handovers.filter((h) => now - h.at.getTime() < 86_400_000).length}
            />
          </KeyFigureGrid>
        </Panel>
      ) : null}

      <Panel title={data.inCharge ? H.toActAll : H.toActMine} note={H.toActNote}>
        {flags.length ? (
          <ul className="flex flex-col gap-2">
            {flags.map((f) => {
              const place = placeName[f.placeId] ?? "";
              const title =
                f.k === "miss"
                  ? fill(H.flagMiss, { place, when: when(f.slot) })
                  : f.k === "due"
                    ? fill(H.flagDue, {
                        place,
                        when:
                          f.slot < now
                            ? fill(H.flagDueLate, { n: Math.round((now - f.slot) / 60_000) })
                            : fill(H.flagDueAt, { time: hm(f.slot) }),
                      })
                    : fill(H.flagDiff, {
                        med: f.line.medicineName,
                        place,
                        counted: f.line.counted,
                        expected: f.line.expected,
                      });
              const meta =
                f.k === "miss"
                  ? fill(H.flagMissMeta, {
                      from: H.shiftShort[slotFrom(f.slot)],
                      to: H.shiftShort[slotTo(f.slot)],
                    })
                  : f.k === "due"
                    ? H.flagDueMeta
                    : fill(H.flagDiffMeta, {
                        when: when(f.handover.at),
                        from: f.handover.from,
                        to: f.handover.to,
                        cd: f.line.controlled ? H.flagDiffCd : "",
                      });
              return (
                <li
                  key={f.id}
                  className="bg-card shadow-tide-card rounded-tide-row flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill tone={f.k === "due" ? "neutral" : "caution"}>
                        {f.k === "miss" ? H.tagMiss : f.k === "diff" ? H.tagCount : H.next}
                      </Pill>
                      <span className="text-[14px] font-semibold">{title}</span>
                    </span>
                    <span className="text-caption text-ink-600">{meta}</span>
                  </div>
                  {f.k === "miss" ? (
                    <FlagAction kind="miss" placeId={f.placeId} slot={f.slot} />
                  ) : f.k === "diff" ? (
                    <FlagAction
                      kind="diff"
                      handoverId={f.handover.id}
                      placeId={f.placeId}
                      placeName={place}
                      line={f.line}
                      at={f.handover.at.toISOString()}
                      from={prevAt(f.handover).toISOString()}
                    />
                  ) : f.placeId === station?.id ? null : (
                    <span className="text-caption text-ink-600">{place}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            compact
            title={
              data.inCharge ? H.nothingAll : fill(H.nothingMine, { place: station?.name ?? "" })
            }
          />
        )}
        {!data.inCharge ? (
          <p className="text-caption text-ink-600 mt-3">{H.otherStations}</p>
        ) : null}
      </Panel>

      <Panel title={data.inCharge || !station ? H.log : fill(H.logMine, { place: station.name })}>
        {log.length ? (
          <ul className="flex flex-col gap-2">
            {log.map((h) => (
              <li
                key={h.id}
                className="bg-card shadow-tide-card rounded-tide-row flex flex-col gap-1 px-4 py-3"
              >
                <span className="text-[14px] font-semibold">
                  {when(h.at)} · {placeName[h.placeId]} · {h.from} → {h.to}
                </span>
                <HandoverSummary h={h} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title={H.nothingAll} />
        )}
      </Panel>
    </div>
  );
}

const slotFrom = (slot: number) =>
  new Date(slot + 3 * 3_600_000).getUTCHours() === 8 ? "night" : "day";
const slotTo = (slot: number) => (slotFrom(slot) === "night" ? "day" : "night");
const slotted = (hs: Handover[], now: number, hour: number) => {
  const s = slotsBetween(now - 86_400_000, now)
    .filter((t) => new Date(t + 3 * 3_600_000).getUTCHours() === hour)
    .pop();
  return s ? new Set(hs.filter((h) => h.slotAt?.getTime() === s).map((h) => h.placeId)).size : 0;
};

function HandoverSummary({ h }: { h: Handover }) {
  const open = openLines(h).length;
  const result = !h.acceptedAt
    ? H.result.pending
    : open
      ? fill(H.result.open, { n: open })
      : h.lines.some((l) => l.counted !== l.expected)
        ? H.result.resolved
        : H.result.ok;
  return (
    <div className="text-caption text-ink-600 flex flex-col gap-1">
      <span>
        {h.lines.length
          ? fill(H.counted, {
              items: h.lines.map((l) => `${l.medicineName} ${l.counted}`).join(", "),
            })
          : H.keysOnly}
      </span>
      <span>
        {h.keys ? H.keys : H.noKeys}
        {h.seal ? ` · ${fill(h.sealNew ? H.sealNew : H.seal, { no: h.seal })}` : ""}
        {h.items ? ` · ${CTL.hoDialog.s4.replace("{n}", String(h.items))}` : ""}
        {h.slotAt ? "" : ` · ${H.midShift}`}
      </span>
      <span>
        <Pill tone={open ? "caution" : "neutral"}>{result}</Pill>
      </span>
    </div>
  );
}

function StationCard({
  station,
  next,
  slot,
  last,
  now,
}: {
  station: { id: string; name: string };
  next: number | null;
  slot: number | null;
  last: Handover | null;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">{station.name}</span>
        <span className="text-caption text-ink-600">
          {last ? fill(H.last, { from: last.from, to: last.to, when: when(last.at) }) : H.keysOnly}
        </span>
        {next ? (
          <span className="text-caption text-ink-600">
            {H.next}: {hm(next)} ·{" "}
            {next < now
              ? fill(H.late, { n: Math.round((now - next) / 60_000) })
              : fill(H.inTime, { t: `${Math.round((next - now) / 60_000)} min` })}
          </span>
        ) : null}
      </div>
      <StartHandover
        locationId={station.id}
        placeName={station.name}
        slotAt={slot ? new Date(slot).toISOString() : null}
        label={slot ? fill(H.start, { time: hm(slot) }) : H.now}
      />
    </div>
  );
}
