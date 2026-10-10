"use client";

import type { PatientIdentity } from "@/components/emr/orders/model";
import type { DataTableColumn, SortDirection } from "@/components/ui/data-table";
import type { LabPermission } from "@/lib/lab/access";
import type {
  SectionKey,
  SectionTab,
  SortKey,
  StageKey,
  WorklistFilters,
  WorklistInput,
  WorklistRow,
} from "@/lib/lab/worklist";
import type { KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { RestrictedMark } from "@/components/emr/chips";
import { PRIORITY_WORD } from "@/components/emr/orders/model";
import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { LAB } from "@/content/lab";
import { receiveSpecimen } from "@/lib/emr/actions/orders";
import { serverNowAt } from "@/lib/lab/turnaround";
import { computeWorklist, LAB_STAGES, SORT_KEYS } from "@/lib/lab/worklist";
import { cn } from "@/lib/utils";
import { TurnaroundCell } from "./turnaround-cell";

/**
 * The lab worklist (Lab Phase 0 §5.3; canvas "0 Worklist"). The server sends every open specimen,
 * the revealed identities and its own "now"; this screen filters, sorts and runs the clock in the
 * browser, so a section or stage switch needs no request. The URL holds the view
 * (?section=&stage=&dept=&sort=), so back, forward and reload restore it. The clock ticks every 30
 * seconds from server time and pauses while the tab is hidden (Law 6); it never fetches.
 *
 * Links to a result screen never prefetch: opening one reveals the patient's identity and writes an
 * access-log row, so it must happen only when someone opens it (Law 8), not as rows scroll by.
 */

type Wire<T> = Omit<T, "collectedAt" | "receivedAt"> & {
  collectedAt: string;
  receivedAt: string | null;
};

export interface WorklistPayload {
  hospitalName: string;
  inputs: Wire<WorklistInput>[];
  identities: Record<string, PatientIdentity>;
  restricted: string[];
  sections: { id: string; name: string }[];
  viewer: { hospitalId: string; permissions: LabPermission[]; sectionIds: string[] };
  serverNowIso: string;
  timeZone: string;
  initial: {
    section: string | null;
    stage: string | null;
    dept: string | null;
    sort: string | null;
  };
}

const TICK_MS = 30_000;
const W = LAB.worklist;
const SORTABLE: readonly SortKey[] = ["test", "from", "stage", "waiting"];

const sectionLabel = (t: Pick<SectionTab, "key" | "name">) =>
  t.key === "all"
    ? W.allSections
    : t.key === "mine"
      ? W.mySections
      : t.key === "none"
        ? W.noSection
        : (t.name ?? W.noSection);

function parseSort(raw: string | null): { key: SortKey; dir: Exclude<SortDirection, null> } {
  const desc = raw?.startsWith("-") ?? false;
  const key = (raw?.replace(/^-/, "") ?? "default") as SortKey;
  return SORT_KEYS.includes(key)
    ? { key, dir: desc ? "desc" : "asc" }
    : { key: "default", dir: "asc" };
}

function readUrl(): WorklistPayload["initial"] {
  const p = new URLSearchParams(window.location.search);
  return {
    section: p.get("section"),
    stage: p.get("stage"),
    dept: p.get("dept"),
    sort: p.get("sort"),
  };
}

export function WorklistScreen({ payload }: { payload: WorklistPayload }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [announce, setAnnounce] = useState("");
  const [view, setView] = useState(payload.initial);
  const serverMs = useMemo(() => new Date(payload.serverNowIso).getTime(), [payload.serverNowIso]);
  // The tick's last reading, tied to the render it belongs to: a fresh server render (Refresh)
  // brings a new server time, and "now" falls back to it until the next tick.
  const [tick, setTick] = useState({ serverMs, now: new Date(serverMs) });
  const now = tick.serverMs === serverMs ? tick.now : new Date(serverMs);

  // Law 6: server time plus the page's age on the monotonic clock; paused while hidden.
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

  useEffect(() => {
    const onPop = () => setView(readUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setFilter = useCallback((patch: Partial<WorklistPayload["initial"]>) => {
    setView((v) => {
      const next = { ...v, ...patch };
      const p = new URLSearchParams();
      for (const [k, value] of Object.entries(next)) if (value) p.set(k, value);
      const qs = p.toString();
      window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
      return next;
    });
  }, []);

  const inputs = useMemo<WorklistInput[]>(
    () =>
      payload.inputs.map((r) => ({
        ...r,
        collectedAt: new Date(r.collectedAt),
        receivedAt: r.receivedAt ? new Date(r.receivedAt) : null,
      })),
    [payload.inputs],
  );
  const sort = parseSort(view.sort);
  const filters: WorklistFilters = {
    section: view.section as SectionKey | null,
    stage: view.stage as StageKey | null,
    dept: view.dept,
    sort: sort.key,
  };
  const viewer = useMemo(
    () => ({ ...payload.viewer, permissions: new Set(payload.viewer.permissions) }),
    [payload.viewer],
  );
  const w = useMemo(
    () =>
      computeWorklist({
        rows: inputs,
        sections: payload.sections,
        viewer,
        filters,
        serverNow: now,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is derived from `view`
    [inputs, payload.sections, viewer, view, now],
  );
  const rows = sort.key !== "default" && sort.dir === "desc" ? [...w.rows].reverse() : w.rows;
  const restricted = useMemo(() => new Set(payload.restricted), [payload.restricted]);
  const sectionName = sectionLabel(
    w.sectionTabs.find((t) => t.key === w.section) ?? { key: "all", name: null },
  );
  const updated = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: payload.timeZone,
  }).format(new Date(serverMs));

  const refresh = () =>
    startRefresh(() => {
      router.refresh();
    });
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) setAnnounce(W.refreshed(w.total));
    wasRefreshing.current = refreshing;
  }, [refreshing, w.total]);

  const tableId = useId();
  const firstAction = rows.find((r) => r.action)?.orderId;
  const identity = (r: WorklistRow) =>
    payload.identities[r.patientUserId] ?? { name: "Name withheld", mrn: "", ageSex: "" };

  const columns: DataTableColumn<WorklistRow>[] = [
    {
      id: "patient",
      header: W.columns.patient,
      cell: (r) => <PatientCell id={`p-${r.orderId}`} identity={identity(r)} />,
    },
    {
      id: "test",
      header: W.columns.test,
      sortable: true,
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <Link
            id={`t-${r.orderId}`}
            href={`/lab/results/${r.orderId}`}
            prefetch={false}
            className="text-foreground focus-visible:shadow-focus rounded-sm underline-offset-4 outline-none hover:underline"
          >
            {r.test}
          </Link>
          {restricted.has(r.orderId) ? <RestrictedMark /> : null}
        </span>
      ),
    },
    {
      id: "from",
      header: W.columns.from,
      sortable: true,
      cell: (r) => r.from?.name ?? W.notRecorded,
    },
    {
      id: "priority",
      header: W.columns.priority,
      cell: (r) => <PriorityWord priority={r.priority} />,
    },
    {
      id: "stage",
      header: W.columns.stage,
      sortable: true,
      cell: (r) => <StatusWord tone="neutral">{LAB.stage[r.stage]}</StatusWord>,
    },
    {
      id: "waiting",
      header: W.columns.waiting,
      sortable: true,
      cell: (r) => <TurnaroundCell clock={r.clock} />,
    },
    {
      id: "action",
      header: <span className="sr-only">{W.columns.action}</span>,
      headerClassName: "w-px",
      className: "text-right",
      cell: (r) => <RowAction row={r} primary={r.orderId === firstAction} onDone={refresh} />,
    },
  ];

  const empty =
    w.total === 0 ? (
      W.emptyAll
    ) : w.rows.length === 0 && w.elsewhere > 0 && w.section !== "all" ? (
      <span className="inline-flex flex-wrap items-center justify-center gap-2">
        {W.emptyMine(sectionName, w.elsewhere)}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setFilter({ section: "all" })}
        >
          {W.showAll}
        </Button>
      </span>
    ) : (
      W.emptyAll
    );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${payload.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={W.title}
        right={
          <>
            <span className="text-body-s text-muted-foreground">
              {W.updated} <span className="font-mono tabular-nums">{updated}</span>
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={refreshing}
              onClick={refresh}
            >
              {W.refresh}
            </Button>
          </>
        }
      />
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>

      {w.noSectionAssigned ? (
        <p className="text-body-s text-muted-foreground">{W.noSectionAssigned}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <TabList
          label={W.sectionLabel}
          controls={tableId}
          value={w.section}
          options={w.sectionTabs.map((t) => ({
            value: t.key,
            label: sectionLabel(t),
            count: t.count,
          }))}
          onChange={(section) => setFilter({ section, stage: null })}
        />
        <span className="flex-1" />
        <TabList
          label={W.stageLabel}
          controls={tableId}
          value={w.stage}
          options={[
            { value: "all", label: W.allStages, count: w.stageCounts.all },
            ...LAB_STAGES.map((s) => ({ value: s, label: LAB.stage[s], count: w.stageCounts[s] })),
          ]}
          onChange={(stage) => setFilter({ stage: stage === "all" ? null : stage })}
        />
        {w.depts.length ? (
          <label className="flex items-center">
            <span className="sr-only">{W.deptLabel}</span>
            <select
              value={w.dept ?? ""}
              onChange={(e) => setFilter({ dept: e.target.value || null })}
              className="border-input bg-card text-body-s focus-visible:shadow-focus h-9 min-h-11 rounded-md border px-2 outline-none sm:min-h-9"
            >
              <option value="">{W.allDepts}</option>
              {w.depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div id={tableId}>
        <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:block">
          <DataTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.orderId}
            caption={`${W.title}: ${sectionName}`}
            sortKey={sort.key === "default" ? undefined : sort.key}
            sortDir={sort.key === "default" ? null : sort.dir}
            onSortChange={(id, dir) =>
              setFilter({
                sort:
                  dir && SORTABLE.includes(id as SortKey)
                    ? `${dir === "desc" ? "-" : ""}${id}`
                    : null,
              })
            }
            empty={empty}
          />
        </div>
        <ul className="divide-border border-border flex flex-col divide-y border-y md:hidden">
          {rows.length === 0 ? (
            <li className="text-body-s text-muted-foreground py-8 text-center">{empty}</li>
          ) : (
            rows.map((r) => (
              <li key={r.orderId} className="flex flex-col gap-1.5 py-3">
                <PatientCell id={`pm-${r.orderId}`} identity={identity(r)} />
                <p className="text-body-s flex flex-wrap items-center gap-x-2">
                  <Link
                    id={`tm-${r.orderId}`}
                    href={`/lab/results/${r.orderId}`}
                    prefetch={false}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.test}
                  </Link>
                  <span className="text-muted-foreground">{r.from?.name ?? W.notRecorded}</span>
                  <PriorityWord priority={r.priority} />
                  {restricted.has(r.orderId) ? <RestrictedMark /> : null}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusWord tone="neutral">{LAB.stage[r.stage]}</StatusWord>
                    <TurnaroundCell clock={r.clock} className="min-w-0" />
                  </span>
                  <RowAction row={r} primary={r.orderId === firstAction} onDone={refresh} mobile />
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <p className="text-body-s text-muted-foreground">
        {W.footer(rows.length, w.total, sectionName)}
      </p>
    </div>
  );
}

function PatientCell({ id, identity }: { id: string; identity: PatientIdentity }) {
  return (
    <span id={id} className="inline-flex flex-col">
      <span className="text-foreground font-medium">{identity.name}</span>
      <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
        {identity.mrn}
      </span>
    </span>
  );
}

function PriorityWord({ priority }: { priority: string | null }) {
  const p = priority ?? "routine";
  return (
    <span className={cn(p === "immediate" || p === "emergency" ? "font-semibold" : "font-normal")}>
      {PRIORITY_WORD[p] ?? p}
    </span>
  );
}

/** The row's one action (LW-8). Its accessible name is the button, the patient and the test. */
function RowAction({
  row,
  primary,
  onDone,
  mobile = false,
}: {
  row: WorklistRow;
  primary: boolean;
  onDone: () => void;
  mobile?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  if (!row.action) return null;
  const labelledBy = `${id} ${mobile ? "pm" : "p"}-${row.orderId} ${mobile ? "tm" : "t"}-${row.orderId}`;
  const variant = primary ? "primary" : "secondary";
  const size = "min-h-11 sm:min-h-0";
  if (row.action === "receive" && row.specimenId) {
    const specimenId = row.specimenId;
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Button
          id={id}
          type="button"
          variant={variant}
          size="md"
          className={size}
          aria-labelledby={labelledBy}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await receiveSpecimen({
                surface: "lab",
                patientUserId: row.patientUserId,
                specimenId,
                clientKey: crypto.randomUUID(),
              });
              if (!r.ok) return setError(r.error);
              setError(null);
              onDone();
            })
          }
        >
          {LAB.action.receive}
        </Button>
        {error ? (
          <span role="status">
            <StatusWord tone="caution">{error}</StatusWord>
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <Link
      id={id}
      href={`/lab/results/${row.orderId}`}
      prefetch={false}
      aria-labelledby={labelledBy}
      className={cn(buttonVariants({ variant, size: "md", className: size }))}
    >
      {row.action === "continue" ? LAB.action.continue : LAB.action.enter}
    </Link>
  );
}

/** A tablist of filter tabs with counts in their names; arrow keys move the selection. */
function TabList<T extends string>({
  label,
  controls,
  value,
  options,
  onChange,
}: {
  label: string;
  controls: string;
  value: T;
  options: { value: T; label: string; count: number }[];
  onChange: (value: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="bg-muted flex max-w-full gap-0.5 overflow-x-auto rounded-md p-0.5"
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={controls}
            aria-label={`${o.label}, ${o.count}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "text-label focus-visible:shadow-focus inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 whitespace-nowrap outline-none sm:min-h-8",
              on ? "bg-card text-foreground shadow-xs" : "text-ink-600 hover:text-foreground",
            )}
          >
            {o.label}
            <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
              {o.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
