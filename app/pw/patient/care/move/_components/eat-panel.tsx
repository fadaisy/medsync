"use client";

import type {
  Food,
  FoodGroup,
  Item,
  LabelValues,
  MealEntry,
  MealSlot,
  Product,
  ProductDraft,
  ProductSource,
} from "@patient-core/care-meals";
import type { LogRow } from "@patient-core/log";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  amountsFor,
  dayTotals,
  draftFromForm,
  fromOpenFoodFacts,
  giLine,
  GROUPS,
  itemId,
  itemName,
  mealsOn,
  OFF_FIELDS,
  OFF_URL,
  portionLabel,
  portionsOf,
  productFood,
  searchItems,
  slotFor,
  SLOTS,
} from "@patient-core/care-meals";
import { tapGlass } from "@patient-core/care-move";
import { GLASSES, waterOn } from "@patient-core/log";
import { CameraIcon, PlusIcon, ScanBarcodeIcon, UtensilsIcon, XIcon } from "lucide-react";

import { PlateGuide } from "@/components/tide/care-plate";
import { Chip, ChipRow, Dialog, NumberField, TextField } from "@/components/tide/controls";
import { Button, Card, ICON, IconDisc, Note, Overline, SectionHead } from "@/components/tide/kit";
import { CARE_COPY } from "@/content/patient/care";
import {
  logMealAction,
  logWaterAction,
  removeMealAction,
  saveProductAction,
  searchUsdaAction,
} from "@/lib/patient-web/care-actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const M = CARE_COPY.meals;
const P = CARE_COPY.move.plate;
const W = CARE_COPY.move.water;
/** Results shown at once; typing narrows the rest. */
const SHOW = 40;
const fmt = (v: number | null, unit: string) => (v === null ? "—" : `${v} ${unit}`);

/** Eat (the phone's activity-parts.tsx `EatPanel`): the plate guide, today's meals and water. */
export function EatPanel({
  now,
  rows,
  products,
  usda,
  onToast,
}: {
  now: Date;
  rows: LogRow[];
  products: Product[];
  usda: Food[];
  onToast: (text: string) => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const water = waterOn(rows, now);
  const tap = (i: number) =>
    start(async () => {
      const r = await logWaterAction(tapGlass(water, i));
      if (!r.ok) onToast(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex items-center gap-4">
        <PlateGuide label={P.label} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-[17px] font-semibold">{P.title}</h2>
          {(
            [
              ["bg-pw-accent-tint", P.half],
              ["bg-pw-info-tint", P.starch],
              ["bg-pw-place-tint", P.protein],
            ] as const
          ).map(([swatch, text]) => (
            <p key={text} className="text-pw-ink-2 flex items-center gap-2 text-[15px] font-medium">
              <span
                aria-hidden
                className={cn("ring-pw-line size-2.5 shrink-0 rounded-sm ring-1", swatch)}
              />
              {text}
            </p>
          ))}
        </div>
      </Card>

      <MealsSection now={now} rows={rows} products={products} usda={usda} onToast={onToast} />

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{W.title}</h2>
          <span className="text-pw-ink-2 text-[13px] font-semibold">{W.count(water, GLASSES)}</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: GLASSES }, (_, i) => {
            const full = i < water;
            return (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => tap(i)}
                aria-label={W.glass(i + 1, full)}
                aria-pressed={full}
                className={cn(
                  "focus-visible:outline-pw-focus h-12 flex-1 rounded-t-[10px] rounded-b-[14px] ring-[1.5px] ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
                  "transition-colors duration-150 ease-out motion-reduce:transition-none",
                  full ? "bg-pw-cascade-2 ring-pw-cascade-3" : "bg-pw-surface ring-pw-line-strong",
                )}
              />
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/** Today's meals: totals, each meal's foods, and Add food (ADR 0356). */
function MealsSection({
  now,
  rows,
  products,
  usda,
  onToast,
}: {
  now: Date;
  rows: LogRow[];
  products: Product[];
  usda: Food[];
  onToast: (text: string) => void;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, start] = useTransition();
  const entries = mealsOn(rows, now, products, usda);
  const total = dayTotals(entries);
  const remove = (e: MealEntry) =>
    start(async () => {
      const r = await removeMealAction(e.id);
      onToast(r.ok ? M.removed(itemName(e.item)) : r.error);
      router.refresh();
    });

  return (
    <section aria-labelledby="meals" className="flex flex-col gap-3">
      <SectionHead
        id="meals"
        title={M.title}
        action={
          <Button tone="accent" size="s" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" {...ICON} />
            {M.addFood}
          </Button>
        }
      />
      {!entries.length ? (
        <Card className="flex items-start gap-3">
          <IconDisc tone="accent">
            <UtensilsIcon className="size-5" {...ICON} />
          </IconDisc>
          <p className="text-pw-ink-2 min-w-0 flex-1 text-[17px]">{M.empty}</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <Total label={M.energy} value={`${total.kcal}`} unit="kcal" />
            <Total label={M.carbs} value={`${Math.round(total.carbsG)}`} unit="g" />
            <Total
              label={M.load}
              value={total.glycemicLoad === null ? "—" : `${Math.round(total.glycemicLoad)}`}
            />
          </div>
          {total.glycemicLoad === null ? (
            <p className="text-pw-ink-3 text-[13px]">{M.loadUnknown}</p>
          ) : null}
          {SLOTS.map(({ key, label }) => {
            const inSlot = entries.filter((e) => e.slot === key);
            if (!inSlot.length) return null;
            const kcal = inSlot.reduce((t, e) => t + e.amounts.kcal, 0);
            return (
              <div key={key} className="border-pw-line flex flex-col gap-2 border-t pt-3">
                <div className="flex justify-between gap-3">
                  <h3 className="text-[15px] font-semibold">{label}</h3>
                  <span className="text-pw-ink-2 text-[13px]">{M.slotKcal(kcal)}</span>
                </div>
                <ul className="flex flex-col gap-1">
                  {inSlot.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px]">{itemName(e.item)}</span>
                        <span className="text-pw-ink-2 block text-[13px]">
                          {M.entryLine(
                            portionLabel(e.item, e.grams),
                            e.amounts.kcal,
                            Math.round(e.amounts.carbsG),
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => remove(e)}
                        aria-label={M.remove(itemName(e.item))}
                        className="text-pw-ink-3 hover:bg-pw-surface-3 focus-visible:outline-pw-focus grid size-12 shrink-0 place-items-center rounded-full focus-visible:outline-2"
                      >
                        <XIcon className="size-[18px]" {...ICON} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>
      )}
      <AddFoodDialog
        open={adding}
        now={now}
        products={products}
        onClose={() => setAdding(false)}
        onSaved={(text) => {
          setAdding(false);
          onToast(text);
          router.refresh();
        }}
      />
    </section>
  );
}

function Total({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-pw-row bg-pw-surface-2 flex flex-col gap-0.5 p-2.5">
      <span className="text-pw-ink-2 text-xs font-semibold">{label}</span>
      <span className="text-xl leading-6 font-semibold tabular-nums">
        {value}
        {unit ? <span className="text-pw-ink-2 text-[13px] font-medium">{` ${unit}`}</span> : null}
      </span>
    </div>
  );
}

type Lookup = { kind: "found"; draft: ProductDraft } | { kind: "missing" } | { kind: "offline" };

/**
 * Open Food Facts, called from the patient's browser exactly as the phone calls it from the device (no
 * MedSync server in between). A browser cannot set the User-Agent the phone sends; nothing else differs.
 */
async function lookupBarcode(code: string): Promise<Lookup> {
  try {
    const res = await fetch(`${OFF_URL}/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return { kind: "offline" };
    const draft = fromOpenFoodFacts(code, await res.json());
    return draft ? { kind: "found", draft } : { kind: "missing" };
  } catch {
    return { kind: "offline" };
  }
}

/** Find the food, then say how much and which meal (the phone's AddFoodSheet, as a centred dialog, W1). */
function AddFoodDialog({
  open,
  now,
  products,
  onClose,
  onSaved,
}: {
  open: boolean;
  now: Date;
  products: Product[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<FoodGroup | null>(null);
  const [usda, setUsda] = useState<Food[]>([]);
  const [searching, startSearch] = useTransition();
  const [item, setItem] = useState<Item | null>(null);
  const [portion, setPortion] = useState(0); // index into portionsOf(item); -1 = by weight
  const [count, setCount] = useState("1");
  const [grams, setGrams] = useState("100");
  const [slot, setSlot] = useState<MealSlot>(slotFor(now));
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<"search" | "scan" | "form">("search");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [intro, setIntro] = useState("");
  const [looking, setLooking] = useState(false);
  const [draft, setDraft] = useState<ProductDraft | null>(null);

  // USDA's list lives on the server; ask it once typing pauses.
  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(
      () => startSearch(async () => setUsda(await searchUsdaAction(query, group))),
      250,
    );
    return () => clearTimeout(t);
  }, [query, group]);
  const results = useMemo(
    () => searchItems(query, group, products, query.trim() ? usda : []),
    [query, group, products, usda],
  );

  const reset = () => {
    setQuery("");
    setGroup(null);
    setItem(null);
    setMode("search");
    setDraft(null);
    setBarcode(null);
    setCode("");
  };
  const close = () => {
    reset();
    onClose();
  };
  const pick = (i: Item) => {
    setItem(i);
    setPortion(0);
    setCount("1");
    setGrams(String(portionsOf(i)[0]?.grams ?? 100));
    setSlot(slotFor(new Date()));
  };

  const portions = item ? portionsOf(item) : [];
  const chosen = portion >= 0 ? portions[portion] : undefined;
  const eaten = chosen ? chosen.grams * (parseFloat(count) || 0) : parseFloat(grams) || 0;
  const amounts = item && eaten > 0 ? amountsFor(item, eaten) : null;

  const takeDraft = (d: ProductDraft) => {
    setDraft(d);
    pick({ kind: "food", food: productFood({ ...d, id: "draft" }) });
  };
  const onCode = async (c: string) => {
    setBarcode(c);
    const saved = products.find((p) => p.barcode === c);
    if (saved) return pick({ kind: "food", food: productFood(saved) });
    setLooking(true);
    const r = await lookupBarcode(c);
    setLooking(false);
    if (r.kind === "found") return takeDraft(r.draft);
    setIntro(r.kind === "missing" ? M.offMissing : M.offOffline);
    setMode("form");
  };

  const save = () =>
    start(async () => {
      if (!item || !amounts) return;
      let id = itemId(item);
      if (draft) {
        const kept = await saveProductAction(draft);
        if (!kept.ok) return onSaved(kept.error);
        id = `product:${kept.id}`;
      }
      const r = await logMealAction({ itemId: id, grams: eaten, kcal: amounts.kcal, slot });
      const name = itemName(item);
      reset();
      onSaved(r.ok ? M.saved(name) : r.error);
    });

  const title = item
    ? itemName(item)
    : mode === "scan"
      ? M.titles.scan
      : mode === "form"
        ? M.titles.form
        : M.titles.pick;
  const overline = item
    ? M.overline.howMuch
    : mode === "search"
      ? M.overline.pick
      : M.overline.packaged;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : close())} title={title} width="wide">
      <div className="flex flex-col gap-4">
        <Overline>{overline}</Overline>
        {!item && mode === "scan" ? (
          <>
            <BackLink onClick={() => setMode("search")} />
            <div className="flex flex-wrap items-end gap-2">
              <TextField
                label={M.barcodeLabel}
                hint={M.barcodeHint}
                inputMode="numeric"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 14))}
                className="min-w-[220px] flex-1"
              />
              <Button
                busy={looking}
                disabledReason={/^\d{6,14}$/.test(code) ? undefined : M.barcodeFirst}
                onClick={() => void onCode(code)}
              >
                {M.lookUp}
              </Button>
            </div>
            {looking ? (
              <p role="status" className="text-pw-ink-2 text-[15px]">
                {M.looking}
              </p>
            ) : null}
            <p className="text-pw-ink-3 text-center text-[13px]">{M.offNote}</p>
          </>
        ) : !item && mode === "form" ? (
          <>
            <BackLink onClick={() => setMode("search")} />
            <ProductForm barcode={barcode} intro={intro} onDone={takeDraft} />
          </>
        ) : !item ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button tone="soft" size="s" onClick={() => setMode("scan")}>
                <ScanBarcodeIcon className="size-4" {...ICON} />
                {M.typeBarcode}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setBarcode(null);
                  setIntro(M.typeIntro);
                  setMode("form");
                }}
                className="text-pw-accent-text focus-visible:outline-pw-focus min-h-12 px-2 font-semibold hover:underline focus-visible:outline-2"
              >
                {M.typePackaged}
              </button>
            </div>
            <TextField
              label={M.searchLabel}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={M.searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
            />
            <ChipRow label={M.groupsLabel}>
              <Chip selected={group === null} onClick={() => setGroup(null)}>
                {M.all}
              </Chip>
              {GROUPS.map((g) => (
                <Chip
                  key={g.key}
                  selected={group === g.key}
                  onClick={() => setGroup(group === g.key ? null : g.key)}
                >
                  {g.label}
                </Chip>
              ))}
            </ChipRow>
            {searching ? (
              <p role="status" className="text-pw-ink-3 text-[13px]">
                {M.searching}
              </p>
            ) : null}
            {results.length ? (
              <div className="flex flex-col">
                <ul>
                  {results.slice(0, SHOW).map((i) => {
                    const first = portionsOf(i)[0];
                    const local = (i.kind === "food" ? i.food.localNames : i.combo.localNames)
                      .map((x) => x.name)
                      .filter((x) => x.toLowerCase() !== itemName(i).toLowerCase())
                      .slice(0, 2)
                      .join(", ");
                    return (
                      <li key={itemId(i)}>
                        <button
                          type="button"
                          onClick={() => pick(i)}
                          className="border-pw-line hover:bg-pw-surface-2 focus-visible:outline-pw-focus flex min-h-12 w-full items-center gap-2 border-b px-1 py-2.5 text-left focus-visible:outline-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[17px]">{itemName(i)}</span>
                            {local ? (
                              <span className="text-pw-ink-3 block text-[13px]">{local}</span>
                            ) : null}
                          </span>
                          {first ? (
                            <span className="text-pw-ink-2 text-right text-[13px]">
                              {`${amountsFor(i, first.grams).kcal} kcal`}
                              <br />
                              {first.label}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {results.length > SHOW ? (
                  <p className="text-pw-ink-3 pt-2 text-center text-[13px]">
                    {M.more(results.length - SHOW)}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-pw-ink-2 text-[17px]">{M.nothing}</p>
            )}
          </>
        ) : (
          <>
            <BackLink
              label={M.changeFood}
              onClick={() => {
                setItem(null);
                setDraft(null);
              }}
            />
            {draft?.source === "open_food_facts" ? <Note tone="info">{M.fromOff}</Note> : null}
            <ChipRow label={M.portionsLabel}>
              {portions.map((p, i) => (
                <Chip key={p.label} selected={portion === i} onClick={() => setPortion(i)}>
                  {M.portion(p.label, p.grams)}
                </Chip>
              ))}
              <Chip selected={portion === -1} onClick={() => setPortion(-1)}>
                {M.byWeight}
              </Chip>
            </ChipRow>
            {portion === -1 ? (
              <NumberField
                label={M.weight}
                unit={M.grams}
                value={grams}
                onChange={setGrams}
                step={10}
                min={5}
                max={2000}
              />
            ) : (
              <NumberField
                label={M.howMany}
                unit={M.times}
                value={count}
                onChange={setCount}
                step={0.5}
                min={0.5}
                max={10}
                decimals={1}
              />
            )}
            <ChipRow label={M.mealLabel}>
              {SLOTS.map((s) => (
                <Chip key={s.key} selected={slot === s.key} onClick={() => setSlot(s.key)}>
                  {s.label}
                </Chip>
              ))}
            </ChipRow>
            {amounts ? (
              <div className="rounded-pw-row bg-pw-surface-2 flex flex-col gap-1 p-3">
                <p className="text-[17px] font-semibold">
                  {M.totalLine(amounts.kcal, Math.round(amounts.carbsG))}
                </p>
                <p className="text-pw-ink-2 text-[13px]">
                  {M.nutrients(
                    fmt(amounts.proteinG, "g"),
                    fmt(amounts.fatG, "g"),
                    fmt(amounts.fibreG, "g"),
                  )}
                </p>
                <p className="text-pw-ink-2 text-[13px] font-medium">
                  {M.giLoad(giLine(item), amounts.glycemicLoad)}
                </p>
                {item.kind === "food" && item.food.note ? (
                  <p className="text-pw-ink-3 text-xs">{item.food.note}</p>
                ) : null}
              </div>
            ) : null}
            <Button busy={busy} disabledReason={amounts ? undefined : M.pickAmount} onClick={save}>
              {M.save}
            </Button>
            <p className="text-pw-ink-3 text-center text-[13px]">{M.portionNote}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

function BackLink({ onClick, label = M.backToSearch }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-pw-accent-text focus-visible:outline-pw-focus min-h-12 self-start font-semibold hover:underline focus-visible:outline-2"
    >
      {label}
    </button>
  );
}

const FIELDS: { key: keyof LabelValues; optional?: boolean }[] = [
  { key: "kcal" },
  { key: "carbs" },
  { key: "protein", optional: true },
  { key: "fat", optional: true },
  { key: "fibre", optional: true },
  { key: "servingG", optional: true },
];

/**
 * A packaged food from its label: photographed and read on the server (`/api/mobile/food-label`, the phone's
 * route, never stored) for the patient to check, or typed. Values are per 100 g, as labels print them.
 */
function ProductForm({
  barcode,
  intro,
  onDone,
}: {
  barcode: string | null;
  intro: string;
  onDone: (draft: ProductDraft) => void;
}) {
  const F = M.form;
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState<LabelValues>({});
  const [source, setSource] = useState<ProductSource>("typed");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setNote(null);
    const r = await readLabelPhoto(file);
    setReading(false);
    if (r.ok) {
      setV((old) => ({
        ...old,
        ...Object.fromEntries(Object.entries(r.values).filter(([, x]) => x)),
      }));
      setSource("label_photo");
      setNote(F.check);
    } else setNote(r.message);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-pw-ink-2 text-[17px]">{intro}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void read(e.target.files?.[0])}
      />
      <Button
        tone="soft"
        busy={reading}
        onClick={() => fileRef.current?.click()}
        className="self-start"
      >
        <CameraIcon className="size-5" {...ICON} />
        {F.readPhoto}
      </Button>
      {note ? <Note tone="info">{note}</Note> : null}
      <TextField
        label={F.name}
        value={v.name ?? ""}
        onChange={(e) => setV((o) => ({ ...o, name: e.target.value }))}
        placeholder={F.namePlaceholder}
        maxLength={200}
      />
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        {FIELDS.map((f) => (
          <TextField
            key={f.key}
            label={`${F.fields[f.key as keyof typeof F.fields]}${f.optional ? F.optional : ""}`}
            inputMode="decimal"
            value={v[f.key] ?? ""}
            onChange={(e) => setV((o) => ({ ...o, [f.key]: e.target.value }))}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-pw-ink text-[15px] font-semibold">
          {error}
        </p>
      ) : null}
      <Button
        onClick={() => {
          const r = draftFromForm(v, barcode, source);
          if (!r.ok) return setError(r.error);
          setError(null);
          onDone(r.draft);
        }}
      >
        {F.continue}
      </Button>
    </div>
  );
}

/** The photo shrunk to 1024 px, sent with the patient's own token, as the phone sends it. */
async function readLabelPhoto(
  file: File,
): Promise<{ ok: true; values: LabelValues } | { ok: false; message: string }> {
  const F = M.form;
  let image: string;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    image = canvas.toDataURL("image/jpeg", 0.7).split(",")[1] ?? "";
  } catch {
    return { ok: false, message: F.noRead };
  }
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, message: F.signInAgain };
  try {
    const res = await fetch("/api/mobile/food-label", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mime: "image/jpeg", image }),
    });
    const body = (await res.json().catch(() => null)) as
      | ({ ok?: boolean; error?: string } & LabelValues)
      | null;
    if (!res.ok || !body) return { ok: false, message: body?.error ?? F.noRead };
    if (!body.ok) return { ok: false, message: F.noRead };
    const { name, kcal, carbs, protein, fat, fibre, servingG } = body;
    return { ok: true, values: { name, kcal, carbs, protein, fat, fibre, servingG } };
  } catch {
    return { ok: false, message: F.offline };
  }
}
