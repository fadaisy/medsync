"use client";

import type { Line } from "@/lib/pharmacy/derive/medicines";
import type { CatalogueItem } from "@/lib/pharmacy/medicines/store";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { SearchIcon } from "lucide-react";

import {
  addFromCatalogueAction,
  addLocalLineAction,
  catalogueAction,
} from "@/app/pharmacy/medicines-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import {
  ATC,
  CLASSES,
  LOCAL_FORMS,
  LOCAL_REASONS,
  LOCAL_ROUTES,
  MEDICINES,
  SALE,
  UNIT_BY_FORM,
  UNITS,
} from "@/content/pharmacy-medicines";
import { lineIdentityKey } from "@/lib/pharmacy/derive/medicines";
import { cn } from "@/lib/utils";
import { field, linkBtn, newKey, pillBtn } from "./shared";

const C = MEDICINES.catalogue;
const L = MEDICINES.local;
type Reason = keyof typeof LOCAL_REASONS;

const labelCls = "text-body-s flex flex-col gap-1.5 font-semibold";
const input = cn(field, "h-11 w-full rounded-tide-field sm:h-9");

/** Add from the catalogues (§11.2): list mode with the duplicate guard, and local mode for a medicine in none. */
export function CatalogueDialog({
  open,
  onClose,
  lines,
  toast,
  onLocalAdded,
}: {
  open: boolean;
  onClose: () => void;
  lines: Line[];
  toast: (m: string) => void;
  onLocalAdded: (name: string) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<CatalogueItem[] | null>(null);
  const [mode, setMode] = useState<"list" | "local">("list");
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("all");
  const [atc, setAtc] = useState("");
  const [cls, setCls] = useState("");
  const [sale, setSale] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [units, setUnits] = useState<Record<string, string>>({});
  const [onlyTicked, setOnlyTicked] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loc, setLoc] = useState({
    generic: "",
    strength: "",
    form: "Tablet",
    route: "Oral",
    unit: "tablet",
    cls: "",
    packs: "",
    reason: "specialist_request" as Reason,
  });
  const [key] = useState(newKey);

  // Remounted (a new key) on each open: it starts in list mode with nothing ticked and reads the catalogue fresh.
  useEffect(() => {
    if (open && !items)
      void catalogueAction().then((r) => setItems(r.ok ? (r.data?.items ?? []) : []));
  }, [open, items]);

  const stocked = useMemo(() => {
    const byKey = new Map(lines.map((l) => [lineIdentityKey(l), l.name]));
    const generics = new Set(lines.map((l) => l.generic.toLowerCase()));
    return { byKey, generics };
  }, [lines]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        (src === "all" || i.sources.includes(src)) &&
        (!atc || i.atc === atc) &&
        (!cls || i.cls === cls) &&
        (!sale || i.sale === sale) &&
        (!s ||
          i.name.toLowerCase().includes(s) ||
          (i.cls ?? "").toLowerCase().includes(s) ||
          (i.group ?? "").toLowerCase().includes(s)),
    );
  }, [items, q, src, atc, cls, sale]);
  // A filter offers only what the catalogue carries; one with nothing behind it is not shown.
  const has = useMemo(() => {
    const all = items ?? [];
    return {
      atc: new Set(all.map((i) => i.atc).filter(Boolean)),
      cls: new Set(all.map((i) => i.cls).filter(Boolean)),
      sale: new Set(all.map((i) => i.sale).filter(Boolean)),
    };
  }, [items]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const i of items ?? []) for (const s of i.sources) c[s] = (c[s] ?? 0) + 1;
    return c;
  }, [items]);

  const tickedItems = (items ?? []).filter((i) => ticked.has(i.id));
  const ready = tickedItems.filter((i) => i.unit || units[i.id]);
  const listed = onlyTicked ? tickedItems : shown.slice(0, 300);
  const tickable = shown.filter((i) => !stocked.byKey.has(lineIdentityKey(i)));
  const unitFor = (i: CatalogueItem) =>
    !i.unit && i.formCode && UNIT_BY_FORM[i.formCode] ? UNIT_BY_FORM[i.formCode] : null;
  const tickAll = () => {
    setTicked((t) => new Set([...t, ...tickable.map((i) => i.id)]));
    setUnits((u) => {
      const n = { ...u };
      for (const i of tickable) if (!n[i.id] && unitFor(i)) n[i.id] = unitFor(i)!;
      return n;
    });
  };

  // A whole class or list goes in batches of 50 (the server's limit), with progress. Medicines still without a
  // unit are not sent; they stay ticked, shown alone, for the unit to be chosen.
  const add = () =>
    start(async () => {
      setErr(null);
      const wait = tickedItems.filter((i) => !i.unit && !units[i.id]);
      let added = 0;
      const refused: string[] = [];
      for (let k = 0; k < ready.length; k += 50) {
        setProgress(C.adding(k, ready.length));
        const ids = ready.slice(k, k + 50).map((i) => i.id);
        const r = await addFromCatalogueAction({
          ids,
          units: Object.fromEntries(ids.filter((id) => units[id]).map((id) => [id, units[id]])),
        });
        if (!r.ok) {
          refused.push(r.error);
          break;
        }
        added += r.data!.added;
        refused.push(...r.data!.refused);
      }
      setProgress(null);
      if (added) toast(C.added(added));
      const msgs = [
        ...(wait.length ? [C.waiting(wait.length)] : []),
        ...refused.slice(0, 3),
        ...(refused.length > 3 ? [C.more(refused.length - 3)] : []),
      ];
      setErr(msgs.length ? msgs.join(" ") : null);
      setTicked(new Set(wait.map((i) => i.id)));
      setOnlyTicked(wait.length > 0);
      if (!msgs.length) onClose();
      router.refresh();
    });

  const ident = {
    generic: loc.generic.trim(),
    strength: loc.strength.trim() || null,
    form: loc.form || null,
    route: loc.route || null,
  };
  const dupAs = ident.generic ? stocked.byKey.get(lineIdentityKey(ident)) : undefined;
  const addLocal = () => {
    if (!ident.generic || !ident.strength) return setErr(L.required);
    if (dupAs) return setErr(L.dup(dupAs));
    start(async () => {
      setErr(null);
      const r = await addLocalLineAction({
        clientKey: key,
        generic: ident.generic,
        strength: ident.strength,
        form: ident.form,
        route: ident.route,
        unit: loc.unit,
        cls: loc.cls || null,
        packs: loc.packs
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0),
        reason: loc.reason,
      });
      if (!r.ok) return setErr(r.error);
      toast(L.added(`${ident.generic} ${ident.strength}`));
      onLocalAdded(ident.generic);
      onClose();
      router.refresh();
    });
  };

  const set = (k: keyof typeof loc) => (e: { target: { value: string } }) => (
    setLoc((x) => ({ ...x, [k]: e.target.value })),
    setErr(null)
  );

  return (
    <EditorDialog open={open} onOpenChange={(o) => !o && !pending && onClose()} width="wide">
      <div className="flex items-start justify-between gap-3 px-6 pt-5">
        <div className="flex flex-col gap-1">
          <DialogTitle>{mode === "list" ? C.title : L.title}</DialogTitle>
          {mode === "local" ? (
            <p className="text-body-s text-ink-600 max-w-prose">{L.lead}</p>
          ) : null}
        </div>
        <LabButton variant="text" onClick={onClose}>
          {C.close}
        </LabButton>
      </div>

      {mode === "list" ? (
        <>
          <div className="flex flex-col gap-3 px-6 pt-4">
            <label className="border-ink-300 bg-card flex h-11 items-center gap-2 rounded-full border px-4 sm:h-10">
              <SearchIcon aria-hidden className="text-ink-600 size-4" />
              <input
                aria-label={C.findAria}
                placeholder={C.findPh}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
            </label>
            <div role="group" aria-label={C.sourcesAria} className="flex flex-wrap gap-1.5">
              {C.sources.map(([k, label, tip]) => (
                <button
                  key={k}
                  type="button"
                  title={tip}
                  aria-pressed={src === k}
                  onClick={() => setSrc(k)}
                  className={pillBtn(src === k)}
                >
                  {label} <span className="font-normal tabular-nums">{counts[k] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {has.atc.size ? (
                <label className={labelCls}>
                  {C.atc}
                  <select value={atc} onChange={(e) => setAtc(e.target.value)} className={input}>
                    <option value="">{C.all}</option>
                    {Object.entries(ATC)
                      .filter(([k]) => has.atc.has(k))
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {k} {v}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              {has.cls.size ? (
                <label className={labelCls}>
                  {C.cls}
                  <select value={cls} onChange={(e) => setCls(e.target.value)} className={input}>
                    <option value="">{C.allClasses}</option>
                    {CLASSES.filter((c) => has.cls.has(c)).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {has.sale.size ? (
                <label className={labelCls}>
                  {C.sale}
                  <select value={sale} onChange={(e) => setSale(e.target.value)} className={input}>
                    <option value="">{C.all}</option>
                    {Object.entries(SALE)
                      .filter(([k]) => has.sale.has(k))
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 pt-3">
            {onlyTicked ? (
              <button type="button" className={linkBtn} onClick={() => setOnlyTicked(false)}>
                {C.showAll}
              </button>
            ) : tickable.length ? (
              <button type="button" className={linkBtn} onClick={tickAll}>
                {C.tickAll(tickable.length)}
              </button>
            ) : null}
            {ticked.size ? (
              <button
                type="button"
                className={linkBtn}
                onClick={() => (setTicked(new Set()), setOnlyTicked(false))}
              >
                {C.untickAll}
              </button>
            ) : null}
          </div>
          <ul
            aria-label={C.itemsAria}
            className="divide-border mt-3 flex min-h-48 flex-1 flex-col divide-y overflow-y-auto px-6"
          >
            {items === null ? (
              <li className="text-body-s text-ink-600 py-6">{C.loading}</li>
            ) : listed.length === 0 ? (
              <li className="text-body-s text-ink-600 py-6">{C.none}</li>
            ) : (
              listed.map((i) => {
                const as = stocked.byKey.get(lineIdentityKey(i));
                const sib = !as && stocked.generics.has(i.generic.toLowerCase());
                const on = ticked.has(i.id);
                return (
                  <li key={i.id}>
                    <label
                      className={cn(
                        "grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]",
                        as ? "opacity-60" : "cursor-pointer",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="text-body-s text-foreground block font-semibold">
                          {i.name}
                        </span>
                        <span className="text-caption text-ink-600 block">
                          {C.sub(
                            i.atc,
                            [i.cls, i.group, i.sale ? SALE[i.sale as keyof typeof SALE] : null],
                            i.unit,
                          )}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {(i.sources.length ? i.sources : [C.masterOnly]).map((s) => (
                            <span
                              key={s}
                              className="bg-tide-sunken text-ink-700 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            >
                              {s}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="text-caption text-ink-700 col-start-1 sm:col-start-auto sm:text-right">
                        {as
                          ? as === i.name
                            ? C.already
                            : C.alreadyAs(as)
                          : sib
                            ? C.sibling
                            : null}
                      </span>
                      <input
                        type="checkbox"
                        disabled={!!as}
                        checked={on}
                        onChange={() => {
                          setTicked((t) => {
                            const n = new Set(t);
                            if (n.has(i.id)) n.delete(i.id);
                            else n.add(i.id);
                            return n;
                          });
                          if (!units[i.id] && unitFor(i))
                            setUnits((u) => ({ ...u, [i.id]: unitFor(i)! }));
                        }}
                        className="accent-primary col-start-2 row-span-2 row-start-1 size-5 sm:col-start-3"
                      />
                    </label>
                    {on && !i.unit ? (
                      <label className="text-caption text-ink-700 flex items-center gap-2 pb-2.5">
                        {C.unit}
                        <select
                          aria-label={C.unitAria(i.name)}
                          value={units[i.id] ?? ""}
                          onChange={(e) => setUnits((u) => ({ ...u, [i.id]: e.target.value }))}
                          className={field}
                        >
                          <option value="" disabled>
                            {C.choose}
                          </option>
                          {UNITS.map((f) => (
                            <option key={f}>{f}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
          {err ? (
            <p
              role="alert"
              className="text-body-s text-status-critical-fg-aa px-6 pt-2 font-semibold"
            >
              {err}
            </p>
          ) : null}
          <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
            <button
              type="button"
              className={linkBtn}
              onClick={() => (
                setMode("local"),
                setErr(null),
                setLoc((x) => ({ ...x, generic: q.trim() }))
              )}
            >
              + {C.local}
            </button>
            <span className="flex flex-wrap items-center gap-3">
              {ticked.size ? (
                <span className="text-body-s text-ink-700">{C.ticked(ticked.size)}</span>
              ) : null}
              <LabButton variant="text" onClick={onClose}>
                {C.cancel}
              </LabButton>
              <LabButton
                variant="primary"
                busy={pending}
                disabledReason={!ticked.size ? C.ticked(0) : !ready.length ? C.needUnit : null}
                onClick={add}
              >
                {progress ?? C.addN(ready.length)}
              </LabButton>
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-4 sm:grid-cols-2">
            <label className={labelCls}>
              {L.generic}
              <input
                value={loc.generic}
                onChange={set("generic")}
                placeholder={L.genericPh}
                className={input}
              />
            </label>
            <label className={labelCls}>
              {L.strength}
              <input
                value={loc.strength}
                onChange={set("strength")}
                placeholder={L.strengthPh}
                className={input}
              />
            </label>
            <label className={labelCls}>
              {L.form}
              <select value={loc.form} onChange={set("form")} className={input}>
                {LOCAL_FORMS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {L.route}
              <select value={loc.route} onChange={set("route")} className={input}>
                {LOCAL_ROUTES.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {L.unit}
              <select value={loc.unit} onChange={set("unit")} className={input}>
                {UNITS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {L.cls}
              <select value={loc.cls} onChange={set("cls")} className={input}>
                <option value="">{MEDICINES.grid.notSet}</option>
                {CLASSES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {L.packs}
              <input
                value={loc.packs}
                onChange={set("packs")}
                placeholder={L.packsPh}
                inputMode="numeric"
                className={input}
              />
            </label>
            <label className={labelCls}>
              {L.why}
              <select value={loc.reason} onChange={set("reason")} className={input}>
                {Object.entries(LOCAL_REASONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <p className="bg-ink-50 text-body-s rounded-tide-field px-3 py-2.5 sm:col-span-2">
              <b>{L.newLine}</b>
              {ident.generic && ident.strength
                ? L.preview(
                    [ident.generic, ident.strength, ident.form, ident.route].filter(
                      Boolean,
                    ) as string[],
                    loc.unit,
                  )
                : L.previewEmpty}
            </p>
            {err || dupAs ? (
              <p
                role="alert"
                className="text-body-s text-status-critical-fg-aa font-semibold sm:col-span-2"
              >
                {err ?? L.dup(dupAs!)}
              </p>
            ) : null}
          </div>
          <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
            <button
              type="button"
              className={linkBtn}
              onClick={() => (setMode("list"), setErr(null))}
            >
              {L.back}
            </button>
            <span className="flex gap-2">
              <LabButton variant="text" onClick={onClose}>
                {C.cancel}
              </LabButton>
              <LabButton variant="primary" busy={pending} onClick={addLocal}>
                {L.add}
              </LabButton>
            </span>
          </div>
        </>
      )}
    </EditorDialog>
  );
}
