"use client";

import type { PatientIdentity } from "@/components/emr/orders/model";
import type { DataTableColumn, SortDirection } from "@/components/ui/data-table";
import type {
  Lane,
  QueueEncounter,
  QueueLine,
  QueueRow,
  RowState,
  SortKey,
} from "@/lib/pharmacy/queue";
import type { QueuePeriod } from "@/lib/pharmacy/read";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ClockIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { TabList } from "@/components/medsync/tab-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { PHARMACY } from "@/content/pharmacy";
import { formatDuration, serverNowAt } from "@/lib/lab/turnaround";
import { computeQueue } from "@/lib/pharmacy/queue";
import { cn } from "@/lib/utils";

/**
 * The pharmacy queue (§5.3; canvas 0.1). The server sends the period's stored lines, their
 * encounters, the revealed identities and its own "now"; this screen projects, filters and sorts
 * in the browser, so a lane or state switch needs no request (§11). The URL holds the view
 * (?lane=&state=&from=&sort=, ids only) and the period (?period=, read on the server), so back,
 * forward and reload restore it. The clock ticks every 30 seconds from server time and pauses while
 * the tab is hidden; it never fetches. Links to a prescription never prefetch: opening one reveals
 * the patient and writes a log row (RV-6), so it happens only when someone opens it.
 */

type WireLine = Omit<QueueLine, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export interface QueuePayload {
  hospitalId: string;
  hospitalName: string;
  period: QueuePeriod;
  lines: WireLine[];
  encounters: QueueEncounter[];
  identities: Record<string, PatientIdentity>;
  defaultLane: Lane | "all";
  /** The view the URL asked for, read on the server so the first render matches it. */
  initial: View;
  serverNowIso: string;
  timeZone: string;
}

export type View = {
  lane: string | null;
  state: string | null;
  from: string | null;
  sort: string | null;
};

const TICK_MS = 30_000;
const Q = PHARMACY.queue;
const LANES: readonly (Lane | "all")[] = ["window", "ward", "open", "all"];
const STATES: readonly RowState[] = ["prescribed", "awaiting_cosign", "not_continued", "cancelled"];
const SORTS: readonly SortKey[] = ["written", "from", "state"];

function readUrl(): View {
  const p = new URLSearchParams(window.location.search);
  return { lane: p.get("lane"), state: p.get("state"), from: p.get("from"), sort: p.get("sort") };
}

export function QueueScreen({ payload, notice }: { payload: QueuePayload; notice: ReactNode }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [announce, setAnnounce] = useState("");
  const [view, setView] = useState<View>(payload.initial);
  const serverMs = useMemo(() => new Date(payload.serverNowIso).getTime(), [payload.serverNowIso]);
  const [tick, setTick] = useState({ serverMs, now: new Date(serverMs) });
  const now = tick.serverMs === serverMs ? tick.now : new Date(serverMs);

  useEffect(() => {
    const onPop = () => setView(readUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Law 9: server time plus the page's age on the monotonic clock; paused while hidden.
  useEffect(() => {
    const loadedAt = performance.now();
    const step = () => {
      if (document.visibilityState === "visible")
        setTick({ serverMs, now: serverNowAt(serverMs, loadedAt, performance.now()) });
    };
    const id = window.setInterval(step, TICK_MS);
    document.addEventListener("visibilitychange", step);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", step);
    };
  }, [serverMs]);

  const setFilter = useCallback((patch: Partial<View>) => {
    setView((v) => {
      const next = { ...v, ...patch };
      const p = new URLSearchParams(window.location.search);
      for (const [k, value] of Object.entries(next)) {
        if (value) p.set(k, value);
        else p.delete(k);
      }
      const qs = p.toString();
      window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
      return next;
    });
  }, []);

  const setPeriod = (period: string) => {
    const p = new URLSearchParams(window.location.search);
    if (period === "today") p.delete("period");
    else p.set("period", period);
    const qs = p.toString();
    router.push(qs ? `?${qs}` : window.location.pathname);
  };

  const lines = useMemo<QueueLine[]>(
    () =>
      payload.lines.map((l) => ({
        ...l,
        createdAt: new Date(l.createdAt),
        updatedAt: new Date(l.updatedAt),
      })),
    [payload.lines],
  );
  const encounters = useMemo(
    () => new Map(payload.encounters.map((e) => [e.id, e])),
    [payload.encounters],
  );
  const lane = (LANES as readonly string[]).includes(view.lane ?? "")
    ? (view.lane as Lane | "all")
    : payload.defaultLane;
  const state = (STATES as readonly string[]).includes(view.state ?? "")
    ? (view.state as RowState)
    : "all";
  const desc = view.sort?.startsWith("-") ?? false;
  const sortKey = (view.sort?.replace(/^-/, "") ?? "written") as SortKey;
  const sort = SORTS.includes(sortKey) ? sortKey : "written";
  const q = useMemo(
    () =>
      computeQueue({
        lines,
        encounters,
        hospitalId: payload.hospitalId,
        filters: { lane, state, from: view.from ?? "all", sort, desc },
      }),
    [lines, encounters, payload.hospitalId, lane, state, view.from, sort, desc],
  );
  const places = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of payload.encounters)
      if (e.departmentId && e.departmentName) m.set(e.departmentId, e.departmentName);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [payload.encounters]);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: payload.timeZone,
      }),
    [payload.timeZone],
  );
  const updated = fmt.format(new Date(serverMs));
  const refresh = () => startRefresh(() => router.refresh());
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) setAnnounce(Q.refreshed(q.total));
    wasRefreshing.current = refreshing;
  }, [refreshing, q.total]);

  const tableId = useId();
  const identity = (r: QueueRow) =>
    payload.identities[r.patientUserId] ?? { name: "Name withheld", mrn: "", ageSex: "" };
  const written = (r: QueueRow) =>
    `${fmt.format(r.writtenAt)} · ${formatDuration((now.getTime() - r.writtenAt.getTime()) / 60_000)}`;

  const columns: DataTableColumn<QueueRow>[] = [
    {
      id: "patient",
      header: Q.columns.patient,
      cell: (r) => <PatientCell id={`p-${r.key}`} identity={identity(r)} />,
    },
    {
      id: "medicines",
      header: Q.columns.medicines,
      cell: (r) => <Medicines id={`m-${r.key}`} row={r} />,
    },
    {
      id: "from",
      header: Q.columns.from,
      sortable: true,
      cell: (r) => <FromCell row={r} />,
    },
    {
      id: "state",
      header: Q.columns.state,
      sortable: true,
      cell: (r) => <StateCell row={r} fmt={fmt} />,
    },
    {
      id: "checks",
      header: Q.columns.checks,
      cell: (r) => <ChecksCell checks={r.checks} />,
    },
    {
      id: "written",
      header: Q.columns.written,
      sortable: true,
      className: "font-mono tabular-nums whitespace-nowrap",
      cell: (r) => written(r),
    },
    {
      id: "action",
      header: <span className="sr-only">{Q.columns.action}</span>,
      headerClassName: "w-px",
      className: "text-right",
      cell: (r) => <OpenLink row={r} prefix="" />,
    },
  ];

  const otherLane = (["window", "ward", "open"] as const).filter((l) => l !== lane);
  const elsewhere = otherLane.reduce((n, l) => n + q.laneCounts[l], 0);
  const empty =
    q.total === 0 ? (
      Q.emptyAll
    ) : q.rows.length === 0 && lane !== "all" && elsewhere > 0 ? (
      <span className="inline-flex flex-wrap items-center justify-center gap-2">
        {Q.emptyLane
          .replace("{lane}", PHARMACY.laneInFooter[lane])
          .replace("{n}", String(elsewhere))
          .replace("{other lane}", Q.otherLanes)}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setFilter({ lane: "all" })}
        >
          {Q.showAll}
        </Button>
      </span>
    ) : (
      Q.emptyAll
    );

  const footer = Q.footer
    .replace("{n}", String(q.rows.length))
    .replace("{N}", String(q.total))
    .replace("{period}", PHARMACY.periodInFooter[payload.period])
    .replace("{lane}", PHARMACY.laneInFooter[lane]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${payload.hospitalName} · ${PHARMACY.place}`}
        placeInTopBar
        title={Q.titleFor[payload.period]}
        right={
          <>
            <span className="text-body-s text-muted-foreground">
              {Q.updated} <span className="font-mono tabular-nums">{updated}</span>
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={refreshing}
              onClick={refresh}
            >
              {Q.refresh}
            </Button>
          </>
        }
      />
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>

      {notice}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <TabList
          label={Q.laneLabel}
          controls={tableId}
          value={lane}
          options={LANES.map((l) => ({
            value: l,
            label: PHARMACY.lane[l],
            count: q.laneCounts[l],
          }))}
          onChange={(l) => setFilter({ lane: l })}
        />
        <span className="flex-1" />
        <TabList
          label={Q.stateLabel}
          controls={tableId}
          value={state}
          options={[
            { value: "all" as const, label: PHARMACY.rowState.all, count: q.stateCounts.all },
            ...STATES.map((s) => ({
              value: s,
              label: PHARMACY.rowState[s],
              count: q.stateCounts[s],
            })),
          ]}
          onChange={(s) => setFilter({ state: s === "all" ? null : s })}
        />
        {places.length ? (
          <label className="flex items-center">
            <span className="sr-only">{Q.fromLabel}</span>
            <select
              value={view.from ?? ""}
              onChange={(e) => setFilter({ from: e.target.value || null })}
              className="border-input bg-card text-body-s focus-visible:shadow-focus h-9 min-h-11 rounded-md border px-2 outline-none sm:min-h-9"
            >
              <option value="">{Q.allPlaces}</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex items-center">
          <span className="sr-only">{Q.periodLabel}</span>
          <select
            value={payload.period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border-input bg-card text-body-s focus-visible:shadow-focus h-9 min-h-11 rounded-md border px-2 outline-none sm:min-h-9"
          >
            {(["today", "yesterday", "7d"] as const).map((p) => (
              <option key={p} value={p}>
                {PHARMACY.period[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div id={tableId}>
        <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:block">
          <DataTable
            data={q.rows}
            columns={columns}
            rowKey={(r) => r.key}
            caption={`${Q.titleFor[payload.period]}: ${PHARMACY.lane[lane]}`}
            sortKey={view.sort ? sort : undefined}
            sortDir={view.sort ? (desc ? "desc" : "asc") : null}
            onSortChange={(id, dir: SortDirection) =>
              setFilter({
                sort:
                  dir && SORTS.includes(id as SortKey) ? `${dir === "desc" ? "-" : ""}${id}` : null,
              })
            }
            empty={empty}
          />
        </div>
        <ul className="divide-border border-border flex flex-col divide-y border-y md:hidden">
          {q.rows.length === 0 ? (
            <li className="text-body-s text-muted-foreground py-8 text-center">{empty}</li>
          ) : (
            q.rows.map((r) => (
              <li key={r.key} className="flex flex-col gap-1.5 py-3">
                <PatientCell id={`pm-${r.key}`} identity={identity(r)} />
                <p className="text-body-s flex flex-wrap items-center gap-x-2">
                  <Medicines id={`mm-${r.key}`} row={r} />
                  <span className="text-muted-foreground">
                    <FromCell row={r} />
                  </span>
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <StateCell row={r} fmt={fmt} />
                    <ChecksCell checks={r.checks} />
                    <span className="text-muted-foreground text-caption font-mono tabular-nums">
                      {written(r)}
                    </span>
                  </span>
                  <OpenLink row={r} prefix="m" />
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <p className="text-body-s text-muted-foreground">{footer}</p>
    </div>
  );
}

function PatientCell({ id, identity }: { id: string; identity: PatientIdentity }) {
  return (
    <span id={id} className="inline-flex min-w-36 flex-col">
      <span className="text-foreground font-medium">{identity.name}</span>
      <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
        {identity.mrn}
      </span>
    </span>
  );
}

/** Names in the order written, as stored; more than three: the first two, then "+n" (§5.3). */
function Medicines({ id, row }: { id: string; row: QueueRow }) {
  const shown = row.medicines.length > 3 ? row.medicines.slice(0, 2) : row.medicines;
  const more = row.medicines.length - shown.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span id={id}>{shown.join(", ")}</span>
      {more ? (
        <span className="text-muted-foreground" title={row.medicines.join(", ")}>
          {Q.more(more)}
        </span>
      ) : null}
      {row.groupedByTime ? (
        <span className="text-muted-foreground text-caption">· {Q.groupedByTime}</span>
      ) : null}
    </span>
  );
}

function FromCell({ row }: { row: QueueRow }) {
  return (
    <>
      {[row.from.departmentName ?? Q.notRecorded, row.prescriberCadre].filter(Boolean).join(" · ")}
    </>
  );
}

/** Words always; amber with an icon for what makes the paper wrong; nothing red (Law 10). */
function StateCell({ row, fmt }: { row: QueueRow; fmt: Intl.DateTimeFormat }) {
  const word =
    row.state === "cancelled" && row.cancelledAt
      ? PHARMACY.state.cancelledRow.replace("{time}", fmt.format(row.cancelledAt))
      : PHARMACY.rowState[row.state];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {row.state === "prescribed" ? (
        <StatusWord tone="neutral">{word}</StatusWord>
      ) : (
        <StatusWord tone="caution" glyph={row.state === "awaiting_cosign" ? ClockIcon : undefined}>
          {word}
        </StatusWord>
      )}
      {row.changedAt && row.state !== "cancelled" ? (
        <span className="text-muted-foreground text-caption">
          {PHARMACY.state.changed.replace("{time}", fmt.format(row.changedAt))}
        </span>
      ) : null}
    </span>
  );
}

/** At most two chips, most serious first, then "+n"; an overridden stop is amber (PQ-8). */
function ChecksCell({ checks }: { checks: readonly string[] }) {
  if (!checks.length)
    return <span className="text-muted-foreground text-caption">{Q.noFlags}</span>;
  const shown = checks.slice(0, 2);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {shown.map((c) => (
        <StatusWord key={c} tone={/overridden/.test(c) ? "caution" : "neutral"}>
          {c}
        </StatusWord>
      ))}
      {checks.length > 2 ? (
        <span className="text-muted-foreground text-caption" title={checks.join(", ")}>
          {Q.more(checks.length - 2)}
        </span>
      ) : null}
    </span>
  );
}

/** The row's one control (§4 budget). Its accessible name: Open, the patient, the first medicine. */
function OpenLink({ row, prefix }: { row: QueueRow; prefix: string }) {
  const id = `o${prefix}-${row.key}`;
  return (
    <Link
      id={id}
      href={`/pharmacy/prescriptions/${encodeURIComponent(row.key)}`}
      prefetch={false}
      aria-labelledby={`${id} p${prefix}-${row.key} m${prefix}-${row.key}`}
      className={cn(
        buttonVariants({ variant: "secondary", size: "md", className: "min-h-11 sm:min-h-0" }),
      )}
    >
      {Q.open}
    </Link>
  );
}
