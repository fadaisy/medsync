"use client";

import type {
  CatalogueTest,
  Hours,
  Level,
  MenuOffering,
  SectionKey,
  Where,
} from "@/lib/lab/test-menu";
import type { Surface, TestMenuData } from "@/lib/lab/test-menu-read";
import { useMemo, useState } from "react";
import { InfoIcon } from "lucide-react";

import { LabButton } from "@/components/tide/work/button";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import {
  applyTemplate,
  minutesWords,
  NATIONAL_LABS,
  rankTests,
  relatedTo,
  sectionName,
  SECTIONS,
  TEMPLATE_LEVELS,
  templateFor,
} from "@/lib/lab/test-menu";
import {
  applyTemplateAction,
  createRequestAction,
  saveOfferingsAction,
} from "@/lib/lab/test-menu-actions";
import { cn } from "@/lib/utils";
import { rowItem, WhereControl } from "./test-menu";
import { newKey, useMenuAction } from "./use-menu-action";

const field =
  "border-ink-300 bg-card focus-visible:shadow-focus h-10 w-full rounded-lg border px-3 text-[14px] outline-none";
const label = "text-body-s text-foreground flex flex-col gap-1.5 font-medium";

function Said({ message }: { message: { ok: boolean; text: string } | null }) {
  return message ? (
    <p role="status" className={cn("text-body-s", message.ok ? "text-ink-700" : "text-amber-800")}>
      {message.text}
    </p>
  ) : null;
}

/* ─── Board 14: Start from your level (5.2, TM-6, TM-7) ──────────────────── */

export function LevelDialog({ data, onClose }: { data: TestMenuData; onClose: () => void }) {
  const act = useMenuAction();
  const [level, setLevel] = useState<Level | null>(data.level);
  const [privateLab, setPrivateLab] = useState(false);
  const [hours, setHours] = useState<Hours>("24h");
  const [off, setOff] = useState<Set<SectionKey>>(new Set());
  const counts = useMemo(
    () =>
      Object.fromEntries(
        TEMPLATE_LEVELS.map((l) => {
          const t = templateFor(l, data.tests);
          return [l, [t.filter((r) => r.where === "in_house").length, t.length]];
        }),
      ) as Record<Level, [number, number]>,
    [data.tests],
  );
  const tests = useMemo(() => new Map(data.tests.map((t) => [t.code, t])), [data.tests]);
  const tpl = level ? templateFor(level, data.tests) : [];
  const chosen = tpl.filter((r) => !off.has(tests.get(r.code)!.section!));
  const preview = applyTemplate(data.menu, chosen, hours);
  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="wide">
      <SheetHeader>
        <SheetTitle>{C.levelTitle}</SheetTitle>
        <SheetDescription>{C.levelLead}</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-5">
        <div role="radiogroup" aria-label={C.levelTitle} className="grid gap-2 sm:grid-cols-3">
          {[...TEMPLATE_LEVELS, "private" as const].map((l) => {
            const on = l === "private" ? privateLab : !privateLab && level === l;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() =>
                  l === "private" ? setPrivateLab(true) : (setPrivateLab(false), setLevel(l))
                }
                className={cn(
                  "focus-visible:shadow-focus flex flex-col items-start gap-1 rounded-xl border p-3 text-left outline-none",
                  on
                    ? "border-tide-navy-900 bg-tide-lagoon-tint"
                    : "border-ink-200 hover:bg-ink-50",
                )}
              >
                <span className="text-body text-foreground font-semibold">{C.levels[l]}</span>
                <span className="text-body-s text-ink-600">
                  {l === "private"
                    ? C.privateNote
                    : C.levelCounts(counts[l][0], counts[l][1] - counts[l][0])}
                </span>
                {l === data.level ? (
                  <span className="text-caption text-ink-600">{C.yourLevel}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="text-body-s text-ink-600">{C.levelSource}</p>
        {level && !privateLab ? (
          <>
            <table className="text-body-s w-full border-collapse text-left">
              <thead>
                <tr className="text-caption text-ink-600 border-ink-150 border-b uppercase">
                  <th scope="col" className="py-2 pr-2">
                    {C.sectionTable.section}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {C.sectionTable.inHouse}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {C.sectionTable.referred}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {C.sectionTable.examples}
                  </th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s) => {
                  const rows = tpl.filter((r) => tests.get(r.code)!.section === s.key);
                  return (
                    <tr key={s.key} className="border-ink-150 border-b">
                      <td className="py-2 pr-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="accent-tide-navy-900 size-4"
                            checked={!off.has(s.key)}
                            onChange={() =>
                              setOff((o) => {
                                const n = new Set(o);
                                if (n.has(s.key)) n.delete(s.key);
                                else n.add(s.key);
                                return n;
                              })
                            }
                          />
                          {s.display}
                        </label>
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {rows.filter((r) => r.where === "in_house").length}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {rows.filter((r) => r.where === "referred").length}
                      </td>
                      <td className="text-ink-600 px-2 py-2">
                        {rows
                          .slice(0, 3)
                          .map((r) => tests.get(r.code)!.display)
                          .join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-s text-foreground mb-1 font-medium">
                {C.hoursChoice}
              </legend>
              <div className="flex flex-wrap gap-4">
                {(["24h", "scheduled", null] as const).map((h) => (
                  <label key={String(h)} className="text-body-s flex items-center gap-2">
                    <input
                      type="radio"
                      name="tm-hours"
                      className="accent-tide-navy-900"
                      checked={hours === h}
                      onChange={() => setHours(h)}
                    />
                    {C.hours[h ?? "none"]}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-body-s text-ink-600">{C.referChoice}</p>
            {data.menu.length ? (
              <p className="text-body-s text-foreground font-medium">
                {C.preview(preview.counts.added, preview.counts.kept, preview.counts.outside)}
              </p>
            ) : null}
          </>
        ) : null}
      </SheetBody>
      <SheetFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-s text-ink-600">{C.turnaroundLine}</p>
        <div className="flex items-center gap-2">
          <Said message={act.message} />
          <LabButton type="button" onClick={onClose}>
            {C.cancel}
          </LabButton>
          <LabButton
            type="button"
            variant="primary"
            busy={act.pending}
            disabledReason={
              !level || privateLab
                ? C.privateNote
                : preview.add.length
                  ? undefined
                  : C.preview(0, preview.counts.kept, preview.counts.outside)
            }
            onClick={() =>
              act.run(
                () =>
                  applyTemplateAction({
                    surface: data.surface,
                    clientKey: newKey(),
                    level: level!,
                    sections: SECTIONS.map((s) => s.key).filter((k) => !off.has(k)),
                    hours,
                  }),
                (r) => C.done(r.data?.added ?? 0),
              )
            }
          >
            {C.addN(preview.add.length)}
          </LabButton>
        </div>
      </SheetFooter>
    </EditorDialog>
  );
}

/* ─── Board 15: Add tests (5.3) ─────────────────────────────────────────── */

export function AddTestsDialog(props: {
  data: TestMenuData;
  onClose: () => void;
  onAsk: () => void;
}) {
  const { data } = props;
  const act = useMenuAction();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<SectionKey | null>(null);
  const onMenu = new Set(data.menu.filter((o) => o.where !== "not_offered").map((o) => o.code));
  const pool = data.tests.filter((t) => !section || t.section === section);
  const exact = query.trim() ? rankTests(pool, query) : pool.filter((t) => !t.masked);
  const often =
    query.trim() && exact[0] ? relatedTo(exact[0], pool).filter((t) => !exact.includes(t)) : [];
  const add = (t: CatalogueTest) => {
    const national = (NATIONAL_LABS as readonly string[]).includes(t.referTo ?? "");
    const where: Where = t.usualRoute === "referred" ? "referred" : "in_house";
    act.run(
      () =>
        saveOfferingsAction({
          surface: data.surface,
          clientKey: newKey(),
          items: [
            {
              code: t.code,
              where,
              sectionOverride: null,
              hours: null,
              hoursNote: null,
              statedTurnaroundMinutes: null,
              referredTo: where === "referred" && national ? t.referTo : null,
            },
          ],
        }),
      C.addedNote,
    );
  };
  const row = (t: CatalogueTest) => (
    <li
      key={t.code}
      className="border-ink-150 flex flex-wrap items-start gap-3 border-b py-3 last:border-b-0"
    >
      <div className="min-w-60 flex-1">
        <p className="text-body text-foreground font-semibold">{t.display}</p>
        <p className="text-body-s text-ink-600">{t.aliases.slice(0, 3).join(", ")}</p>
        {t.components.length ? (
          <p className="text-body-s text-ink-600">
            {C.resultsPreview(
              t.components.length,
              t.components
                .slice(0, 4)
                .map((c) => c.display)
                .join(", "),
            )}
          </p>
        ) : null}
        {t.advisory ? (
          <p className="text-body-s text-ink-700 mt-1 flex items-start gap-1">
            <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t.advisory}
          </p>
        ) : null}
      </div>
      <div className="text-body-s w-44">
        <p className="text-foreground">{sectionName(t.section)}</p>
        <p className="text-ink-600">{C.recommended}</p>
      </div>
      <p className="text-body-s text-ink-600 w-56">
        {t.specimen && t.tube ? C.specimenTube(t.specimen, t.tube) : (t.specimen ?? "—")}
      </p>
      <div className="w-36 text-right">
        {onMenu.has(t.code) ? (
          <span className="text-body-s text-ink-600">{C.onMenu}</span>
        ) : (
          <LabButton
            type="button"
            busy={act.pending}
            disabledReason={t.signed ? undefined : C.notSigned}
            onClick={() => add(t)}
          >
            {C.add}
            <span className="sr-only">: {t.display}</span>
          </LabButton>
        )}
      </div>
    </li>
  );
  return (
    <EditorDialog open onOpenChange={(o) => !o && props.onClose()} width="xl">
      <SheetHeader>
        <SheetTitle>{C.addTitle}</SheetTitle>
        <SheetDescription>{C.addedNote}</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-3">
        <input
          type="search"
          autoFocus
          aria-label={C.search}
          placeholder={C.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(field, "rounded-full")}
        />
        <div role="group" aria-label={C.sectionsHead} className="flex flex-wrap gap-1.5">
          {[null, ...SECTIONS.map((s) => s.key)].map((k) => (
            <button
              key={k ?? "all"}
              type="button"
              aria-pressed={section === k}
              onClick={() => setSection(k)}
              className={cn(
                "focus-visible:shadow-focus h-8 rounded-full px-3 text-[13px] outline-none",
                section === k
                  ? "bg-tide-navy-900 text-tide-on-band font-semibold"
                  : "bg-card text-ink-700 hover:bg-ink-50 shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
              )}
            >
              {k ? sectionName(k) : C.allSections}
            </button>
          ))}
        </div>
        <Said message={act.message} />
        <section aria-label={C.exact}>
          <ul>{exact.slice(0, 60).map(row)}</ul>
        </section>
        {often.length ? (
          <section aria-labelledby="tm-often">
            <h3 id="tm-often" className="text-heading-s text-foreground mt-2">
              {C.often}
            </h3>
            <ul>{often.slice(0, 12).map(row)}</ul>
          </section>
        ) : null}
      </SheetBody>
      <SheetFooter className="flex-row items-center justify-between gap-3">
        <p className="text-body-s text-ink-600">
          {C.askLead}{" "}
          <button
            type="button"
            onClick={props.onAsk}
            className="text-primary focus-visible:shadow-focus rounded-sm font-medium outline-none hover:underline"
          >
            {C.ask}
          </button>
        </p>
        <LabButton type="button" onClick={props.onClose}>
          {C.cancel}
        </LabButton>
      </SheetFooter>
    </EditorDialog>
  );
}

/* ─── Board 16: Test detail (5.4) ───────────────────────────────────────── */

export function TestDetailDialog(props: {
  test: CatalogueTest;
  offering: MenuOffering;
  profiles: number;
  surface: Surface;
  onClose: () => void;
}) {
  const { test: t } = props;
  const act = useMenuAction();
  const [o, setO] = useState(props.offering);
  const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<MenuOffering>) => setO((x) => ({ ...x, ...p }));
  const save = (next: MenuOffering) =>
    act.run(
      () =>
        saveOfferingsAction({
          surface: props.surface,
          clientKey: newKey(),
          items: [rowItem(next)],
        }),
      C.saved,
      props.onClose,
    );
  const name = t.masked ? C.restrictedTest : t.display;
  return (
    <EditorDialog open onOpenChange={(x) => !x && props.onClose()} width="wide">
      <SheetHeader>
        <SheetTitle>{name}</SheetTitle>
        <SheetDescription>{t.aliases.slice(0, 4).join(", ") || C.detailTitle}</SheetDescription>
      </SheetHeader>
      <SheetBody className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className={label}>
            {C.cols.where}
            <WhereControl
              value={o.where}
              onChange={(w) => set({ where: w })}
              label={C.cols.where}
            />
          </div>
          <label className={label}>
            {C.sectionLabel}
            <select
              className={field}
              value={o.sectionOverride ?? t.section ?? ""}
              onChange={(e) => set({ sectionOverride: e.target.value as SectionKey })}
            >
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.key === t.section ? C.recommendedMark(s.display) : s.display}
                </option>
              ))}
            </select>
            <span className="text-caption text-ink-600 font-normal">{C.sectionHelp}</span>
          </label>
          {o.where === "in_house" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                {C.hoursLabel}
                <select
                  className={field}
                  value={o.hours ?? ""}
                  onChange={(e) => set({ hours: (e.target.value || null) as Hours })}
                >
                  <option value="">{C.hours.none}</option>
                  <option value="24h">{C.hours["24h"]}</option>
                  <option value="scheduled">{C.hours.scheduled}</option>
                </select>
              </label>
              {o.hours === "scheduled" ? (
                <label className={label}>
                  {C.hoursNote}
                  <input
                    className={field}
                    maxLength={60}
                    value={o.hoursNote ?? ""}
                    onChange={(e) => set({ hoursNote: e.target.value })}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
          {o.where !== "not_offered" ? (
            <>
              <label className={label}>
                {C.turnaroundMinutes}
                <input
                  className={field}
                  inputMode="numeric"
                  value={o.statedTurnaroundMinutes ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    set({ statedTurnaroundMinutes: v ? Number(v) : null });
                  }}
                />
                <span className="text-caption text-ink-600 font-normal">
                  {C.turnaroundHelp} {minutesWords(o.statedTurnaroundMinutes) ?? ""}
                </span>
              </label>
              <label className={label}>
                {o.where === "referred" ? C.referredToLabel : C.downRefer}
                <input
                  className={field}
                  maxLength={120}
                  value={o.referredTo ?? ""}
                  onChange={(e) => set({ referredTo: e.target.value || null })}
                />
              </label>
            </>
          ) : null}
        </div>
        <div className="bg-tide-sunken/60 flex flex-col gap-3 rounded-xl p-4">
          <h3 className="text-heading-s text-foreground">{C.fromCatalogue}</h3>
          <dl className="text-body-s grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-ink-600">{C.specimen}</dt>
            <dd>{[t.specimen, t.tube].filter(Boolean).join(" · ") || "—"}</dd>
            <dt className="text-ink-600">{C.orderCode}</dt>
            <dd className="font-mono">{t.orderLoinc ?? C.noOrderCode}</dd>
          </dl>
          {t.levelBasis ? (
            <p className="text-caption text-ink-600">
              {t.levelBasis.basis === "national_menu_2017"
                ? C.levelBasis(t.levelBasis.table, t.levelBasis.narrative)
                : C.judgement}
            </p>
          ) : null}
          {t.components.length ? (
            <table className="text-body-s w-full border-collapse text-left">
              <thead>
                <tr className="text-caption text-ink-600 border-ink-200 border-b uppercase">
                  <th scope="col" className="py-1.5 pr-2">
                    {C.resultCols.result}
                  </th>
                  <th scope="col" className="px-2 py-1.5">
                    {C.resultCols.unit}
                  </th>
                  <th scope="col" className="px-2 py-1.5">
                    {C.resultCols.loinc}
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.components.map((c) => (
                  <tr key={c.id} className="border-ink-150 border-b last:border-b-0">
                    <td className="py-1.5 pr-2">{c.display}</td>
                    <td className="px-2 py-1.5 font-mono">{c.unit ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono">{c.loinc ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="text-body-s text-ink-600">{C.catalogueLine}</p>
        </div>
      </SheetBody>
      <SheetFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          {confirm ? (
            <>
              <p className="text-body-s text-foreground max-w-md">
                {C.removeConsequence(props.profiles)}
              </p>
              <div>
                <LabButton
                  type="button"
                  busy={act.pending}
                  onClick={() => save({ ...o, where: "not_offered" })}
                >
                  {C.confirmRemove}
                </LabButton>
              </div>
            </>
          ) : props.offering.where !== "not_offered" ? (
            <LabButton type="button" variant="quiet" onClick={() => setConfirm(true)}>
              {C.remove}
            </LabButton>
          ) : null}
          <Said message={act.message} />
        </div>
        <div className="flex gap-2">
          <LabButton type="button" onClick={props.onClose}>
            {C.cancel}
          </LabButton>
          <LabButton type="button" variant="primary" busy={act.pending} onClick={() => save(o)}>
            {C.save}
          </LabButton>
        </div>
      </SheetFooter>
    </EditorDialog>
  );
}

/* ─── Set hours for the section (S8: that section's in-house tests only) ── */

export function SectionHoursDialog(props: {
  section: SectionKey;
  rows: MenuOffering[];
  surface: Surface;
  onClose: () => void;
}) {
  const act = useMenuAction();
  const [hours, setHours] = useState<"24h" | "scheduled">("24h");
  const [note, setNote] = useState("");
  return (
    <EditorDialog open onOpenChange={(o) => !o && props.onClose()} width="medium">
      <SheetHeader>
        <SheetTitle>{`${C.setSectionHours}: ${sectionName(props.section)}`}</SheetTitle>
        <SheetDescription>
          {C.groupCount(props.rows.length)} · {C.where.in_house}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-3">
        <label className={label}>
          {C.hoursLabel}
          <select
            className={field}
            value={hours}
            onChange={(e) => setHours(e.target.value as "24h" | "scheduled")}
          >
            <option value="24h">{C.hours["24h"]}</option>
            <option value="scheduled">{C.hours.scheduled}</option>
          </select>
        </label>
        {hours === "scheduled" ? (
          <label className={label}>
            {C.hoursNote}
            <input
              className={field}
              maxLength={60}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        ) : null}
        <Said message={act.message} />
      </SheetBody>
      <SheetFooter className="flex-row justify-end gap-2">
        <LabButton type="button" onClick={props.onClose}>
          {C.cancel}
        </LabButton>
        <LabButton
          type="button"
          variant="primary"
          busy={act.pending}
          disabledReason={props.rows.length ? undefined : C.groupCount(0)}
          onClick={() =>
            act.run(
              () =>
                saveOfferingsAction({
                  surface: props.surface,
                  clientKey: newKey(),
                  items: props.rows.map((o) =>
                    rowItem({
                      ...o,
                      hours,
                      hoursNote: hours === "scheduled" ? note.trim() || C.hours.scheduled : null,
                    }),
                  ),
                }),
              C.applied(props.rows.length),
              props.onClose,
            )
          }
        >
          {C.apply}
        </LabButton>
      </SheetFooter>
    </EditorDialog>
  );
}

/* ─── 5.6: Ask for a test to be added (TM-11) ───────────────────────────── */

export function RequestDialog({ data, onClose }: { data: TestMenuData; onClose: () => void }) {
  const act = useMenuAction();
  const [f, setF] = useState({
    name: "",
    purpose: "",
    specimen: "",
    route: "in_house",
    reference: "",
  });
  const F = C.requestFields;
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Kampala",
  });
  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="medium">
      <SheetHeader>
        <SheetTitle>{C.requestTitle}</SheetTitle>
        <SheetDescription>{C.noPatientData}</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-3">
        {(["name", "purpose", "specimen"] as const).map((k) => (
          <label key={k} className={label}>
            {F[k]}
            <input
              className={field}
              required
              maxLength={k === "purpose" ? 500 : 120}
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
            />
          </label>
        ))}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-body-s text-foreground mb-1 font-medium">{F.route}</legend>
          <div className="flex gap-4">
            {(["in_house", "referred"] as const).map((r) => (
              <label key={r} className="text-body-s flex items-center gap-2">
                <input
                  type="radio"
                  name="tm-route"
                  className="accent-tide-navy-900"
                  checked={f.route === r}
                  onChange={() => setF({ ...f, route: r })}
                />
                {C.routes[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={label}>
          {F.reference}
          <input
            className={field}
            maxLength={300}
            value={f.reference}
            onChange={(e) => setF({ ...f, reference: e.target.value })}
          />
        </label>
        <Said message={act.message} />
        {data.requests.length ? (
          <section aria-labelledby="tm-requests">
            <h3 id="tm-requests" className="text-heading-s text-foreground mt-2">
              {C.myRequests}
            </h3>
            <ul className="text-body-s mt-1">
              {data.requests.map((r) => (
                <li
                  key={r.id}
                  className="border-ink-150 flex flex-wrap gap-x-2 border-b py-1.5 last:border-b-0"
                >
                  <span className="text-foreground font-medium">{r.name}</span>
                  <span className="text-ink-600">{date.format(new Date(r.at))}</span>
                  <span className="text-ink-700">· {C.requestStates[r.state]}</span>
                  {r.reason ? <span className="text-ink-600 w-full">{r.reason}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </SheetBody>
      <SheetFooter className="flex-row justify-end gap-2">
        <LabButton type="button" onClick={onClose}>
          {C.cancel}
        </LabButton>
        <LabButton
          type="button"
          variant="primary"
          busy={act.pending}
          disabledReason={
            f.name.trim().length >= 2 &&
            f.purpose.trim().length >= 3 &&
            f.specimen.trim().length >= 2
              ? undefined
              : C.requestFields.name
          }
          onClick={() =>
            act.run(
              () =>
                createRequestAction({
                  surface: data.surface,
                  clientKey: newKey(),
                  ...f,
                  reference: f.reference.trim() || null,
                }),
              C.requestSent,
              () => setF({ name: "", purpose: "", specimen: "", route: "in_house", reference: "" }),
            )
          }
        >
          {C.send}
        </LabButton>
      </SheetFooter>
    </EditorDialog>
  );
}
