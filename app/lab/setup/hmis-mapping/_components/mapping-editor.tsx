"use client";

import type { MappingPayload } from "@/lib/lab/hmis-store";
import type { HmisForm } from "@/lib/lab/hmis105";
import { useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { LabButton } from "@/components/tide/work/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { saveHmisMappingAction, signHmisMappingAction } from "@/lib/lab/hmis-actions";
import { Pop, selectClass } from "../../../_components/pop";
import { Said, useAct } from "../../criticals/_components/setup-forms";
import { SignButton } from "../../drafts/_components/sign-button";

type Row = MappingPayload["rows"][number];
type Source = Row["sources"][number];
type Positive = NonNullable<Row["positive"]>[number];
type TestOption = {
  code: string;
  name: string;
  hiv: boolean;
  components: { id: string; name: string; answers: string[] }[];
};
type Opt = { code: string; label: string };

const words = (s: string) => s.replaceAll("_", " ");
const section = "border-border bg-card shadow-card flex flex-col gap-3 rounded-lg border p-4";
const th = "text-caption text-muted-foreground px-2 py-1 text-left font-medium";
const td = "border-border border-t px-2 py-1.5 align-top";

/** A record of choices as one select per key (specimen type → column, reason → column, …). */
function MapTable({
  caption,
  keys,
  options,
  value,
  onChange,
  disabled,
}: {
  caption: string;
  keys: { key: string; label: string }[];
  options: string[];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  disabled: boolean;
}) {
  return (
    <table className="text-body-s w-full border-collapse">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {keys.map((k) => (
          <tr key={k.key}>
            <th scope="row" className={`${td} text-left font-normal`}>
              {k.label}
            </th>
            <td className={td}>
              <select
                aria-label={`${caption}: ${k.label}`}
                className={selectClass}
                disabled={disabled}
                value={value[k.key] ?? ""}
                onChange={(e) => {
                  const next = { ...value };
                  if (e.target.value) next[k.key] = e.target.value;
                  else delete next[k.key];
                  onChange(next);
                }}
              >
                <option value="">Not counted</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One 10.2 row: its sources (test, or one component per analyte) and the positive rule per column. */
function RowDialog({
  row,
  label,
  positiveColumns,
  value,
  tests,
  onSave,
}: {
  row: string;
  label: string;
  positiveColumns: string[];
  value: Row | undefined;
  tests: TestOption[];
  onSave: (r: Row | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>(value?.sources ?? []);
  const [positive, setPositive] = useState<Positive[]>(value?.positive ?? []);
  const test = (code: string) => tests.find((t) => t.code === code);
  const components = [
    ...new Map(
      sources.flatMap((s) => test(s.testCode)?.components ?? []).map((c) => [c.id, c]),
    ).values(),
  ];
  const setSource = (i: number, s: Source) => setSources((l) => l.map((x, j) => (j === i ? s : x)));
  const save = () => {
    const clean = sources.filter((s) => s.testCode);
    const pos = positive.filter((p) => p.conceptId && p.answers.length);
    onSave(
      clean.length ? { code: row, sources: clean, ...(pos.length ? { positive: pos } : {}) } : null,
    );
    setOpen(false);
  };
  return (
    <Pop
      label="Edit"
      sr={label}
      title={label}
      lede="Each source counts once per released result: a test, or one of its components (chemistry is counted per analyte). An Others row takes only what you put in it."
      width="wide"
      open={open}
      setOpen={setOpen}
      action={
        <Button type="button" onClick={save}>
          Keep
        </Button>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-s font-medium">Counted from</legend>
        {sources.map((s, i) => {
          const t = test(s.testCode);
          return (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                aria-label="Test"
                className={selectClass}
                value={s.testCode}
                onChange={(e) => setSource(i, { testCode: e.target.value })}
              >
                <option value="">Choose a test</option>
                {tests.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Component"
                className={selectClass}
                value={s.conceptId ?? ""}
                onChange={(e) =>
                  setSource(i, {
                    testCode: s.testCode,
                    ...(e.target.value ? { conceptId: e.target.value } : {}),
                  })
                }
              >
                <option value="">The whole test, once</option>
                {(t?.components ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSources((l) => l.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
              {t?.components.some((c) => c.answers.length) ? (
                <WhereField
                  value={s.where}
                  components={t.components.filter((c) => c.answers.length)}
                  onChange={(where) =>
                    setSource(i, {
                      testCode: s.testCode,
                      ...(s.conceptId ? { conceptId: s.conceptId } : {}),
                      ...(where ? { where } : {}),
                    })
                  }
                />
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          className="w-fit"
          onClick={() => setSources((l) => [...l, { testCode: "" }])}
        >
          Add a source
        </Button>
      </fieldset>
      {positiveColumns.map((column) => {
        const p = positive.find((x) => x.column === column);
        const c = components.find((x) => x.id === p?.conceptId);
        const set = (next: Positive | null) =>
          setPositive((l) => [...l.filter((x) => x.column !== column), ...(next ? [next] : [])]);
        return (
          <fieldset key={column} className="flex flex-col gap-2">
            <legend className="text-body-s font-medium">{column}: counted when</legend>
            <select
              aria-label={`${column}: component`}
              className={selectClass}
              value={p?.conceptId ?? ""}
              onChange={(e) =>
                set(e.target.value ? { column, conceptId: e.target.value, answers: [] } : null)
              }
            >
              <option value="">No positive count</option>
              {components
                .filter((x) => x.answers.length)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
            {c ? (
              <div className="flex flex-wrap gap-3">
                {c.answers.map((a) => (
                  <label
                    key={a}
                    className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8"
                  >
                    <input
                      type="checkbox"
                      checked={p!.answers.includes(a)}
                      onChange={(e) =>
                        set({
                          ...p!,
                          answers: e.target.checked
                            ? [...p!.answers, a]
                            : p!.answers.filter((x) => x !== a),
                        })
                      }
                    />
                    {words(a)}
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
        );
      })}
    </Pop>
  );
}

/** "Only when": the AFB stain method's kind of filter (MB01 fluorescence, MB02 ZN). */
function WhereField({
  value,
  components,
  onChange,
}: {
  value: Source["where"];
  components: { id: string; name: string; answers: string[] }[];
  onChange: (w: Source["where"] | undefined) => void;
}) {
  const c = components.find((x) => x.id === value?.conceptId);
  return (
    <div className="flex flex-col gap-1 sm:col-span-3">
      <select
        aria-label="Only when"
        className={selectClass}
        value={value?.conceptId ?? ""}
        onChange={(e) =>
          onChange(e.target.value ? { conceptId: e.target.value, answers: [] } : undefined)
        }
      >
        <option value="">Every result</option>
        {components.map((x) => (
          <option key={x.id} value={x.id}>
            Only when {x.name} is…
          </option>
        ))}
      </select>
      {c ? (
        <div className="flex flex-wrap gap-3">
          {c.answers.map((a) => (
            <label key={a} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8">
              <input
                type="checkbox"
                checked={value!.answers.includes(a)}
                onChange={(e) =>
                  onChange({
                    conceptId: c.id,
                    answers: e.target.checked
                      ? [...value!.answers, a]
                      : value!.answers.filter((x) => x !== a),
                  })
                }
              />
              {words(a)}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MappingEditor({
  lead,
  form,
  formHash,
  initial,
  draft,
  blocks,
  tests,
  kits,
  items,
  specimenTypes,
  encounterTypes,
  rejectionReasons,
  reasons,
  purposes,
}: {
  lead: boolean;
  form: HmisForm;
  formHash: string;
  initial: MappingPayload | null;
  draft: { id: string; authoredByMe: boolean; leadSigned: boolean } | null;
  blocks: string[];
  tests: TestOption[];
  kits: string[];
  items: { id: string; name: string; kind: string; tracer: string | null }[];
  specimenTypes: string[];
  encounterTypes: string[];
  rejectionReasons: string[];
  reasons: Opt[];
  purposes: Opt[];
}) {
  const [m, setM] = useState<MappingPayload>(
    () =>
      ({
        ...(initial ?? {
          orgUnitCode: null,
          rows: [],
          visits: {},
          specimenColumns: {},
          rejection: {},
          reasons: {},
          hivTests: [],
          kits: {},
          kitItems: {},
          purposes: {},
          tracers: {},
          excluded: [],
          visitsDefinition: "",
        }),
        formHash,
      }) as MappingPayload,
  );
  const { pending, message, act } = useAct();
  const ro = !lead;
  const set = <K extends keyof MappingPayload>(k: K, v: MappingPayload[K]) =>
    setM((x) => ({ ...x, [k]: v }));
  const rowsOf = (s: string) => form.rows.filter((r) => r.section === s);
  const keyOf = (r: HmisForm["rows"][number]) => r.code ?? r.label;
  const columnsOf = (s: string) => form.sections.find((x) => x.id === s)?.columns ?? [];
  const mappedTests = new Set([
    ...m.rows.flatMap((r) => r.sources.map((s) => s.testCode)),
    ...m.hivTests,
  ]);
  const testName = (code: string) => tests.find((t) => t.code === code)?.name ?? code;
  const saveDraft = () =>
    act(async () => saveHmisMappingAction({ payload: m }), "Draft saved. The lead signs it next.");

  return (
    <div className="flex flex-col gap-5">
      <section className={section} aria-labelledby="map-102">
        <h2 id="map-102" className="text-heading-s font-medium">
          10.2 Routine tests
        </h2>
        <table className="text-body-s w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Code</th>
              <th className={th}>Row</th>
              <th className={th}>Counted from</th>
              <th className={th}>Positive when</th>
              <th className={th}>
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rowsOf("10.2").flatMap((r, i, all) => {
              const key = keyOf(r);
              const v = m.rows.find((x) => x.code === key);
              const out = [];
              if (i === 0 || all[i - 1]!.group !== r.group) {
                out.push(
                  <tr key={`g-${r.group}`}>
                    <th
                      colSpan={5}
                      className="text-overline text-muted-foreground px-2 pt-3 text-left uppercase"
                    >
                      {r.group}
                    </th>
                  </tr>,
                );
              }
              out.push(
                <tr key={key}>
                  <td className={`${td} font-mono`}>{r.code}</td>
                  <th scope="row" className={`${td} text-left font-normal`}>
                    {r.label}
                  </th>
                  <td className={td}>
                    {v
                      ? v.sources
                          .map(
                            (s) =>
                              `${testName(s.testCode)}${s.conceptId ? ` · ${tests.find((t) => t.code === s.testCode)?.components.find((c) => c.id === s.conceptId)?.name ?? LABWS2_SETUP.sweep.unknownComponent}` : ""}${s.where ? ` (only ${s.where.answers.map(words).join(", ")})` : ""}`,
                          )
                          .join("; ")
                      : ""}
                  </td>
                  <td className={td}>
                    {(v?.positive ?? [])
                      .map((p) => `${p.column}: ${p.answers.map(words).join(", ")}`)
                      .join("; ")}
                  </td>
                  <td className={td}>
                    {lead ? (
                      <RowDialog
                        key={JSON.stringify(v ?? null)}
                        row={key}
                        label={`${r.code} ${r.label}`}
                        positiveColumns={r.cells
                          .map((c) => c.column)
                          .filter((c) => c !== "Number Done")}
                        value={v}
                        tests={tests}
                        onSave={(next) =>
                          set("rows", [
                            ...m.rows.filter((x) => x.code !== key),
                            ...(next ? [next] : []),
                          ])
                        }
                      />
                    ) : null}
                  </td>
                </tr>,
              );
              return out;
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={section} aria-labelledby="map-101">
          <h2 id="map-101" className="text-heading-s font-medium">
            10.1 and 10.7 columns by specimen type
          </h2>
          <MapTable
            caption="Specimen column"
            keys={specimenTypes.map((s) => ({ key: s, label: words(s) }))}
            options={columnsOf("10.1")}
            value={m.specimenColumns}
            onChange={(v) => set("specimenColumns", v)}
            disabled={ro}
          />
          <h3 className="text-body-s font-medium">Visits by encounter type (LV01 OPD, LV02 IPD)</h3>
          <MapTable
            caption="Visit row"
            keys={encounterTypes.map((s) => ({ key: s, label: words(s) }))}
            options={rowsOf("10.1")
              .filter((r) => r.code?.startsWith("LV"))
              .map(keyOf)}
            value={m.visits}
            onChange={(v) => set("visits", v)}
            disabled={ro}
          />
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">
              How a visit is counted (to confirm with the Division of Health Information)
            </span>
            <textarea
              rows={2}
              maxLength={500}
              className="border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border p-2 outline-none"
              value={m.visitsDefinition}
              disabled={ro}
              onChange={(e) => set("visitsDefinition", e.target.value)}
            />
          </label>
        </section>

        <section className={section} aria-labelledby="map-107">
          <h2 id="map-107" className="text-heading-s font-medium">
            10.7 Rejections and 10.5 Not done here
          </h2>
          <MapTable
            caption="Rejection row"
            keys={rejectionReasons.map((s) => ({ key: s, label: words(s) }))}
            options={rowsOf("10.7").map(keyOf)}
            value={m.rejection}
            onChange={(v) => set("rejection", v)}
            disabled={ro}
          />
          <h3 className="text-body-s font-medium">
            Why a test was not done here (the hub&apos;s reason)
          </h3>
          <MapTable
            caption="10.5 column"
            keys={reasons.map((r) => ({ key: r.code, label: r.label }))}
            options={columnsOf("10.5")}
            value={m.reasons}
            onChange={(v) => set("reasons", v)}
            disabled={ro}
          />
        </section>

        <section className={section} aria-labelledby="map-103">
          <h2 id="map-103" className="text-heading-s font-medium">
            10.3 HIV tests
          </h2>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-body-s text-muted-foreground">Counted in 10.3, not 10.2</legend>
            {tests
              .filter((t) => t.hiv)
              .map((t) => (
                <label
                  key={t.code}
                  className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8"
                >
                  <input
                    type="checkbox"
                    disabled={ro}
                    checked={m.hivTests.includes(t.code)}
                    onChange={(e) =>
                      set(
                        "hivTests",
                        e.target.checked
                          ? [...m.hivTests, t.code]
                          : m.hivTests.filter((x) => x !== t.code),
                      )
                    }
                  />
                  {t.name}
                </label>
              ))}
          </fieldset>
          <MapTable
            caption="Kit row (the signed algorithm's kit names)"
            keys={kits.map((k) => ({ key: k, label: k }))}
            options={rowsOf("10.3").map(keyOf)}
            value={m.kits}
            onChange={(v) => set("kits", v)}
            disabled={ro}
          />
          <MapTable
            caption="Kit row for IQC (stock items)"
            keys={items.filter((i) => i.kind === "kit").map((i) => ({ key: i.id, label: i.name }))}
            options={rowsOf("10.3").map(keyOf)}
            value={m.kitItems}
            onChange={(v) => set("kitItems", v)}
            disabled={ro}
          />
          <MapTable
            caption="Purpose column"
            keys={purposes.map((p) => ({ key: p.code, label: p.label }))}
            options={columnsOf("10.3").slice(0, 6)}
            value={m.purposes}
            onChange={(v) => set("purposes", v)}
            disabled={ro}
          />
        </section>

        <section className={section} aria-labelledby="map-6">
          <h2 id="map-6" className="text-heading-s font-medium">
            6 Tracer stock
          </h2>
          <MapTable
            caption="Tracer row"
            keys={items.map((i) => ({
              key: i.id,
              label: `${i.name}${i.tracer ? ` (item's tracer code ${i.tracer})` : ""}`,
            }))}
            options={rowsOf("6").map(keyOf)}
            value={m.tracers}
            onChange={(v) => set("tracers", v)}
            disabled={ro}
          />
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">Organisation unit code (eHMIS)</span>
            <Input
              value={m.orgUnitCode ?? ""}
              disabled={ro}
              onChange={(e) => set("orgUnitCode", e.target.value.trim() || null)}
              className="min-h-11 w-48 font-mono sm:min-h-9"
            />
          </label>
        </section>
      </div>

      <section className={section} aria-labelledby="map-excluded">
        <h2 id="map-excluded" className="text-heading-s font-medium">
          Tests on the menu in no row
        </h2>
        <p className="text-body-s text-muted-foreground">
          Every in-house test is either in a row (an Others row only by choice) or marked not
          reported.
        </p>
        {tests
          .filter((t) => !mappedTests.has(t.code))
          .map((t) => (
            <label key={t.code} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8">
              <input
                type="checkbox"
                disabled={ro}
                checked={m.excluded.includes(t.code)}
                onChange={(e) =>
                  set(
                    "excluded",
                    e.target.checked
                      ? [...m.excluded, t.code]
                      : m.excluded.filter((x) => x !== t.code),
                  )
                }
              />
              {t.name}: not reported on HMIS 105
              {!m.excluded.includes(t.code) ? (
                <StatusWord tone="caution">Not mapped</StatusWord>
              ) : null}
            </label>
          ))}
      </section>

      {blocks.length ? (
        <section className={section} aria-labelledby="map-blocks">
          <h2 id="map-blocks" className="text-heading-s font-medium">
            <StatusWord tone="caution">What stops the signature</StatusWord>
          </h2>
          <ul id="map-blocks-list" className="text-body-s flex list-disc flex-col gap-1 pl-5">
            {blocks.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {lead ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-col gap-1">
            <LabButton
              type="button"
              onClick={saveDraft}
              className="min-h-11 sm:min-h-8"
              variant="primary"
              busy={pending}
            >
              Save draft
            </LabButton>
            <Said message={message} />
          </div>
          {draft && !draft.leadSigned ? (
            <SignButton
              label="Sign as laboratory lead"
              okText="Signed. The HMIS focal person co-signs it next."
              authoredByMe={draft.authoredByMe}
              noteLabel="You saved this draft: say why no other laboratory lead can sign."
              disabledReason={blocks.length > 0 ? LABWS2.reasons.problemsAbove : null}
              describedBy={blocks.length > 0 ? "map-blocks map-blocks-list" : undefined}
              onSign={(exceptionNote) =>
                signHmisMappingAction({ configId: draft.id, exceptionNote })
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
