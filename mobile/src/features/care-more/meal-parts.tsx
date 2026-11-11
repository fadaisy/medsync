import type { FoodGroup } from "@/data/food/types";
import type { Item, MealEntry, MealSlot } from "@/data/meals";
import type { ProductDraft } from "@/data/products";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  ChipRow,
  Icon,
  IconDisc,
  Note,
  Press,
  Sheet,
  Stepper,
  TextField,
  TextLink,
} from "@/components/tide";
import { useHealthLog } from "@/data/health-log";
import {
  amountsFor,
  dayTotals,
  giLine,
  GROUPS,
  itemId,
  itemName,
  mealRepo,
  mealsOn,
  portionLabel,
  portionsOf,
  searchItems,
  slotFor,
  SLOTS,
} from "@/data/meals";
import {
  lookupBarcode,
  productFood,
  savedByBarcode,
  saveProduct,
  useProducts,
} from "@/data/products";
import { BarcodeScan, ProductForm } from "@/features/care-more/product-parts";
import { savedLine } from "@/offline/outbox";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/** Results shown at once; typing narrows the rest. */
const SHOW = 40;
const SAVED = "Saved · you and your care team can see it";

const fmt = (n: number | null, unit: string) => (n === null ? "—" : `${n} ${unit}`);

/** Today's meals: totals, each meal's foods, and Add food (ADR 0356). */
export function MealsSection({ now, onToast }: { now: Date; onToast: (text: string) => void }) {
  const t = useTide();
  const log = useHealthLog();
  const products = useProducts();
  const [adding, setAdding] = useState(false);
  const entries = mealsOn(log.rows, now, products);
  const total = dayTotals(entries);

  const remove = async (e: MealEntry) => {
    const r = await mealRepo.remove(e.id);
    onToast(
      r === "failed"
        ? "Couldn't remove that. Try again when you are online."
        : `Removed · ${itemName(e.item)}`,
    );
  };

  return (
    <View style={{ gap: tSpace[3] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text
          accessibilityRole="header"
          style={[tType.heading, { fontSize: 18, lineHeight: 24, color: t.ink }]}
        >
          Meals
        </Text>
        <Button
          label="Add food"
          variant="accent"
          size="sm"
          icon="plus"
          onPress={() => setAdding(true)}
        />
      </View>

      {log.loading && !entries.length ? (
        <Text style={[tType.bodyM, { color: t.ink2 }]}>Loading…</Text>
      ) : !entries.length ? (
        <Card padding={tSpace[4]} style={{ flexDirection: "row", gap: tSpace[3] }}>
          <IconDisc name="utensils" size={36} color={t.accentText} bg={t.accentTint} />
          <Text style={[tType.bodyM, { flex: 1, color: t.ink2 }]}>
            Nothing logged today. After you eat, tap Add food and pick what was on your plate.
          </Text>
        </Card>
      ) : (
        <Card padding={tSpace[4]} style={{ gap: tSpace[3] }}>
          <View style={{ flexDirection: "row", gap: tSpace[2] }}>
            <Total label="Energy" value={`${total.kcal}`} unit="kcal" />
            <Total label="Carbs" value={`${Math.round(total.carbsG)}`} unit="g" />
            <Total
              label="Glycemic load"
              value={total.glycemicLoad === null ? "—" : `${Math.round(total.glycemicLoad)}`}
            />
          </View>
          {total.glycemicLoad === null ? (
            <Text style={[tType.micro, { color: t.ink3 }]}>
              Glycemic load is not known for today: some foods have no published GI.
            </Text>
          ) : null}
          {SLOTS.map(({ key, label }) => {
            const inSlot = entries.filter((e) => e.slot === key);
            if (!inSlot.length) return null;
            const kcal = inSlot.reduce((n, e) => n + e.amounts.kcal, 0);
            return (
              <View
                key={key}
                style={{
                  gap: tSpace[2],
                  paddingTop: tSpace[3],
                  borderTopWidth: 1,
                  borderTopColor: t.line,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[tType.label, { color: t.ink }]}>{label}</Text>
                  <Text style={[tType.caption, { color: t.ink2 }]}>{`${kcal} kcal`}</Text>
                </View>
                {inSlot.map((e) => (
                  <View
                    key={e.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[tType.bodyM, { color: t.ink }]}>{itemName(e.item)}</Text>
                      <Text style={[tType.caption, { color: t.ink2 }]}>
                        {`${portionLabel(e.item, e.grams)} · ${e.amounts.kcal} kcal · ${Math.round(e.amounts.carbsG)} g carbs`}
                      </Text>
                    </View>
                    <Press
                      onPress={() => void remove(e)}
                      accessibilityLabel={`Remove ${itemName(e.item)}`}
                      hitSlop={10}
                      style={{ padding: tSpace[1] }}
                    >
                      <Icon name="close" size={18} color={t.ink3} />
                    </Press>
                  </View>
                ))}
              </View>
            );
          })}
        </Card>
      )}

      <AddFoodSheet
        visible={adding}
        now={now}
        products={products}
        onClose={() => setAdding(false)}
        onSaved={(text) => {
          setAdding(false);
          onToast(text);
        }}
      />
    </View>
  );
}

function Total({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const t = useTide();
  return (
    <View
      style={{
        flex: 1,
        gap: 2,
        padding: tSpace[2.5],
        borderRadius: tRadius.md,
        backgroundColor: t.surface2,
      }}
    >
      <Text style={[tType.micro, { color: t.ink2 }]}>{label}</Text>
      <Text
        style={[
          tType.title,
          { fontFamily: tType.numeral.fontFamily, fontSize: 20, lineHeight: 24, color: t.ink },
        ]}
      >
        {value}
        {unit ? <Text style={[tType.caption, { color: t.ink2 }]}>{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}

/** Find the food, then say how much and which meal. */
function AddFoodSheet({
  visible,
  now,
  products,
  onClose,
  onSaved,
}: {
  visible: boolean;
  now: Date;
  products: Parameters<typeof searchItems>[2];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const t = useTide();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<FoodGroup | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [portion, setPortion] = useState(0); // index into portionsOf(item); -1 = by weight
  const [count, setCount] = useState("1");
  const [grams, setGrams] = useState("100");
  const [slot, setSlot] = useState<MealSlot>(slotFor(now));
  const [busy, setBusy] = useState(false);
  // A packaged food: the camera, then its label if Open Food Facts does not know it.
  const [mode, setMode] = useState<"search" | "scan" | "form">("search");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [intro, setIntro] = useState("");
  const [looking, setLooking] = useState(false);
  // A product not saved yet: kept with the meal it is first logged with.
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const results = useMemo(() => searchItems(query, group, products), [query, group, products]);

  const reset = () => {
    setQuery("");
    setGroup(null);
    setItem(null);
    setMode("search");
    setDraft(null);
    setBarcode(null);
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
    setSlot(slotFor(now));
  };

  const portions = item ? portionsOf(item) : [];
  const eaten =
    portion >= 0 && portions[portion]
      ? portions[portion].grams * (parseFloat(count) || 0)
      : parseFloat(grams) || 0;
  const amounts = item && eaten > 0 ? amountsFor(item, eaten) : null;

  const takeDraft = (d: ProductDraft) => {
    setDraft(d);
    pick({ kind: "food", food: productFood({ ...d, id: "draft" }) });
  };
  const onCode = async (code: string) => {
    setBarcode(code);
    const saved = savedByBarcode(code);
    if (saved) return pick({ kind: "food", food: productFood(saved) });
    setLooking(true);
    const r = await lookupBarcode(code);
    setLooking(false);
    if (r.kind === "found") return takeDraft(r.draft);
    setIntro(
      r.kind === "missing"
        ? "This barcode is not in Open Food Facts yet. Photograph the nutrition label, or type it in."
        : "Can't look the barcode up without a connection. Type it in from the nutrition label.",
    );
    setMode("form");
  };

  const save = async () => {
    if (!item || eaten <= 0) return;
    setBusy(true);
    let logged = item;
    if (draft) {
      const kept = await saveProduct(draft);
      if (!kept.product) {
        setBusy(false);
        return onSaved(savedLine("failed"));
      }
      logged = { kind: "food", food: productFood(kept.product) };
    }
    const r = await mealRepo.log(logged, eaten, slot);
    setBusy(false);
    const name = itemName(item);
    reset();
    onSaved(savedLine(r, `${SAVED} · ${name}`));
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      overline={item ? "How much" : mode === "search" ? "Add food" : "Packaged food"}
      title={
        item
          ? itemName(item)
          : mode === "scan"
            ? "Scan the barcode"
            : mode === "form"
              ? "From the label"
              : "What did you eat?"
      }
    >
      {!item && mode === "scan" ? (
        <>
          <TextLink label="Back to search" onPress={() => setMode("search")} />
          {looking ? (
            <Text style={[tType.bodyM, { color: t.ink2 }]}>Looking it up…</Text>
          ) : (
            <BarcodeScan onCode={(code) => void onCode(code)} />
          )}
          <Text style={[tType.micro, { color: t.ink3, textAlign: "center" }]}>
            Products are looked up in Open Food Facts, an open database.
          </Text>
        </>
      ) : !item && mode === "form" ? (
        <>
          <TextLink label="Back to search" onPress={() => setMode("search")} />
          <ProductForm barcode={barcode} intro={intro} onDone={takeDraft} />
        </>
      ) : !item ? (
        <>
          <View style={{ flexDirection: "row", gap: tSpace[2], alignItems: "center" }}>
            <Button
              label="Scan a barcode"
              icon="scan"
              variant="soft"
              size="sm"
              onPress={() => setMode("scan")}
            />
            <TextLink
              label="Type a packaged food"
              onPress={() => {
                setBarcode(null);
                setIntro("Type it in from the nutrition label, per 100 g.");
                setMode("form");
              }}
            />
          </View>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="Search: matooke, beans, chai…"
            accessibilityLabel="Search foods"
            inputProps={{ autoCorrect: false, autoCapitalize: "none", returnKeyType: "search" }}
          />
          <ChipRow scroll>
            <Chip size="sm" label="All" selected={group === null} onPress={() => setGroup(null)} />
            {GROUPS.map((g) => (
              <Chip
                key={g.key}
                size="sm"
                label={g.label}
                selected={group === g.key}
                onPress={() => setGroup(group === g.key ? null : g.key)}
              />
            ))}
          </ChipRow>
          {results.length ? (
            <View style={{ gap: tSpace[1] }}>
              {results.slice(0, SHOW).map((i) => {
                const first = portionsOf(i)[0];
                const local = (i.kind === "food" ? i.food.localNames : i.combo.localNames)
                  .map((n) => n.name)
                  .filter((n) => n.toLowerCase() !== itemName(i).toLowerCase())
                  .slice(0, 2)
                  .join(", ");
                return (
                  <Press
                    key={itemId(i)}
                    onPress={() => pick(i)}
                    accessibilityRole="button"
                    accessibilityLabel={itemName(i)}
                    style={{
                      paddingVertical: tSpace[2.5],
                      paddingHorizontal: tSpace[1],
                      borderBottomWidth: 1,
                      borderBottomColor: t.line,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tSpace[2],
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[tType.bodyM, { color: t.ink }]}>{itemName(i)}</Text>
                      {local ? (
                        <Text style={[tType.caption, { color: t.ink3 }]}>{local}</Text>
                      ) : null}
                    </View>
                    {first ? (
                      <Text style={[tType.caption, { color: t.ink2, textAlign: "right" }]}>
                        {`${amountsFor(i, first.grams).kcal} kcal\n${first.label}`}
                      </Text>
                    ) : null}
                  </Press>
                );
              })}
              {results.length > SHOW ? (
                <Text style={[tType.micro, { color: t.ink3, textAlign: "center" }]}>
                  {`${results.length - SHOW} more · type to narrow`}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={[tType.bodyM, { color: t.ink2 }]}>
              Nothing by that name in the list yet. Try another name for it.
            </Text>
          )}
        </>
      ) : (
        <>
          <TextLink
            label="Change food"
            onPress={() => {
              setItem(null);
              setDraft(null);
            }}
          />
          {draft?.source === "open_food_facts" ? (
            <Note tone="info">
              From Open Food Facts, typed in by volunteers from the label. Check it against the
              pack.
            </Note>
          ) : null}
          <ChipRow>
            {portions.map((p, i) => (
              <Chip
                key={p.label}
                size="sm"
                label={`${p.label} (${p.grams} g)`}
                selected={portion === i}
                onPress={() => setPortion(i)}
              />
            ))}
            <Chip
              size="sm"
              label="By weight"
              selected={portion === -1}
              onPress={() => setPortion(-1)}
            />
          </ChipRow>
          <View style={{ flexDirection: "row" }}>
            {portion === -1 ? (
              <Stepper
                label="Weight"
                unit="grams"
                value={grams}
                onChange={setGrams}
                step={10}
                min={5}
                max={2000}
              />
            ) : (
              <Stepper
                label="How many"
                value={count}
                onChange={setCount}
                step={0.5}
                min={0.5}
                max={10}
                decimals={1}
              />
            )}
          </View>
          <ChipRow>
            {SLOTS.map((s) => (
              <Chip
                key={s.key}
                size="sm"
                label={s.label}
                selected={slot === s.key}
                onPress={() => setSlot(s.key)}
              />
            ))}
          </ChipRow>
          {amounts ? (
            <View
              style={{
                gap: tSpace[1],
                padding: tSpace[3],
                borderRadius: tRadius.md,
                backgroundColor: t.surface2,
              }}
            >
              <Text style={[tType.label, { color: t.ink }]}>
                {`${amounts.kcal} kcal · ${Math.round(amounts.carbsG)} g carbs`}
              </Text>
              <Text style={[tType.caption, { color: t.ink2 }]}>
                {`Protein ${fmt(amounts.proteinG, "g")} · fat ${fmt(amounts.fatG, "g")} · fibre ${fmt(amounts.fibreG, "g")}`}
              </Text>
              <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
                {`${giLine(item)} · glycemic load ${amounts.glycemicLoad === null ? "not known" : amounts.glycemicLoad}`}
              </Text>
              {item.kind === "food" && item.food.note ? (
                <Text style={[tType.micro, { color: t.ink3 }]}>{item.food.note}</Text>
              ) : null}
            </View>
          ) : null}
          <Button
            label="Save"
            busy={busy}
            disabled={!amounts || busy}
            onPress={() => void save()}
          />
          <Text style={[tType.micro, { color: t.ink3, textAlign: "center" }]}>
            Portion sizes are a guide. Values come from published food tables.
          </Text>
        </>
      )}
    </Sheet>
  );
}
