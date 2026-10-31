"use client";

import type { CatalogueTest, MenuOffering, SectionKey, Where } from "@/lib/lab/test-menu";
import type { TestMenuData } from "@/lib/lab/test-menu-read";
import { useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  InfoIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";

import { LabButton } from "@/components/tide/work/button";
import { Pill } from "@/components/tide/work/kit";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import {
  menuSummary,
  minutesWords,
  rankTests,
  sectionFor,
  sectionName,
  SECTIONS,
} from "@/lib/lab/test-menu";
import { saveOfferingsAction, setSectionHiddenAction } from "@/lib/lab/test-menu-actions";
import { cn } from "@/lib/utils";
import {
  AddTestsDialog,
  LevelDialog,
  RequestDialog,
  SectionHoursDialog,
  TestDetailDialog,
} from "./dialogs";
import { newKey, useMenuAction } from "./use-menu-action";

/**
 * The test menu (board 13; 5.1). One component for the hub's Diagnostics → Laboratory and the lab's Set-up →
 * Tests (TM-U6, S9). A row is a catalogue test, never a result (Law 1); every row shows a section (Law 2).
 * Red never appears; nothing is green; a changed section is ink text (Law 9).
 */

type Filter = "all" | "in_house" | "referred" | "changed";
type Row = { t: CatalogueTest; o: MenuOffering; section: SectionKey };

export const rowItem = (o: MenuOffering) => ({
  code: o.code,
  where: o.where,
  sectionOverride: o.sectionOverride,
  hours: o.hours,
  hoursNote: o.hoursNote,
  statedTurnaroundMinutes: o.statedTurnaroundMinutes,
  referredTo: o.referredTo,
});

export const hoursWords = (o: MenuOffering) =>
  o.where !== "in_house" ? "—" : o.hours === "24h" ? C.hours["24h"] : (o.hoursNote ?? null);

const chip = (on: boolean) =>
  cn(
    "focus-visible:shadow-focus inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap outline-none",
    on
      ? "bg-tide-navy-900 text-tide-on-band font-semibold"
      : "bg-card text-ink-700 hover:bg-ink-50 font-medium shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
  );

export function TestMenu({ data }: { data: TestMenuData }) {
  const { surface } = data;
  const act = useMenuAction();
  const tests = useMemo(() => new Map(data.tests.map((t) => [t.code, t])), [data.tests]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [section, setSection] = useState<SectionKey | "all">("all");
  const [where, setWhere] = useState<Where | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<
    | { kind: "level" | "add" | "request" }
    | { kind: "detail"; code: string }
    | { kind: "hours"; section: SectionKey }
    | null
  >(null);

  const all: Row[] = useMemo(
    () =>
      data.menu.flatMap((o) => {
        const t = tests.get(o.code);
        return t ? [{ t, o, section: sectionFor(o, t)! }] : [];
      }),
    [data.menu, tests],
  );
  const summary = menuSummary(data.menu, tests);
  const offered = all.filter((r) => r.o.where !== "not_offered");
  const matched = query.trim()
    ? new Set(
        rankTests(
          all.map((r) => r.t),
          query,
        ).map((t) => t.code),
      )
    : null;
  const rows = all.filter(
    (r) =>
      (where ? r.o.where === where : r.o.where !== "not_offered") &&
      (section === "all" || r.section === section) &&
      (filter === "all" ||
        (filter === "changed"
          ? !!r.o.sectionOverride && r.o.sectionOverride !== r.t.section
          : r.o.where === filter)) &&
      (!matched || matched.has(r.t.code)),
  );
  const hidden = new Set(data.hidden);
  const groups = [
    ...SECTIONS.filter((s) => !hidden.has(s.key)).map((s) => ({
      key: s.key as SectionKey | "hidden",
      label: s.display,
      rows: rows.filter((r) => r.section === s.key),
    })),
    {
      key: "hidden" as const,
      label: C.hiddenSection,
      rows: rows.filter((r) => hidden.has(r.section)),
    },
  ].filter((g) => g.rows.length);
  const save = (items: MenuOffering[], okText: string = C.saved) =>
    act.run(
      () => saveOfferingsAction({ surface, clientKey: newKey(), items: items.map(rowItem) }),
      okText,
    );
  const toggle = (set: Set<string>, code: string) => {
    const n = new Set(set);
    if (n.has(code)) n.delete(code);
    else n.add(code);
    return n;
  };
  const detail = dialog?.kind === "detail" ? tests.get(dialog.code) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <LabButton type="button" onClick={() => setDialog({ kind: "level" })}>
          <LayersIcon aria-hidden className="size-4" />
          {C.startLevel}
        </LabButton>
        <LabButton type="button" variant="primary" onClick={() => setDialog({ kind: "add" })}>
          <PlusIcon aria-hidden className="size-4" />
          {C.addTests}
        </LabButton>
      </div>

      {/* Summary strip (real counts only) */}
      <section
        aria-label={C.title}
        className="bg-card shadow-tide-card flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-xl px-5 py-4"
      >
        {(
          [
            [summary.onMenu, C.summary.onMenu],
            [summary.inHouse, C.summary.inHouse],
            [summary.referred, C.summary.referred],
            [summary.noSection, C.summary.noSection],
            [summary.changed, C.summary.changed],
          ] as const
        ).map(([n, label]) => (
          <span key={label} className="text-body-s text-ink-600">
            <span className="text-heading-m text-foreground mr-1.5 tabular-nums">{n}</span>
            {label}
          </span>
        ))}
        {data.level ? (
          <button
            type="button"
            onClick={() => setDialog({ kind: "level" })}
            className="text-body-s text-primary focus-visible:shadow-focus ml-auto rounded-sm font-medium underline-offset-4 outline-none hover:underline"
          >
            {C.summary.compare(C.levels[data.level as keyof typeof C.levels] ?? data.level)}
          </button>
        ) : null}
      </section>

      {all.length === 0 ? (
        <section className="bg-card shadow-tide-card flex flex-col items-start gap-3 rounded-xl p-6">
          <p className="text-body text-ink-700 max-w-prose">{C.empty}</p>
          <div className="flex gap-2">
            <LabButton type="button" variant="primary" onClick={() => setDialog({ kind: "level" })}>
              {C.startLevel}
            </LabButton>
            <LabButton type="button" onClick={() => setDialog({ kind: "add" })}>
              {C.addTests}
            </LabButton>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
          {/* Left list */}
          <aside className="bg-card shadow-tide-card flex h-fit flex-col gap-1 rounded-xl p-3">
            <h2 className="text-caption text-ink-600 px-2 pt-1 font-semibold tracking-wide uppercase">
              {C.sectionsHead}
            </h2>
            <SideItem
              on={section === "all" && !where}
              label={C.allSections}
              n={offered.length}
              onClick={() => (setSection("all"), setWhere(null))}
            />
            {SECTIONS.map((s) => (
              <div key={s.key} className="group flex items-center">
                <SideItem
                  on={section === s.key}
                  label={s.display}
                  n={offered.filter((r) => r.section === s.key).length}
                  muted={hidden.has(s.key)}
                  onClick={() => setSection(s.key)}
                />
                <button
                  type="button"
                  disabled={act.pending}
                  aria-busy={act.pending || undefined}
                  className="text-caption text-ink-600 hover:text-foreground focus-visible:shadow-focus sr-only rounded-sm px-1 outline-none group-focus-within:not-sr-only group-hover:not-sr-only"
                  onClick={() =>
                    act.run(
                      () =>
                        setSectionHiddenAction({
                          surface,
                          section: s.key,
                          hidden: !hidden.has(s.key),
                        }),
                      C.saved,
                    )
                  }
                >
                  {hidden.has(s.key) ? C.show : C.hide}
                  <span className="sr-only">: {s.display}</span>
                </button>
              </div>
            ))}
            <h2 className="text-caption text-ink-600 px-2 pt-3 font-semibold tracking-wide uppercase">
              {C.whereHead}
            </h2>
            {(["in_house", "referred", "not_offered"] as const).map((w) => (
              <SideItem
                key={w}
                on={where === w}
                label={C.where[w]}
                n={all.filter((r) => r.o.where === w).length}
                onClick={() => setWhere(where === w ? null : w)}
              />
            ))}
          </aside>

          <section
            aria-busy={act.pending || undefined}
            className="bg-card shadow-tide-card flex min-w-0 flex-col rounded-xl pb-20"
          >
            <div className="flex flex-wrap items-center gap-2 p-4 pb-2">
              <label className="relative min-w-64 flex-1">
                <span className="sr-only">{C.search}</span>
                <SearchIcon
                  aria-hidden
                  className="text-ink-500 absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={C.search}
                  className="border-ink-300 bg-card focus-visible:shadow-focus h-10 w-full rounded-full border pr-3 pl-9 text-[14px] outline-none"
                />
              </label>
              <div role="group" aria-label={C.filters.all} className="flex flex-wrap gap-1.5">
                {(Object.keys(C.filters) as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={chip(filter === f)}
                  >
                    {C.filters[f]}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-body-s text-ink-600 px-4 pb-2">{C.sectionHelp}</p>
            {act.message ? (
              <p
                role="status"
                className={cn(
                  "text-body-s px-4 pb-2",
                  act.message.ok ? "text-ink-700" : "text-amber-800",
                )}
              >
                {act.message.text}
              </p>
            ) : null}
            {query.trim() && rows.length === 0 ? (
              <p className="text-body-s text-ink-600 px-4 py-6">{C.nothingMatches(query.trim())}</p>
            ) : null}
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-left">
                <caption className="sr-only">{C.title}</caption>
                <thead>
                  <tr className="text-caption text-ink-600 border-ink-150 border-b font-semibold tracking-wide uppercase">
                    <th scope="col" className="w-10 px-4 py-2">
                      <span className="sr-only">{C.cols.select}</span>
                    </th>
                    <th scope="col" className="px-2 py-2">
                      {C.cols.test}
                    </th>
                    <th scope="col" className="px-2 py-2">
                      {C.cols.section}
                    </th>
                    <th scope="col" className="px-2 py-2">
                      {C.cols.where}
                    </th>
                    <th scope="col" className="px-2 py-2">
                      {C.cols.hours}
                    </th>
                    <th scope="col" className="px-2 py-2">
                      {C.cols.turnaround}
                    </th>
                    <th scope="col" className="px-2 py-2">
                      {C.cols.last}
                    </th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.key}>
                    <tr className="bg-tide-sunken/60 border-ink-150 border-b">
                      <th scope="colgroup" colSpan={5} className="px-4 py-2.5 text-left">
                        <span className="text-body-s text-foreground font-semibold">{g.label}</span>
                        <span className="text-body-s text-ink-600 ml-2">
                          {C.groupCount(g.rows.length)}
                        </span>
                        {g.key === "hidden" ? (
                          <span className="text-caption text-ink-600 mt-0.5 flex items-center gap-1 font-normal">
                            <InfoIcon aria-hidden className="size-3.5" />
                            {C.hiddenWarning}
                          </span>
                        ) : null}
                      </th>
                      <td colSpan={2} className="px-4 py-2.5 text-right">
                        {g.key !== "hidden" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDialog({ kind: "hours", section: g.key as SectionKey })
                            }
                            className="text-body-s text-primary focus-visible:shadow-focus rounded-sm font-medium outline-none hover:underline"
                          >
                            {C.setSectionHours}
                            <span className="sr-only">: {g.label}</span>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {g.rows.map((r) => (
                      <MenuRow
                        key={r.t.code}
                        row={r}
                        selected={selected.has(r.t.code)}
                        open={open.has(r.t.code)}
                        problem={data.problems[r.t.code] ?? null}
                        pending={act.pending}
                        onSelect={() => setSelected((s) => toggle(s, r.t.code))}
                        onOpen={() => setOpen((s) => toggle(s, r.t.code))}
                        onDetail={() => setDialog({ kind: "detail", code: r.t.code })}
                        onWhere={(w) => save([{ ...r.o, where: w }])}
                      />
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </section>
        </div>
      )}

      {selected.size ? (
        <BulkBar
          rows={all.filter((r) => selected.has(r.t.code))}
          pending={act.pending}
          onClear={() => setSelected(new Set())}
          onApply={(patch) =>
            save(
              all.filter((r) => selected.has(r.t.code)).map((r) => ({ ...r.o, ...patch })),
              C.applied(selected.size),
            )
          }
        />
      ) : null}

      {dialog?.kind === "level" ? (
        <LevelDialog data={data} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "add" ? (
        <AddTestsDialog
          data={data}
          onClose={() => setDialog(null)}
          onAsk={() => setDialog({ kind: "request" })}
        />
      ) : null}
      {dialog?.kind === "request" ? (
        <RequestDialog data={data} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "hours" ? (
        <SectionHoursDialog
          section={dialog.section}
          rows={all
            .filter((r) => r.section === dialog.section && r.o.where === "in_house")
            .map((r) => r.o)}
          surface={surface}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {detail ? (
        <TestDetailDialog
          test={detail}
          offering={data.menu.find((o) => o.code === detail.code)!}
          profiles={data.profiles.filter((p) => p.testCodes.includes(detail.code)).length}
          surface={surface}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function SideItem(props: {
  on: boolean;
  label: string;
  n: number;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={props.onClick}
      className={cn(
        "text-body-s focus-visible:shadow-focus flex min-h-9 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 text-left outline-none",
        props.on
          ? "bg-tide-lagoon-tint text-foreground font-semibold"
          : "hover:bg-ink-50 text-ink-700",
        props.muted && "text-ink-500",
      )}
    >
      <span>{props.label}</span>
      <span className="text-caption tabular-nums">{props.n}</span>
    </button>
  );
}

/** Where: a three-part control (In-house · Referred · Not offered). */
export function WhereControl(props: {
  value: Where;
  onChange: (w: Where) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className="bg-tide-sunken inline-flex rounded-full p-0.5"
    >
      {(["in_house", "referred", "not_offered"] as const).map((w) => (
        <button
          key={w}
          type="button"
          role="radio"
          aria-checked={props.value === w}
          disabled={props.disabled}
          onClick={() => props.value !== w && props.onChange(w)}
          className={cn(
            "focus-visible:shadow-focus h-7 rounded-full px-2.5 text-[12.5px] whitespace-nowrap outline-none",
            props.value === w
              ? "bg-tide-navy-900 text-tide-on-band font-semibold"
              : "text-ink-600 hover:text-foreground font-medium",
          )}
        >
          {C.where[w]}
        </button>
      ))}
    </div>
  );
}

function MenuRow(props: {
  row: Row;
  selected: boolean;
  open: boolean;
  problem: string | null;
  pending: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDetail: () => void;
  onWhere: (w: Where) => void;
}) {
  const { t, o, section } = props.row;
  const changed = section !== t.section;
  const name = t.masked ? C.restrictedTest : t.display;
  const notSet = <span className="text-ink-500">{C.notSet}</span>;
  return (
    <>
      <tr
        className={cn(
          "border-ink-150 border-b align-top",
          props.selected && "bg-tide-lagoon-tint/60",
        )}
      >
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={props.selected}
            onChange={props.onSelect}
            aria-label={`${C.cols.select} ${name}`}
            className="accent-tide-navy-900 size-4"
          />
        </td>
        <td className="px-2 py-3">
          <button
            type="button"
            onClick={props.onDetail}
            className="text-body text-foreground focus-visible:shadow-focus rounded-sm text-left font-semibold outline-none hover:underline"
          >
            {name}
          </button>
          {t.restricted ? <Pill className="ml-2 align-middle">{C.restricted}</Pill> : null}
          <div className="text-body-s text-ink-600 mt-0.5 flex flex-wrap items-center gap-x-1">
            {t.aliases.slice(0, 2).join(", ")}
            {t.components.length ? (
              <>
                {t.aliases.length ? " · " : ""}
                <button
                  type="button"
                  aria-expanded={props.open}
                  onClick={props.onOpen}
                  className="text-primary focus-visible:shadow-focus inline-flex items-center gap-0.5 rounded-sm font-medium outline-none"
                >
                  {C.results(t.components.length)}
                  <ChevronDownIcon
                    aria-hidden
                    className={cn("size-3.5", props.open && "rotate-180")}
                  />
                </button>
              </>
            ) : null}
          </div>
          {t.advisory ? (
            <p className="text-body-s text-ink-700 mt-1 flex items-start gap-1">
              <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t.advisory}
            </p>
          ) : null}
        </td>
        <td className="text-body-s px-2 py-3">
          <span className="text-foreground">{sectionName(section)}</span>
          <span className="text-caption text-ink-600 mt-0.5 flex items-center gap-1">
            {changed ? (
              C.changedFrom(sectionName(t.section))
            ) : (
              <>
                <CheckIcon aria-hidden className="size-3" />
                {C.recommended}
              </>
            )}
          </span>
        </td>
        <td className="px-2 py-3">
          <WhereControl
            value={o.where}
            disabled={props.pending}
            onChange={props.onWhere}
            label={`${C.cols.where}: ${name}`}
          />
        </td>
        <td className="text-body-s px-2 py-3">{hoursWords(o) ?? notSet}</td>
        <td className="text-body-s px-2 py-3">
          {o.where === "not_offered" ? "—" : (minutesWords(o.statedTurnaroundMinutes) ?? notSet)}
        </td>
        <td className="text-body-s px-2 py-3">
          {o.where === "referred" ? (
            (o.referredTo ?? notSet)
          ) : o.where === "in_house" ? (
            props.problem ? (
              <Pill tone="caution">{props.problem}</Pill>
            ) : (
              <span className="text-ink-700">{C.available}</span>
            )
          ) : (
            "—"
          )}
        </td>
      </tr>
      {props.open && t.components.length ? (
        <tr className="border-ink-150 border-b">
          <td />
          <td colSpan={6} className="px-2 pb-3">
            <ul className="flex flex-wrap gap-1.5">
              {t.components.map((c) => (
                <li
                  key={c.id}
                  className="text-body-s text-ink-700 rounded-full px-2.5 py-0.5 shadow-[inset_0_0_0_1px_var(--color-ink-300)]"
                >
                  {c.display}
                </li>
              ))}
            </ul>
            <p className="text-body-s text-ink-600 mt-2">{C.resultsLine}</p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

type Patch = Partial<
  Pick<MenuOffering, "where" | "hours" | "hoursNote" | "statedTurnaroundMinutes" | "referredTo">
>;

/** The navy bulk bar: Where · Hours · Stated turnaround · Referred to · Apply (TM-13: one audit row per test). */
function BulkBar(props: {
  rows: Row[];
  pending: boolean;
  onClear: () => void;
  onApply: (p: Patch) => void;
}) {
  const [where, setWhere] = useState<Where | "">("");
  const [hours, setHours] = useState<"" | "24h" | "scheduled">("");
  const [tat, setTat] = useState("");
  const [to, setTo] = useState("");
  const sections = [...new Set(props.rows.map((r) => sectionName(r.section)))];
  const patch: Patch = {
    ...(where ? { where } : {}),
    ...(hours ? { hours, hoursNote: hours === "scheduled" ? C.hours.scheduled : null } : {}),
    ...(tat ? { statedTurnaroundMinutes: Number(tat) } : {}),
    ...(to.trim() ? { referredTo: to.trim() } : {}),
  };
  const field =
    "h-8 rounded-full bg-tide-navy-800 text-tide-on-band px-3 text-[13px] outline-none focus-visible:shadow-focus";
  return (
    <div
      role="region"
      aria-label={C.selected(props.rows.length)}
      className="bg-tide-navy-900 text-tide-on-band shadow-tide-float fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-full px-4 py-2"
    >
      <span className="text-body-s font-semibold">{C.selected(props.rows.length)}</span>
      <span className="text-body-s opacity-80">{sections.slice(0, 2).join(", ")}</span>
      <select
        aria-label={C.cols.where}
        value={where}
        onChange={(e) => setWhere(e.target.value as Where | "")}
        className={field}
      >
        <option value="">{C.cols.where}</option>
        {(["in_house", "referred", "not_offered"] as const).map((w) => (
          <option key={w} value={w}>
            {C.where[w]}
          </option>
        ))}
      </select>
      <select
        aria-label={C.cols.hours}
        value={hours}
        onChange={(e) => setHours(e.target.value as "" | "24h" | "scheduled")}
        className={field}
      >
        <option value="">{C.cols.hours}</option>
        <option value="24h">{C.hours["24h"]}</option>
        <option value="scheduled">{C.hours.scheduled}</option>
      </select>
      <input
        aria-label={C.turnaroundMinutes}
        placeholder={C.turnaroundMinutes}
        inputMode="numeric"
        value={tat}
        onChange={(e) => setTat(e.target.value.replace(/\D/g, ""))}
        className={cn(field, "placeholder:text-tide-on-band/70 w-52")}
      />
      <input
        aria-label={C.referredTo}
        placeholder={C.referredTo}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className={cn(field, "placeholder:text-tide-on-band/70 w-40")}
      />
      <LabButton
        type="button"
        variant="primary"
        busy={props.pending}
        disabledReason={Object.keys(patch).length ? undefined : C.keep}
        onClick={() => props.onApply(patch)}
      >
        {C.apply}
      </LabButton>
      <button
        type="button"
        onClick={props.onClear}
        className="text-body-s focus-visible:shadow-focus rounded-sm px-1 underline-offset-4 outline-none hover:underline"
      >
        {C.clear}
      </button>
    </div>
  );
}
