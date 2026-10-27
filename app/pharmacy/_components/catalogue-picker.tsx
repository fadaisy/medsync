"use client";

import type { CatalogueMedicine, MedicinePack } from "@/lib/pharmacy/shared-catalogue/medicine";
import type { CatalogueHit, HitGroup } from "@/lib/pharmacy/shared-catalogue/search";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SearchIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { CATALOGUE as C } from "@/content/pharmacy-catalogue";
import { cn } from "@/lib/utils";
import { catalogueMedicineAction, catalogueSearchAction } from "../catalogue-actions";

export type CataloguePick =
  | { kind: "pack"; medicine: CatalogueMedicine; pack: MedicinePack }
  | { kind: "product"; productId: string; title: string };

const GROUPS: readonly HitGroup[] = ["medicine", "brand", "product"];

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
 */
export function CataloguePicker({
  open,
  onOpenChange,
  onPick,
  onNotHere,
  prescribing,
  pickLabel = C.pick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (p: CataloguePick) => void;
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
      onPick({ kind: "product", productId: h.id, title: h.title });
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
    });
  };
  const chosen = medicine && pack !== null ? medicine.packs[pack] : undefined;
  const add = () => {
    if (!medicine || !chosen) return;
    onPick({ kind: "pack", medicine, pack: chosen });
    onOpenChange(false);
  };

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
    <EditorDialog width="wide" open={open} onOpenChange={onOpenChange}>
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
              if (chosen) add();
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
                    return (
                      <div
                        key={`${h.group}${h.id}`}
                        id={`catalogue-hit-${i}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(h)}
                        className={cn(
                          "flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2",
                          i === active || on ? "bg-muted" : "",
                        )}
                      >
                        <span className="text-body-s text-foreground font-medium">{h.title}</span>
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
              <div role="radiogroup" aria-label={C.page.packs} className="flex flex-col gap-1.5">
                {medicine.packs.map((p, i) => (
                  <button
                    key={p.packId ?? "loose"}
                    type="button"
                    role="radio"
                    aria-checked={pack === i}
                    onClick={() => setPack(i)}
                    className={cn(
                      "focus-visible:shadow-focus flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left outline-none",
                      pack === i ? "border-primary bg-muted" : "border-input hover:bg-muted",
                    )}
                  >
                    <span className="text-body-s text-foreground font-medium">
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
                ))}
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
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <span className="text-caption text-muted-foreground">{C.keys}</span>
        <span className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {C.cancel}
          </Button>
          <Button disabled={!chosen} onClick={add}>
            {pickLabel}
          </Button>
        </span>
      </div>
    </EditorDialog>
  );
}
