"use client";

import type { ProductLinkRow } from "@/lib/pharmacy/shared-catalogue/products";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { CataloguePicker } from "../../_components/catalogue-picker";
import { addHealthSupplyAction, linkProductsAction } from "../../catalogue-actions";

const P = CATALOGUE.products;
const S = CATALOGUE.supply;
type Link = { productId: string; catalogueMedicineId: string; cataloguePackId?: string | null };

export function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: string,
    then?: () => void,
  ) =>
    start(async () => {
      const r = await fn();
      setSaid(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
      if (r.ok) {
        then?.();
        router.refresh();
      }
    });
  const status = (
    <span role="status" aria-live="polite" className="text-body-s">
      {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
    </span>
  );
  return { run, pending, status };
}

/** Set-up › Catalogue › Your products (S17): link each product; one-match rows confirm together. */
export function CatalogueProducts({ rows }: { rows: ProductLinkRow[] }) {
  const w = useSave();
  const singles = rows.filter((r) => r.match === "single");
  return (
    <section
      aria-label={P.title}
      className="bg-card shadow-tide-card rounded-tide-card overflow-hidden"
    >
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-heading-s text-foreground">{P.title}</h3>
          <p className="text-body-s text-muted-foreground max-w-[70ch]">{P.lead}</p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {singles.length > 0 && (
            <Button
              variant="secondary"
              disabled={w.pending}
              onClick={() =>
                w.run(
                  () =>
                    linkProductsAction({
                      links: singles.slice(0, 200).map((r) => ({
                        productId: r.productId,
                        catalogueMedicineId: r.candidates[0]!.medicineId,
                      })),
                    }),
                  P.singleDone,
                )
              }
            >
              {P.single(singles.length)}
            </Button>
          )}
          <HealthSupplyDialog />
          {w.status}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-body-s text-muted-foreground px-4 py-3">{P.none}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((r) => (
            <ProductRow key={r.productId} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProductRow({ r }: { r: ProductLinkRow }) {
  const w = useSave();
  const [pick, setPick] = useState(r.candidates.length === 1 ? r.candidates[0]!.medicineId : "");
  const [picker, setPicker] = useState(false);
  const link = (l: Link) => w.run(() => linkProductsAction({ links: [l] }), P.singleDone);
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="text-body-s text-foreground">
        {[r.name, r.strength, r.itemKind === "health_supply" ? P.supply : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {r.candidates.length > 0 ? (
        <div role="radiogroup" aria-label={P.choose} className="flex flex-col gap-1.5">
          {r.candidates.map((c) => (
            <label key={c.medicineId} className="text-body-s flex items-start gap-2">
              <input
                type="radio"
                name={`link-${r.productId}`}
                checked={pick === c.medicineId}
                onChange={() => setPick(c.medicineId)}
                className="mt-1"
              />
              <span>
                {c.displayName} <span className="text-muted-foreground">· {P.via[c.via]}</span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">{P.noMatch}</p>
      )}
      <span className="flex flex-wrap items-center gap-2">
        {r.candidates.length > 0 && (
          <Button
            variant="secondary"
            disabled={!pick || w.pending}
            onClick={() => link({ productId: r.productId, catalogueMedicineId: pick })}
          >
            {P.link}
          </Button>
        )}
        <Button variant="ghost" onClick={() => setPicker(true)}>
          {P.pick}
        </Button>
        {w.status}
      </span>
      <CataloguePicker
        open={picker}
        onOpenChange={setPicker}
        pickLabel={P.link}
        onPick={(p) => {
          if (p.kind === "pack")
            link({
              productId: r.productId,
              catalogueMedicineId: p.medicine.id,
              cataloguePackId: p.pack.packId,
            });
        }}
      />
    </li>
  );
}

/** 4.4: a health supply typed from the pack. Medicines are refused for now (D-CAT-18), said in words. */
function HealthSupplyDialog() {
  const w = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: "",
    strength: "",
    issueUnit: "",
    pack: "",
    contents: "",
    brand: "",
    maker: "",
    registration: "",
    noRegistration: false,
    gtin: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const field = (k: Exclude<keyof typeof f, "noRegistration">, label: string, props = {}) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`hs-${k}`}>{label}</Label>
      <Input id={`hs-${k}`} value={f[k]} onChange={set(k)} {...props} />
    </div>
  );
  const ready =
    f.name.trim().length >= 2 &&
    f.issueUnit.trim() &&
    f.pack.trim() &&
    (f.noRegistration || f.registration.trim().length >= 2);
  const save = () =>
    w.run(
      () =>
        addHealthSupplyAction({
          clientKey: crypto.randomUUID(),
          catalogueMedicineId: null,
          kind: "health_supply",
          name: f.name,
          strength: f.strength || undefined,
          issueUnit: f.issueUnit,
          pack: { description: f.pack, contents: f.contents ? Number(f.contents) : null },
          brand: f.brand || undefined,
          maker: f.maker || undefined,
          registration: f.noRegistration
            ? { answer: "none_on_pack" }
            : { answer: "number", number: f.registration },
          gtin: f.gtin.trim() || null,
        }),
      S.done,
      () => setOpen(false),
    );
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {S.open}
      </Button>
      <EditorDialog width="medium" open={open} onOpenChange={setOpen}>
        <div className="flex flex-col gap-4 p-5">
          <DialogTitle className="text-heading-s">{S.title}</DialogTitle>
          <p className="text-body-s text-muted-foreground">{S.lead}</p>
          <p className="text-caption text-muted-foreground">{S.medicines}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("name", S.name)}
            {field("strength", S.strength)}
            {field("issueUnit", S.issueUnit)}
            {field("pack", S.pack)}
            {field("contents", S.contents, { inputMode: "numeric", pattern: "[0-9]*" })}
            {field("gtin", S.gtin, { inputMode: "numeric", className: "font-mono tabular-nums" })}
            {field("brand", S.brand)}
            {field("maker", S.maker)}
            {!f.noRegistration && field("registration", S.registration)}
            <label className="text-body-s flex items-center gap-2 self-end">
              <input type="checkbox" checked={f.noRegistration} onChange={set("noRegistration")} />
              {S.noRegistration}
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {w.status}
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {S.cancel}
            </Button>
            <Button disabled={!ready || w.pending} onClick={save}>
              {S.save}
            </Button>
          </div>
        </div>
      </EditorDialog>
    </>
  );
}
