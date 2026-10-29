"use client";

import type { CatalogueMedicine, MedicinePack } from "@/lib/pharmacy/shared-catalogue/medicine";
import type { CatalogueHit, HitGroup } from "@/lib/pharmacy/shared-catalogue/search";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckIcon, SearchIcon, XIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { CATALOGUE as C } from "@/content/pharmacy-catalogue";
import { STOCK_UP_POLISH } from "@/content/pharmacy-stock-up-polish";
import { pickKey, setPick, togglePick } from "@/lib/pharmacy/shared-catalogue/picks";
import { cn } from "@/lib/utils";
import { catalogueMedicineAction, catalogueSearchAction } from "../catalogue-actions";

export type CataloguePick =
  | { kind: "pack"; medicine: CatalogueMedicine; pack: MedicinePack }
  | { kind: "product"; productId: string; title: string };

const GROUPS: readonly HitGroup[] = ["medicine", "brand", "product"];
const M = STOCK_UP_POLISH.pick;

/** A pick in words: the product, or the medicine and its pack. */
export const pickTitle = (p: CataloguePick) =>
  p.kind === "product"
    ? p.title
    : `${p.medicine.displayName} · ${p.pack.packId ? `${p.pack.brand ?? C.loose} · ${p.pack.description}` : C.loose}`;

/** Each chip's value and how many hits carry it, most first. */
function countBy(hits: readonly CatalogueHit[], pick: (h: CatalogueHit) => string[]) {
  const n = new Map<string, number>();
  for (const h of hits) for (const v of pick(h)) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Pick from the catalogue (4.2, board 2): one centred dialog. Results are grouped (medicines, generic name first;
 * brands; your products), each saying why it matched, narrowed by form and route chips. Choosing a medicine shows
 * its other names and its packs; "The pack that came is not here" hands back to the caller (4.4, Step 6).
 * `onPickMany` (the delivery only) turns on multi mode: a pack, or one of your products, is ticked instead of picked,
 * a medicine whose only pack is "Unbranded · loose" (or a brand hit) is ticked with that pack, and "Add N lines"
 * hands every tick back at once. Without it the picker picks one and closes, as before.
 */
export function CataloguePicker({
  open,
  onOpenChange,
  onPick,
  onPickMany,
  onNotHere,
  prescribing,
  pickLabel = C.pick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (p: CataloguePick) => void;
  /** Multi mode: every ticked pick, in the order ticked. */
  onPickMany?: (p: CataloguePick[]) => void;
  onNotHere?: () => void;
  prescribing?: boolean;
  pickLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CatalogueHit[]>([]);
  const [form, setForm] = useState<string | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [medicine, setMedicine] = useState<CatalogueMedicine | null>(null);
  const [pack, setPack] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [ticked, setTicked] = useState<CataloguePick[]>([]);
  const multi = !!onPickMany;
  const close = () => {
    setTicked([]);
    onOpenChange(false);
  };
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const text = q.trim();
    const t = setTimeout(() => {
      const id = ++seq.current;
      if (text.length < 2) return setHits([]);
      start(async () => {
        const r = await catalogueSearchAction({ q: text, prescribing });
        if (id !== seq.current) return;
        setFailed(!r.ok);
        setHits(r.ok ? r.hits : []);
        setActive(0);
      });
    }, 180);
    return () => clearTimeout(t);
  }, [q, open, prescribing]);

  const forms = useMemo(() => countBy(hits, (h) => (h.form ? [h.form] : [])), [hits]);
  const routes = useMemo(() => countBy(hits, (h) => h.routes), [hits]);
  const shown = hits.filter(
    (h) => (!form || h.form === form) && (!route || h.routes.includes(route)),
  );
  const ordered = GROUPS.flatMap((g) => shown.filter((h) => h.group === g));

  const choose = (h: CatalogueHit | undefined) => {
    if (!h) return;
    if (h.group === "product") {
      const p: CataloguePick = { kind: "product", productId: h.id, title: h.title };
      if (multi) return setTicked((t) => togglePick(t, p));
      onPick(p);
      return onOpenChange(false);
    }
    if (!h.medicineId) return;
    start(async () => {
      const r = await catalogueMedicineAction({ id: h.medicineId });
      setMedicine(r.ok ? r.medicine : null);
      setFailed(!r.ok);
      const i =
        r.ok && h.group === "brand" ? r.medicine.packs.findIndex((p) => p.productId === h.id) : -1;
      setPack(i >= 0 ? i : null);
      if (!multi || !r.ok) return;
      // Multi mode: a brand hit names its pack, and a medicine whose only pack is loose takes that one.
      const only = r.medicine.packs.length === 1 ? 0 : i;
      const p = r.medicine.packs[only];
      if (p) setTicked((t) => setPick(t, { kind: "pack", medicine: r.medicine, pack: p }));
    });
  };
  const chosen = medicine && pack !== null ? medicine.packs[pack] : undefined;
  const add = () => {
    if (!medicine || !chosen) return;
    onPick({ kind: "pack", medicine, pack: chosen });
    onOpenChange(false);
  };
  const finish = () => {
    if (!ticked.length) return;
    onPickMany?.(ticked);
    close();
  };
  const tickedKeys = new Set(ticked.map(pickKey));
  const tickedHere = medicine
    ? ticked.find((t) => t.kind === "pack" && t.medicine.id === medicine.id)
    : undefined;

  const chips = (
    label: string,
    items: [string, number][],
    value: string | null,
    set: (v: string | null) => void,
  ) =>
    items.length > 1 ? (
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-muted-foreground mr-1">{label}</span>
        {[[null, hits.length] as [string | null, number], ...items].map(([v, n]) => (
          <button
            key={v ?? "all"}
            type="button"
            aria-pressed={value === v}
            onClick={() => set(v)}
            className={cn(
              "text-label focus-visible:shadow-focus inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 outline-none",
              value === v
                ? "border-primary bg-muted text-foreground"
                : "border-input hover:bg-muted",
            )}
          >
            {v ?? C.all}
            <span className="text-muted-foreground font-mono tabular-nums">{n}</span>
          </button>
        ))}
      </div>
    ) : null;

  const text = q.trim();
  return (
    <EditorDialog width="wide" open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogTitle className="sr-only">{C.pickerTitle}</DialogTitle>
      <div className="border-border flex items-center gap-3 border-b px-4">
        <SearchIcon aria-hidden className="text-muted-foreground size-5" />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="catalogue-picker-list"
          aria-activedescendant={ordered[active] ? `catalogue-hit-${active}` : undefined}
          aria-label={C.searchLabel}
          placeholder={C.searchLabel}
          className="text-body-m h-14 min-w-0 flex-1 bg-transparent outline-none"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setMedicine(null);
            setPack(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, ordered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (chosen && !multi) add();
              else choose(ordered[active]);
            }
          }}
        />
      </div>
      {(forms.length > 1 || routes.length > 1) && (
        <div className="border-border flex flex-wrap gap-x-5 gap-y-2 border-b px-4 py-2.5">
          {chips(C.formChips, forms, form, setForm)}
          {chips(C.routeChips, routes, route, setRoute)}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[1fr_1fr] md:overflow-hidden">
        <div
          id="catalogue-picker-list"
          role="listbox"
          aria-label={C.pickerTitle}
          aria-multiselectable={multi || undefined}
          aria-busy={pending}
          className="min-h-0 overflow-y-auto p-2 md:max-h-[60vh]"
        >
          {ordered.length === 0 ? (
            <p className="text-body-s text-muted-foreground px-3 py-6">
              {text.length < 2 ? C.tooShort : pending ? C.searching : failed ? C.failed : C.none}
            </p>
          ) : (
            GROUPS.map((g) => {
              const items = ordered.filter((h) => h.group === g);
              if (!items.length) return null;
              return (
                <div key={g} role="group" aria-label={C.groups[g]} className="mb-2">
                  <p className="text-caption text-muted-foreground px-3 pt-2 pb-1">{C.groups[g]}</p>
                  {items.map((h) => {
                    const i = ordered.indexOf(h);
                    const on = medicine?.id === h.medicineId && h.group !== "product";
                    const isTicked =
                      multi &&
                      tickedKeys.has(
                        h.group === "product" ? `product:${h.id}` : `medicine:${h.medicineId}`,
                      );
                    return (
                      <div
                        key={`${h.group}${h.id}`}
                        id={`catalogue-hit-${i}`}
                        role="option"
                        aria-selected={i === active}
                        aria-checked={multi ? isTicked : undefined}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(h)}
                        className={cn(
                          "flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2",
                          i === active || on ? "bg-muted" : "",
                        )}
                      >
                        <span className="text-body-s text-foreground inline-flex items-center gap-1.5 font-medium">
                          {isTicked ? <CheckIcon aria-hidden className="size-4 shrink-0" /> : null}
                          {h.title}
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {[h.detail, h.routes.join(", "), h.why].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <div className="border-border min-h-0 overflow-y-auto border-t p-4 md:max-h-[60vh] md:border-t-0 md:border-l">
          {medicine ? (
            <div className="flex flex-col gap-3">
              <p className="text-heading-s text-foreground">{medicine.displayName}</p>
              <ul className="text-caption text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                {medicine.names.map((n) => (
                  <li key={n.name}>
                    <span className="text-foreground">{n.name}</span> {C.nameType[n.type] ?? n.type}
                  </li>
                ))}
              </ul>
              {medicine.kind === "medicine" && !medicine.prescribable && (
                <p className="text-caption text-muted-foreground">{C.notPrescribable}</p>
              )}
              <p className="text-body-s text-muted-foreground">{C.choose}</p>
              <div
                role={multi ? "group" : "radiogroup"}
                aria-label={C.page.packs}
                className="flex flex-col gap-1.5"
              >
                {medicine.packs.map((p, i) => {
                  // Multi mode: a pack button ticks (or unticks) this medicine with that pack.
                  const checked = multi
                    ? tickedHere?.kind === "pack" && tickedHere.pack.packId === p.packId
                    : pack === i;
                  return (
                    <button
                      key={p.packId ?? "loose"}
                      type="button"
                      role={multi ? undefined : "radio"}
                      aria-checked={multi ? undefined : checked}
                      aria-pressed={multi ? checked : undefined}
                      onClick={() => {
                        setPack(i);
                        if (multi)
                          setTicked((t) => togglePick(t, { kind: "pack", medicine, pack: p }));
                      }}
                      className={cn(
                        "focus-visible:shadow-focus flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left outline-none",
                        checked ? "border-primary bg-muted" : "border-input hover:bg-muted",
                      )}
                    >
                      <span className="text-body-s text-foreground inline-flex items-center gap-1.5 font-medium">
                        {multi && checked ? (
                          <CheckIcon aria-hidden className="size-4 shrink-0" />
                        ) : null}
                        {p.packId ? `${p.brand ?? C.loose} · ${p.description}` : C.loose}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {p.packId
                          ? [
                              p.maker,
                              p.gtin ? `GTIN ${p.gtin}` : C.noBarcode,
                              p.ndaState === "lapsed" ? C.lapsed : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : C.looseDetail(medicine.issueUnit)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {onNotHere && (
                <button
                  type="button"
                  onClick={onNotHere}
                  className="text-body-s text-primary self-start underline-offset-4 hover:underline"
                >
                  {C.packMissing}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {multi && ticked.length ? (
        <ul
          aria-label={M.ticked(ticked.length)}
          className="border-border flex flex-wrap gap-1.5 border-t px-4 py-2.5"
        >
          {ticked.map((t) => {
            const title = pickTitle(t);
            return (
              <li
                key={pickKey(t)}
                className="bg-muted text-caption text-foreground inline-flex h-7 items-center gap-1 rounded-full pr-0.5 pl-2.5"
              >
                {title}
                <button
                  type="button"
                  aria-label={M.untick(title)}
                  onClick={() => setTicked((x) => x.filter((y) => y !== t))}
                  className="hover:bg-ink-200 focus-visible:shadow-focus grid size-6 place-items-center rounded-full outline-none"
                >
                  <XIcon aria-hidden className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <span className="text-caption text-muted-foreground">{multi ? M.keys : C.keys}</span>
        <span className="flex items-center gap-2">
          {multi ? (
            <span role="status" className="text-caption text-muted-foreground tabular-nums">
              {M.ticked(ticked.length)}
            </span>
          ) : null}
          <Button variant="secondary" onClick={close}>
            {C.cancel}
          </Button>
          {multi ? (
            <Button disabled={!ticked.length} onClick={finish}>
              {M.add(ticked.length)}
            </Button>
          ) : (
            <Button disabled={!chosen} onClick={add}>
              {pickLabel}
            </Button>
          )}
        </span>
      </div>
    </EditorDialog>
  );
}
