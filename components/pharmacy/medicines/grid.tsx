"use client";

import type { ColKey, Cond, Row, RuleGroup, SortKey, Ven } from "@/lib/pharmacy/derive/medicines";
import type { MedicinesPayload } from "@/lib/pharmacy/medicines/read";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import {
  ChevronRightIcon,
  Columns3Icon,
  EllipsisVerticalIcon,
  FilterIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import {
  bulkMarkFreeAction,
  bulkSetLevelAction,
  bulkSetVenAction,
  deleteViewAction,
  requestTopUpsAction,
} from "@/app/pharmacy/medicines-actions";
import { LabButton } from "@/components/tide/work/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FLAGS,
  LOCAL_REASONS,
  MEDICINES,
  qty,
  RULE_GROUPS,
  ugx,
  VEN,
} from "@/content/pharmacy-medicines";
import { LASA_PAIRS } from "@/data/pharmacy/lasa";
import {
  condText,
  dateIn,
  evalConditions,
  flagList,
  lasaPartners,
  lineIdentityKey,
  lineMetrics,
  matchesSearch,
  newCond,
  qcChecks,
  ruleApplies,
  saleWord,
  SEVERE,
  sortLines,
  topUpSuggestion,
  validConds,
} from "@/lib/pharmacy/derive/medicines";
import { cn } from "@/lib/utils";
import { CatalogueDialog } from "./catalogue-dialog";
import { FiltersDialog } from "./filters-dialog";
import { OpenRow } from "./open-row";
import { flagFilterWord, RulesDialog } from "./rules";
import { Dot, field, newKey, pillBtn, Tip, useToast } from "./shared";
import { DOT, near } from "./tones";
import { useStockLive } from "./use-stock-live";

const M = MEDICINES;
const G = M.grid;
const PAGE = 20;

type Col = Exclude<keyof typeof M.cols, never>;
const OPT_COLS: [Col, boolean][] = [
  ["strength", true],
  ["form", true],
  ["route", true],
  ["cls", false],
  ["group", false],
  ["sale", false],
  ["ven", true],
  ["handling", true],
  ["stock", true],
  ["status", true],
  ["expiry", true],
  ["cover", false],
  ["qc", true],
  ["price", true],
];
const SORT_OF: Record<Col | "name", SortKey> = {
  name: "name",
  strength: "strength",
  form: "form",
  route: "route",
  cls: "cls",
  group: "group",
  sale: "sale",
  ven: "ven",
  handling: "handling",
  stock: "stock",
  status: "status",
  expiry: "expiry",
  cover: "cover",
  qc: "qc",
  price: "price",
};
const FILTER_OF: Record<Col | "name", ColKey> = {
  name: "name",
  strength: "strength",
  form: "form",
  route: "route",
  cls: "cls",
  group: "group",
  sale: "sale",
  ven: "ven",
  handling: "handling",
  stock: "onhand",
  status: "status",
  expiry: "expiry",
  cover: "cover",
  qc: "qc",
  price: "price",
};

const C = (col: ColKey, op: string, val: string): Cond => ({ join: "AND", col, op, val });
const VIEWS: Record<keyof typeof M.viewNames, Cond[]> = {
  all: [],
  lowout: [C("status", "any place is", "Low or out")],
  cover: [C("cover", "less than", "14")],
  vitallow: [C("ven", "is", "Vital"), C("status", "any place is", "Low or out")],
  controlled: [C("handling", "has", "Controlled")],
  noprice: [C("price", "is empty", "")],
  notopup: [C("status", "any place is", "Top-up not set")],
  attention: [C("qc", "shows", "Any issue")],
  expiring: [C("expiry", "less than", "90")],
};
type Tile = keyof typeof M.tiles;
const TILE_VIEW: Record<Tile, Cond[]> = {
  medicines: [],
  ok: [],
  low: [C("status", "any place is", "Low")],
  out: [C("status", "any place is", "Out")],
  cover: VIEWS.cover,
  qc: VIEWS.attention,
};
const same = (a: Cond[], b: Cond[]) => JSON.stringify(a) === JSON.stringify(b);
const localWord = (r: string | null) =>
  r ? ((LOCAL_REASONS as Record<string, string>)[r] ?? r) : "";

/**
 * The medicine master (MEDICINES-TAB.md §2–§8): one grid in two modes. Edit (Set-up › Medicines) changes lines;
 * operate (Stock › Medicines) reads the same lines and columns and only requests top-ups and orders. Filtering,
 * sorting and paging run here on the loaded set with the §7 semantics.
 */
export function MedicinesGrid({
  data,
  hospitalId,
  mode,
}: {
  data: MedicinesPayload;
  hospitalId: string;
  mode: "edit" | "operate";
}) {
  const router = useRouter();
  const live = useStockLive(hospitalId);
  const [toastNode, toast] = useToast();
  const [q, setQ] = useState("");
  const [conds, setConds] = useState<Cond[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [group, setGroup] = useState(false);
  const [cols, setCols] = useState<Set<Col>>(
    () => new Set(OPT_COLS.filter(([, d]) => d).map(([k]) => k)),
  );
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [tile, setTile] = useState<Tile | null>(null);
  const [filters, setFilters] = useState<{ open: boolean; initial: Cond[]; n: number }>({
    open: false,
    initial: [],
    n: 0,
  });
  const openFilters = (initial: Cond[]) => setFilters((f) => ({ open: true, initial, n: f.n + 1 }));
  const [rulesOf, setRulesOf] = useState<RuleGroup | null>(null);
  const [picker, setPicker] = useState(0);
  const edit = mode === "edit";

  const ctx = useMemo(
    () => ({
      places: data.places,
      lines: data.lines,
      cashPayerId: data.cashPayerId,
      namedLasa: LASA_PAIRS,
    }),
    [data],
  );
  const rows: Row[] = useMemo(() => {
    const keys = new Map<string, number>();
    for (const l of data.lines)
      keys.set(lineIdentityKey(l), (keys.get(lineIdentityKey(l)) ?? 0) + 1);
    return data.lines.map((l) => {
      const mx = lineMetrics(l, data.places, data.cashPayerId);
      return { l, mx, qc: qcChecks(l, mx, ctx, keys, localWord) };
    });
  }, [data, ctx]);

  const valid = validConds(conds);
  const shown = useMemo(
    () =>
      sortLines(
        rows.filter((r) => matchesSearch(r.l, q) && evalConditions(valid, r)),
        sort.key,
        sort.dir,
        group,
      ),
    [rows, q, valid, sort, group],
  );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const p = Math.min(page, pages - 1);
  const pageRows = shown.slice(p * PAGE, p * PAGE + PAGE);

  const tiles = useMemo(() => {
    let ok = 0;
    let kept = 0;
    let low = 0;
    let out = 0;
    for (const r of rows) {
      kept += r.mx.cnt.Out + r.mx.cnt.Low + r.mx.cnt.OK + r.mx.cnt.Over;
      ok += r.mx.cnt.OK + r.mx.cnt.Over;
      low += r.mx.cnt.Low;
      out += r.mx.cnt.Out;
    }
    return {
      medicines: String(rows.length),
      ok: M.okOf(ok, kept),
      low: String(low),
      out: String(out),
      cover: String(rows.filter((r) => r.mx.cover !== null && r.mx.cover < 14).length),
      qc: String(rows.filter((r) => r.qc.length).length),
    };
  }, [rows]);

  const apply = (c: Cond[], t: Tile | null = null) => {
    setConds(c);
    setTile(t);
    setPage(0);
    setOpenId(null);
  };
  const sortBy = (k: SortKey, dir?: 1 | -1) =>
    setSort((s) => ({ key: k, dir: dir ?? (s.key === k ? (s.dir === 1 ? -1 : 1) : 1) }));

  const viewChips = [
    ...(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => ({
      id: k,
      name: M.viewNames[k],
      conds: VIEWS[k],
      own: false,
    })),
    ...data.views.map((v) => ({ id: v.id, name: v.name, conds: v.conds, own: true })),
  ];
  const ruleBadges = RULE_GROUPS.map((g) => ({
    g,
    n:
      g.id === "all"
        ? rows.length
        : rows.filter((r) => ruleApplies(g, r.l.flags, r.l.cls, r.l.generic)).length,
    pending: data.proposals.filter((x) => x.group === g.id).length,
  }));
  const visible = OPT_COLS.filter(([k]) => cols.has(k)).map(([k]) => k);
  const pageIds = pageRows.map((r) => r.l.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.has(id));

  return (
    <div className="bg-card shadow-tide-card flex min-w-0 flex-col gap-3 rounded-[22px] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-ink-600 m-0 mt-0.5 flex-[1_1_320px] text-[13px] leading-[17px] font-medium">
          {edit ? M.lead : M.leadOperate}
        </p>
        {edit && data.can.edit ? (
          <LabButton
            variant="primary"
            className="h-11 px-5 text-[16px]"
            onClick={() => setPicker((n) => Math.abs(n) + 1)}
          >
            {M.add}
          </LabButton>
        ) : null}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="border-ink-300 bg-card flex h-10 flex-[1_1_260px] items-center gap-2 rounded-full border px-3.5">
          <SearchIcon aria-hidden className="text-ink-600 size-4" />
          <input
            aria-label={M.findAria}
            placeholder={M.find}
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(0))}
            className="text-foreground min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
        </label>
        <button
          type="button"
          className={cn(pillBtn(valid.length > 0), "h-10")}
          onClick={() => openFilters(conds)}
        >
          <FilterIcon aria-hidden className="size-4" />
          {M.filters(valid.length)}
        </button>
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={M.columnsAria}
                className={cn(pillBtn(false), "h-10")}
              />
            }
          >
            <Columns3Icon aria-hidden className="size-4" />
            {M.columns}
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2">
            {OPT_COLS.map(([k]) => (
              <label
                key={k}
                className="hover:bg-ink-50 flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[14px]"
              >
                <input
                  type="checkbox"
                  checked={cols.has(k)}
                  onChange={() =>
                    setCols((c) => {
                      const n = new Set(c);
                      if (n.has(k)) n.delete(k);
                      else n.add(k);
                      return n;
                    })
                  }
                  className="accent-primary size-[18px]"
                />
                {M.cols[k]}
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          aria-pressed={group}
          className={cn(pillBtn(group), "h-10")}
          onClick={() => setGroup((g) => !g)}
        >
          {M.group}
        </button>
      </div>

      {/* Views */}
      <div role="group" aria-label={M.viewsAria} className="flex flex-wrap items-center gap-1.5">
        <span className="text-ink-600 mr-0.5 text-[12px] font-semibold">{M.views}</span>
        {viewChips.map((v) => {
          const on = same(validConds(v.conds), valid) && (v.conds.length > 0 || valid.length === 0);
          return (
            <span key={v.id} className="inline-flex items-center">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => apply(v.conds)}
                className={cn(
                  pillBtn(on),
                  "h-[30px] text-[12.5px]",
                  v.own && "rounded-r-none pr-2",
                )}
              >
                {v.name}
              </button>
              {v.own ? (
                <button
                  type="button"
                  aria-label={M.filtersDlg.deleteView(v.name)}
                  onClick={async () => {
                    const r = await deleteViewAction({ id: v.id });
                    if (!r.ok) return toast(r.error);
                    toast(M.filtersDlg.deleted(v.name));
                    router.refresh();
                  }}
                  className={cn(pillBtn(on), "h-[30px] rounded-l-none border-l-0 px-1.5")}
                >
                  <XIcon aria-hidden className="size-3" />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>

      {/* Rules */}
      {edit ? (
        <div role="group" aria-label={M.rulesAria} className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-600 mr-0.5 text-[12px] font-semibold">{M.rules}</span>
          {ruleBadges.map(({ g, n, pending }) => (
            <button
              key={g.id}
              type="button"
              aria-label={M.rulesDlg.badgeAria(g.scope, n, pending)}
              onClick={() => setRulesOf(g)}
              className="bg-tide-sunken text-foreground hover:bg-ink-200 inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold"
            >
              {g.scope} · {n}
              {pending ? (
                <span className="bg-status-caution-bg text-status-caution-fg-aa rounded-full px-1.5 text-[11px]">
                  {M.toSign(pending)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* Active conditions */}
      {valid.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-ink-600">{M.showingWhere}</span>
          {valid.map((c, i) => (
            <span
              key={i}
              className="bg-tide-sunken text-foreground inline-flex h-[30px] items-center gap-0.5 rounded-full pr-0.5 pl-2.5"
            >
              {condText(c, i)}
              <button
                type="button"
                aria-label={M.removeCond(condText(c, i))}
                onClick={() =>
                  apply(
                    valid
                      .filter((_, j) => j !== i)
                      .map((x, j) => (j === 0 ? { ...x, join: "AND" } : x)),
                  )
                }
                className="hover:bg-ink-200 grid size-[26px] place-items-center rounded-full"
              >
                <XIcon aria-hidden className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => apply([])}
            className="text-primary px-1 font-semibold underline-offset-4 hover:underline"
          >
            {M.clear}
          </button>
        </div>
      ) : null}

      {/* Tiles */}
      <div
        role="group"
        aria-label={M.tilesAria}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        {(Object.keys(M.tiles) as Tile[]).map((t) => {
          const [label, sub] = M.tiles[t];
          const on = tile === t;
          const dot =
            t === "low" || t === "cover" ? DOT.Low : t === "out" || t === "qc" ? DOT.Out : null;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => (on ? apply([], null) : apply(TILE_VIEW[t], t))}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-2xl px-3.5 py-2.5 text-left transition-colors duration-150",
                on ? "bg-tide-lagoon-tint" : "bg-ink-50 hover:bg-ink-100",
              )}
            >
              <span className="text-ink-700 inline-flex items-center gap-1.5 text-[12px] font-semibold">
                {dot ? <Dot className={dot} /> : null}
                {label}
              </span>
              <span className="text-foreground text-[22px] leading-7 font-semibold tabular-nums">
                {tiles[t]}
              </span>
              <span className="text-ink-600 text-[11px]">{sub}</span>
            </button>
          );
        })}
      </div>

      {sel.size ? (
        <BulkBar
          data={data}
          rows={rows}
          sel={sel}
          edit={edit}
          onClear={() => setSel(new Set())}
          toast={toast}
        />
      ) : null}

      {/* Grid, wide */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-1 py-6">
          <p className="text-body-s m-0 font-semibold">{G.none}</p>
          {edit ? <p className="text-body-s text-ink-600 m-0">{G.noneNext}</p> : null}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2 py-6">
          <p className="text-body-s m-0">{G.noMatch}</p>
          <button
            type="button"
            className="text-primary text-body-s font-semibold underline-offset-4 hover:underline"
            onClick={() => (apply([]), setQ(""))}
          >
            {G.showAll}
          </button>
        </div>
      ) : (
        <>
          <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-card sticky top-0 z-10">
                <tr className="border-border border-b">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={G.selectPage}
                      checked={allOnPage}
                      onChange={() =>
                        setSel((s) => {
                          const n = new Set(s);
                          for (const id of pageIds) {
                            if (allOnPage) n.delete(id);
                            else n.add(id);
                          }
                          return n;
                        })
                      }
                      className="accent-primary size-4"
                    />
                  </th>
                  <Head
                    label={G.medicine}
                    col="name"
                    sort={sort}
                    sortBy={sortBy}
                    group={group}
                    setGroup={setGroup}
                    onFilter={(c) => openFilters([...conds, newCond(c)])}
                  />
                  {visible.map((k) => (
                    <Head
                      key={k}
                      label={M.cols[k]}
                      col={k}
                      sort={sort}
                      sortBy={sortBy}
                      group={group}
                      setGroup={setGroup}
                      onFilter={(c) => openFilters([...conds, newCond(c)])}
                      onHide={() => setCols((s) => new Set([...s].filter((x) => x !== k)))}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const head = group && (i === 0 || pageRows[i - 1]!.l.cls !== r.l.cls);
                  const open = openId === r.l.id;
                  return (
                    <Fragment key={r.l.id}>
                      {head ? (
                        <tr>
                          <td
                            colSpan={visible.length + 2}
                            className="bg-ink-50 text-ink-700 px-3 py-1.5 text-[12px] font-semibold"
                          >
                            {G.groupHead(
                              r.l.cls ?? G.notSet,
                              shown.filter((x) => x.l.cls === r.l.cls).length,
                            )}
                          </td>
                        </tr>
                      ) : null}
                      <tr
                        className={cn(
                          "border-border border-b align-top",
                          open ? "bg-ink-50" : "hover:bg-ink-50/60",
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={G.select(r.l.name)}
                            checked={sel.has(r.l.id)}
                            onChange={() =>
                              setSel((s) => {
                                const n = new Set(s);
                                if (n.has(r.l.id)) n.delete(r.l.id);
                                else n.add(r.l.id);
                                return n;
                              })
                            }
                            className="accent-primary size-4"
                          />
                        </td>
                        <td className="min-w-[260px] py-2 pr-3">
                          <MedicineCell
                            r={r}
                            lines={data.lines}
                            open={open}
                            toggle={() => setOpenId(open ? null : r.l.id)}
                          />
                        </td>
                        {visible.map((k) => (
                          <td key={k} className="py-2.5 pr-3 whitespace-nowrap">
                            <Cell col={k} r={r} data={data} />
                          </td>
                        ))}
                      </tr>
                      {open ? (
                        <tr className="border-border border-b">
                          <td colSpan={visible.length + 2} className="bg-ink-50 px-3 pb-3">
                            <OpenRow
                              key={r.l.id}
                              row={r}
                              data={data}
                              mode={mode}
                              live={live}
                              toast={toast}
                              onClose={() => setOpenId(null)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Below 640 px: one card per line */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {pageRows.map((r, i) => {
              const open = openId === r.l.id;
              const head = group && (i === 0 || pageRows[i - 1]!.l.cls !== r.l.cls);
              return (
                <Fragment key={r.l.id}>
                  {head ? (
                    <li className="text-ink-700 px-1 pt-1 text-[12px] font-semibold">
                      {G.groupHead(
                        r.l.cls ?? G.notSet,
                        shown.filter((x) => x.l.cls === r.l.cls).length,
                      )}
                    </li>
                  ) : null}
                  <li className="bg-ink-50 flex flex-col gap-2 rounded-2xl p-3">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        aria-label={G.select(r.l.name)}
                        checked={sel.has(r.l.id)}
                        onChange={() =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (n.has(r.l.id)) n.delete(r.l.id);
                            else n.add(r.l.id);
                            return n;
                          })
                        }
                        className="accent-primary mt-3 size-5"
                      />
                      <div className="min-w-0 flex-1">
                        <MedicineCell
                          r={r}
                          lines={data.lines}
                          open={open}
                          toggle={() => setOpenId(open ? null : r.l.id)}
                        />
                        <p className="text-ink-700 m-0 mt-1 text-[12px]">
                          {[r.l.strength, r.l.form, r.l.route].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <Cell col="stock" r={r} data={data} />
                      <Cell col="status" r={r} data={data} />
                      <Cell col="expiry" r={r} data={data} />
                      <Cell col="qc" r={r} data={data} />
                    </div>
                    {open ? (
                      <OpenRow
                        key={r.l.id}
                        row={r}
                        data={data}
                        mode={mode}
                        live={live}
                        toast={toast}
                        onClose={() => setOpenId(null)}
                      />
                    ) : null}
                  </li>
                </Fragment>
              );
            })}
          </ul>

          {/* Pager */}
          <nav
            aria-label="Pages"
            className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
          >
            <span className="text-ink-700">
              {M.pager.showing(
                p * PAGE + 1,
                Math.min(shown.length, p * PAGE + PAGE),
                shown.length,
                rows.length,
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-ink-600">{M.pager.page(p + 1, pages)}</span>
              <button
                type="button"
                disabled={p === 0}
                onClick={() => (setPage(p - 1), setOpenId(null))}
                className={cn(pillBtn(false), "disabled:text-ink-400 disabled:hover:bg-card")}
              >
                {M.pager.prev}
              </button>
              <button
                type="button"
                disabled={p >= pages - 1}
                onClick={() => (setPage(p + 1), setOpenId(null))}
                className={cn(pillBtn(false), "disabled:text-ink-400 disabled:hover:bg-card")}
              >
                {M.pager.next}
              </button>
            </span>
          </nav>
        </>
      )}

      <FiltersDialog
        key={filters.n}
        open={filters.open}
        initial={filters.initial}
        onClose={() => setFilters((f) => ({ ...f, open: false }))}
        onApply={(c) => {
          apply(c);
          setFilters((f) => ({ ...f, open: false }));
          toast(c.length ? M.filtersDlg.applied : M.filtersDlg.cleared);
        }}
        onSaved={(c) => {
          apply(c);
          setFilters((f) => ({ ...f, open: false }));
          router.refresh();
        }}
        toast={toast}
      />
      <RulesDialog
        group={rulesOf}
        count={ruleBadges.find((b) => b.g.id === rulesOf?.id)?.n ?? 0}
        data={data}
        mode={mode}
        onClose={() => setRulesOf(null)}
        onShow={(g) => {
          const w = flagFilterWord(g);
          apply(w ? [C("handling", "has", w)] : "cls" in g ? [C("cls", "is", g.cls)] : []);
          setRulesOf(null);
        }}
        toast={toast}
      />
      {edit ? (
        <CatalogueDialog
          key={Math.abs(picker)}
          open={picker > 0}
          onClose={() => setPicker((n) => -Math.abs(n))}
          lines={data.lines}
          toast={toast}
          onLocalAdded={(name) => (setQ(name), apply([]))}
        />
      ) : null}
      {toastNode}
    </div>
  );
}

function Head({
  label,
  col,
  sort,
  sortBy,
  group,
  setGroup,
  onFilter,
  onHide,
}: {
  label: string;
  col: Col | "name";
  sort: { key: SortKey; dir: 1 | -1 };
  sortBy: (k: SortKey, dir?: 1 | -1) => void;
  group: boolean;
  setGroup: (g: boolean) => void;
  onFilter: (c: ColKey) => void;
  onHide?: () => void;
}) {
  const k = SORT_OF[col];
  const active = sort.key === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      className="text-ink-600 py-1.5 pr-1 text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase"
    >
      <span className="inline-flex items-center">
        <button
          type="button"
          onClick={() => sortBy(k)}
          className="hover:text-foreground rounded px-1 py-1 uppercase"
        >
          {label}
          {active ? <span aria-hidden> {sort.dir === 1 ? "↑" : "↓"}</span> : null}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={G.menuAria(label)}
                className="hover:bg-ink-100 grid size-7 place-items-center rounded-full"
              />
            }
          >
            <EllipsisVerticalIcon aria-hidden className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-48 normal-case">
            <DropdownMenuItem onClick={() => sortBy(k, 1)}>{G.sortAsc}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => sortBy(k, -1)}>{G.sortDesc}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilter(FILTER_OF[col])}>
              {G.filterBy}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGroup(!group)}>
              {group ? G.stopGroup : G.groupBy}
            </DropdownMenuItem>
            {onHide ? <DropdownMenuItem onClick={onHide}>{G.hide}</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </th>
  );
}

function MedicineCell({
  r,
  lines,
  open,
  toggle,
}: {
  r: Row;
  lines: MedicinesPayload["lines"];
  open: boolean;
  toggle: () => void;
}) {
  const l = r.l;
  const others = lines.filter(
    (o) => o.id !== l.id && o.generic.toLowerCase() === l.generic.toLowerCase(),
  );
  const lasa = lasaPartners(l, lines, LASA_PAIRS);
  const sub = [
    others.length
      ? G.alsoStocked(
          others.map((o) => [o.strength, o.form?.toLowerCase()].filter(Boolean).join(" ")),
        )
      : null,
    G.issuedPer(l.unit),
    l.packs.length
      ? G.packs(
          [...l.packs]
            .sort((a, b) => a - b)
            .map((n) => n.toLocaleString("en-US"))
            .join(" · "),
        )
      : null,
    l.loose ? G.loose : null,
    l.brands.length ? G.brands(l.brands.length) : null,
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 items-start gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? G.close(l.name) : G.open(l.name)}
        onClick={toggle}
        className="hover:bg-ink-100 -ml-1 grid size-8 shrink-0 place-items-center rounded-full"
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "size-4 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
            open && "rotate-90",
          )}
        />
      </button>
      <div className="min-w-0 pt-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={toggle}
            className="text-foreground text-left text-[14px] leading-[18px] font-semibold underline-offset-4 hover:underline"
          >
            {l.generic}
          </button>
          {l.local ? (
            <Tip label={G.localTip}>
              <span className="bg-tide-sunken text-ink-700 rounded-full px-1.5 py-px text-[10.5px] font-bold tracking-wide">
                {G.local}
              </span>
            </Tip>
          ) : null}
          {lasa.length ? (
            <Tip label={G.lasaTip(lasa.map((o) => o.name))}>
              <span className="bg-status-caution-bg text-status-caution-fg-aa rounded-full px-1.5 py-px text-[10.5px] font-bold tracking-wide">
                {G.lasa}
              </span>
            </Tip>
          ) : null}
        </span>
        <span className="text-ink-600 mt-0.5 block text-[12px] leading-4">{sub.join(" · ")}</span>
      </div>
    </div>
  );
}

function Cell({ col, r, data }: { col: Col; r: Row; data: MedicinesPayload }) {
  const { l, mx } = r;
  switch (col) {
    case "strength":
      return <span className="font-semibold">{l.strength ?? "—"}</span>;
    case "form":
      return <>{l.form ?? "—"}</>;
    case "route":
      return <>{l.route ?? "—"}</>;
    case "cls":
      return <>{l.cls ?? "—"}</>;
    case "group":
      return <>{l.group ?? "—"}</>;
    case "sale":
      return <>{l.sale ? saleWord(l.sale) : "—"}</>;
    case "ven":
      return (
        <span className={cn(!l.ven && "text-ink-600")}>{l.ven ? VEN[l.ven as Ven] : G.notSet}</span>
      );
    case "handling": {
      const fl = flagList(l.flags);
      if (!fl.length) return <span className="text-ink-500">—</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {fl.map((k) => (
            <span
              key={k}
              className="bg-tide-sunken text-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold"
            >
              {FLAGS[k][2]}
            </span>
          ))}
        </span>
      );
    }
    case "stock": {
      const tip = mx.st.length
        ? mx.st
            .map((s) =>
              G.stockTip(s.short, qty(s.have, l.unit), s.lvl ? qty(s.lvl, l.unit) : null, s.flag),
            )
            .join(" · ")
        : G.notKept;
      return (
        <Tip label={tip} className="flex w-32 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <b className="tabular-nums">{mx.have.toLocaleString("en-US")}</b>
            <span className="text-ink-600 text-[11px] tabular-nums">
              {mx.pct === null ? "—" : `${mx.pct}%`}
            </span>
          </span>
          <span
            className="bg-ink-200 block h-1 overflow-hidden rounded-full"
            aria-label={mx.pct === null ? G.noLevel : G.pctAria(mx.pct)}
            role="img"
          >
            <span
              className={cn(
                "block h-full rounded-full",
                mx.sev === 0 ? DOT.Out : mx.sev === 1 ? DOT.Low : mx.sev === 4 ? DOT.Over : DOT.OK,
              )}
              style={{ width: `${Math.min(mx.pct ?? 0, 100)}%` }}
            />
          </span>
        </Tip>
      );
    }
    case "status":
      return (
        <span className="flex flex-col gap-0.5 text-[12px] font-semibold">
          {mx.cnt.Out ? (
            <span className="inline-flex items-center gap-1.5">
              <Dot className={DOT.Out} />
              {G.out(mx.cnt.Out)}
            </span>
          ) : null}
          {mx.cnt.Low ? (
            <span className="inline-flex items-center gap-1.5">
              <Dot className={DOT.Low} />
              {G.low(mx.cnt.Low)}
            </span>
          ) : null}
          {!mx.cnt.Out && !mx.cnt.Low ? (
            <span className="inline-flex items-center gap-1.5">
              <Dot className={!mx.lvl ? DOT.none : mx.sev === 4 ? DOT.Over : DOT.OK} />
              {!mx.lvl ? G.notSet : mx.sev === 4 ? G.over : G.allOk}
            </span>
          ) : null}
        </span>
      );
    case "expiry":
      return mx.exp === null ? (
        <span className="text-ink-500">—</span>
      ) : (
        <span className={cn("flex flex-col text-[12px] leading-4", near(mx.exp, 90, 30))}>
          <span>{dateIn(data.today, mx.exp)}</span>
          <span className="text-[11px]">{G.expIn(mx.exp)}</span>
        </span>
      );
    case "cover":
      return mx.cover === null ? (
        <span className="text-ink-500">—</span>
      ) : (
        <span className={cn("tabular-nums", near(mx.cover, 14))}>{G.cover(mx.cover)}</span>
      );
    case "qc": {
      if (!r.qc.length)
        return (
          <Tip
            label={G.allPass}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
          >
            <Dot className={DOT.OK} />
            {G.ready}
          </Tip>
        );
      const severe = r.qc.some((x) => SEVERE.has(x.k));
      return (
        <Tip
          label={
            <ul className="m-0 list-disc pl-4">
              {r.qc.map((x) => (
                <li key={x.k}>{x.t}</li>
              ))}
            </ul>
          }
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
        >
          <Dot className={severe ? DOT.Out : DOT.Low} />
          {G.issues(r.qc.length)}
        </Tip>
      );
    }
    case "price": {
      if (l.free) return <span className="font-semibold">{G.free}</span>;
      const cash = mx.price;
      if (!cash) return <span className="text-ink-600">{G.notSet}</span>;
      const all = [cash, ...l.brands.map((b) => b.price ?? cash)];
      const lo = Math.min(...all);
      const hi = Math.max(...all);
      return (
        <span className="flex flex-col leading-4">
          <span className="font-semibold tabular-nums">
            {lo === hi
              ? ugx(cash)
              : `UGX ${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")}`}
          </span>
          <span className="text-ink-600 text-[11px]">{G.per(l.unit)}</span>
        </span>
      );
    }
  }
}

function BulkBar({
  data,
  rows,
  sel,
  edit,
  onClear,
  toast,
}: {
  data: MedicinesPayload;
  rows: Row[];
  sel: Set<string>;
  edit: boolean;
  onClear: () => void;
  toast: (m: string) => void;
}) {
  const router = useRouter();
  const B = M.bulk;
  const [ven, setVen] = useState("");
  const [place, setPlace] = useState("");
  const [level, setLevel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = [...sel];
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? M.refused.failed);
      toast(done);
      router.refresh();
    });
  const request = () => {
    const items = rows
      .filter((r) => sel.has(r.l.id))
      .flatMap((r) =>
        r.mx.st
          .filter(
            (s) => (s.flag === "Low" || s.flag === "Out") && topUpSuggestion(s.lvl, s.have) > 0,
          )
          .filter((s) =>
            data.places.find((x) => x.id === s.id)?.isStore
              ? !data.orders[r.l.id]
              : !data.requests[r.l.id]?.[s.id],
          )
          .map((s) => ({
            clientKey: newKey(),
            lineId: r.l.id,
            placeId: s.id,
            qty: topUpSuggestion(s.lvl, s.have),
          })),
      );
    if (!items.length) return toast(B.requested(0, 0));
    start(async () => {
      const r = await requestTopUpsAction({ items });
      if (!r.ok) return setErr(r.error);
      toast(B.requested(r.data!.requests, r.data!.orders));
      router.refresh();
    });
  };
  const placeName = data.places.find((x) => x.id === place)?.short ?? "";
  return (
    <div
      role="group"
      aria-label={B.aria}
      className="bg-tide-lagoon-tint flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-[13px]"
    >
      <span className="font-semibold">{B.selected(sel.size)}</span>
      {edit && data.can.edit ? (
        <span className="inline-flex items-center gap-1.5">
          <select
            aria-label={B.venAria}
            value={ven}
            onChange={(e) => setVen(e.target.value)}
            className={field}
          >
            <option value="">{B.setVen}</option>
            {Object.entries(VEN).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <LabButton
            size="sm"
            busy={pending}
            onClick={() =>
              ven
                ? run(() => bulkSetVenAction({ ids, ven }), B.venDone(VEN[ven as Ven], ids.length))
                : setErr(B.chooseVen)
            }
          >
            {B.apply}
          </LabButton>
        </span>
      ) : null}
      {edit && data.can.levels ? (
        <span className="inline-flex items-center gap-1.5">
          <select
            aria-label={B.placeAria}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className={field}
          >
            <option value="">{B.topUpAt}</option>
            {data.places.map((x) => (
              <option key={x.id} value={x.id}>
                {x.short}
              </option>
            ))}
          </select>
          <input
            inputMode="numeric"
            aria-label={B.levelAria}
            placeholder={B.level}
            value={level}
            onChange={(e) => setLevel(e.target.value.replace(/[^\d]/g, ""))}
            className={cn(field, "w-20 text-right tabular-nums")}
          />
          <LabButton
            size="sm"
            busy={pending}
            onClick={() =>
              place && Number(level) > 0
                ? run(
                    () => bulkSetLevelAction({ ids, placeId: place, level: Number(level) }),
                    B.levelDone(placeName, Number(level), ids.length),
                  )
                : setErr(B.chooseLevel)
            }
          >
            {B.apply}
          </LabButton>
        </span>
      ) : null}
      {data.can.request ? (
        <LabButton size="sm" busy={pending} onClick={request}>
          {B.request}
        </LabButton>
      ) : null}
      {edit && data.can.edit ? (
        <LabButton
          size="sm"
          busy={pending}
          onClick={() => run(() => bulkMarkFreeAction({ ids }), B.freeDone(ids.length))}
        >
          {B.free}
        </LabButton>
      ) : null}
      <LabButton size="sm" variant="text" onClick={onClear}>
        {B.clear}
      </LabButton>
      {err ? (
        <span role="alert" className="text-status-critical-fg-aa basis-full font-semibold">
          {err}
        </span>
      ) : null}
    </div>
  );
}
