"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import {
  commitImportAction,
  createImportDraftAction,
  decideImportRowsAction,
} from "../../catalogue-actions";
import { useSave } from "./catalogue-products";

const I = CATALOGUE.imports;
type Kind = "products" | "opening_stock" | "price_list";
type Place = { id: string; name: string };
const select = "border-input bg-background text-body-s h-9 rounded-md border px-2";

/** 4.7: a CSV file becomes a draft (S34). Nothing outside the draft is written until commit. */
export function ImportUpload({ stores, suppliers }: { stores: Place[]; suppliers: Place[] }) {
  const w = useSave();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("products");
  const [store, setStore] = useState(stores[0]?.id ?? "");
  const [supplier, setSupplier] = useState(suppliers[0]?.id ?? "");
  const [edition, setEdition] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const ready =
    !!file &&
    (kind !== "opening_stock" || !!store) &&
    (kind !== "price_list" || (!!supplier && !!edition));
  const make = () =>
    w.run(async () => {
      const r = await createImportDraftAction({
        kind,
        fileName: file!.name,
        text: await file!.text(),
        locationId: kind === "opening_stock" ? store : null,
        supplierId: kind === "price_list" ? supplier : null,
        editionDate: kind === "price_list" ? edition : null,
      });
      if (r.ok) router.push(`/pharmacy/setup?view=import&draft=${r.id}`);
      return r;
    }, I.made);
  return (
    <section
      aria-label={I.make}
      className="bg-card shadow-tide-card rounded-tide-card flex flex-col gap-3 px-4 py-4"
    >
      <p className="text-caption text-muted-foreground">{I.csvOnly}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="im-kind">{I.kind}</Label>
          <select
            id="im-kind"
            className={select}
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            {(Object.keys(I.kinds) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {I.kinds[k]}
              </option>
            ))}
          </select>
        </div>
        {kind === "opening_stock" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="im-store">{I.store}</Label>
            {stores.length ? (
              <select
                id="im-store"
                className={select}
                value={store}
                onChange={(e) => setStore(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-body-s text-muted-foreground">{I.noStore}</p>
            )}
          </div>
        )}
        {kind === "price_list" && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="im-sup">{I.supplier}</Label>
              {suppliers.length ? (
                <select
                  id="im-sup"
                  className={select}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-body-s text-muted-foreground">{I.noSupplier}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="im-ed">{I.edition}</Label>
              <Input
                id="im-ed"
                type="date"
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="im-file">{I.file}</Label>
          <Input
            id="im-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <p className="text-caption text-muted-foreground">{I.columns[kind]}</p>
      <span className="flex flex-wrap items-center gap-2">
        <Button disabled={!ready || w.pending} onClick={make}>
          {I.make}
        </Button>
        {w.status}
      </span>
    </section>
  );
}

export interface DraftRow {
  id: string;
  lineNo: number;
  raw: Record<string, string>;
  match: "matched" | "check" | "not_in_catalogue" | "invalid";
  why: string;
  options: string[];
  decision: "accept" | "skip" | "add_supply" | null;
  committed: boolean;
}

const GROUPS = ["matched", "check", "not_in_catalogue", "invalid"] as const;

/** One decision per row by a person; commit writes only the accepted rows (S34). */
export function DraftRows(props: {
  draft: { id: string; kind: Kind; committed: boolean };
  rows: DraftRow[];
  edit: boolean;
}) {
  const { draft, rows } = props;
  const edit = props.edit && !draft.committed;
  const w = useSave();
  const decide = (
    decisions: { rowId: string; decision: string; option?: number; noRegistration?: boolean }[],
  ) => w.run(() => decideImportRowsAction({ draftId: draft.id, decisions }), I.saved);
  const open = rows.filter((r) => r.match === "matched" && !r.decision);
  const accepted = rows.filter(
    (r) => !r.committed && (r.decision === "accept" || r.decision === "add_supply"),
  ).length;
  return (
    <section
      aria-label={I.kinds[draft.kind]}
      className="bg-card shadow-tide-card rounded-tide-card overflow-hidden"
    >
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="text-heading-s text-foreground">{I.kinds[draft.kind]}</h3>
        {edit && (
          <span className="flex flex-wrap items-center gap-2">
            {open.length > 0 && (
              <Button
                variant="secondary"
                disabled={w.pending}
                onClick={() =>
                  decide(open.slice(0, 5000).map((r) => ({ rowId: r.id, decision: "accept" })))
                }
              >
                {I.acceptAll(open.length)}
              </Button>
            )}
            <Button
              disabled={!accepted || w.pending}
              title={accepted ? undefined : I.commitNone}
              onClick={() => w.run(() => commitImportAction({ draftId: draft.id }), I.done)}
            >
              {I.commit(accepted)}
            </Button>
            {w.status}
          </span>
        )}
      </div>
      {draft.kind === "opening_stock" && (
        <p className="text-body-s text-muted-foreground border-border border-b px-4 py-2">
          {I.openingNote}
        </p>
      )}
      {GROUPS.map((g) => {
        const list = rows.filter((r) => r.match === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <h4 className="text-heading-s text-foreground bg-muted px-4 py-2">
              {I.groups[g]} · {list.length}
            </h4>
            <ul className="divide-border divide-y">
              {list.slice(0, 500).map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  kind={draft.kind}
                  edit={edit}
                  decide={decide}
                  pending={w.pending}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function Row(props: {
  r: DraftRow;
  kind: Kind;
  edit: boolean;
  pending: boolean;
  decide: (
    d: { rowId: string; decision: string; option?: number; noRegistration?: boolean }[],
  ) => void;
}) {
  const { r, kind, edit, decide, pending } = props;
  const [noReg, setNoReg] = useState(false);
  const summary = Object.values(r.raw).filter(Boolean).slice(0, 6).join(" · ");
  const canAccept =
    r.match === "matched" || (r.match === "not_in_catalogue" && kind === "price_list");
  const supply = kind === "products" && r.match === "not_in_catalogue";
  return (
    <li className="flex flex-col gap-1.5 px-4 py-2">
      <span className="text-body-s text-foreground">
        <span className="text-muted-foreground tabular-nums">{I.line(r.lineNo)}</span> · {summary}
      </span>
      <span className="text-caption text-muted-foreground">
        {r.why}
        {r.decision && ` · ${I.decided[r.decision]}`}
      </span>
      {edit && !r.committed && r.match !== "invalid" && (
        <span className="flex flex-wrap items-center gap-2">
          {r.options.map((o, i) => (
            <Button
              key={o + i}
              variant="ghost"
              disabled={pending}
              onClick={() => decide([{ rowId: r.id, decision: "accept", option: i }])}
            >
              {I.choose}: {o}
            </Button>
          ))}
          {canAccept && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => decide([{ rowId: r.id, decision: "accept" }])}
            >
              {I.accept}
            </Button>
          )}
          {supply && (
            <>
              {!r.raw.nda && (
                <label className="text-body-s flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={noReg}
                    onChange={(e) => setNoReg(e.target.checked)}
                  />
                  {I.noRegistration}
                </label>
              )}
              <Button
                variant="ghost"
                disabled={pending || (!r.raw.nda && !noReg)}
                onClick={() =>
                  decide([{ rowId: r.id, decision: "add_supply", noRegistration: noReg }])
                }
              >
                {I.addSupply}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => decide([{ rowId: r.id, decision: "skip" }])}
          >
            {I.skip}
          </Button>
        </span>
      )}
    </li>
  );
}
