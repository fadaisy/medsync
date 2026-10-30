"use client";

import type { TestMenuData } from "@/lib/lab/test-menu-read";
import type { OfferingRow } from "@/lib/services/data";
import type { Comparison, OpenProblem } from "@/supabase/functions/_shared/services-hub";
import Link from "next/link";
import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { PillTabs } from "@/components/tide/work/space";
import { HospitalProfiles } from "@/components/lab/test-menu/profiles";
import { TestMenu } from "@/components/lab/test-menu/test-menu";
import { Button } from "@/components/ui/button";
import { LAB_TEST_MENU } from "@/content/lab-test-menu";
import { cn } from "@/lib/utils";
import { IMAGING_ITEMS, LAB_SECTIONS } from "@/supabase/functions/_shared/services-hub";
import {
  Amber,
  ErrorLine,
  Field,
  HubPanel,
  inputClass,
  Select,
  StatusChip,
  useHub,
} from "./hub-ui";

type Section = { id: string; name: string; code: string | null };
type Kind = "lab" | "imaging";

const WHERE = [
  { value: "in_house", label: "In-house" },
  { value: "referred", label: "Referred out" },
  { value: "not_offered", label: "Not offered" },
];
const whereLabel = (o: OfferingRow | undefined) =>
  !o
    ? "Not set"
    : o.provision === "in_house"
      ? "In-house"
      : o.provision === "referred"
        ? `Referred${o.referredTo ? ` · ${o.referredTo}` : ""}`
        : "Not offered";

function Now({
  offering,
  problem,
}: {
  offering: OfferingRow | undefined;
  problem: OpenProblem | undefined;
}) {
  if (problem) {
    return (
      <span className="flex flex-col items-start gap-0.5">
        <Amber>
          {problem.unconfirmed
            ? "Unconfirmed — check"
            : problem.state === "limited"
              ? "Limited"
              : "Unavailable"}
        </Amber>
        {problem.note ? (
          <span className="text-muted-foreground text-[11px]">{problem.note}</span>
        ) : null}
      </span>
    );
  }
  if (!offering || offering.provision === "not_offered" || !offering.confirmedAt)
    return <span className="text-muted-foreground">—</span>;
  return <StatusChip status="available" />;
}

export function DiagnosticsView(props: {
  sub: "lab" | "imaging";
  tab: "menu" | "profiles";
  lab: { id: string; live: boolean } | null;
  sections: Section[];
  menu: TestMenuData;
  offerings: OfferingRow[];
  problems: OpenProblem[];
  imagingComparison: Comparison | null;
  presetLabel: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Diagnostics"
        className="border-border inline-flex self-start rounded-md border p-0.5"
      >
        {(["lab", "imaging"] as const).map((s) => (
          <Link
            key={s}
            href={`/hospital-admin/departments/diagnostics${s === "imaging" ? "?sub=imaging" : ""}`}
            aria-current={props.sub === s ? "true" : undefined}
            className={cn(
              "text-body-s rounded-sm px-3 py-1",
              props.sub === s
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "lab" ? "Laboratory" : "Imaging & other tests"}
          </Link>
        ))}
      </div>
      {props.sub === "lab" ? <Laboratory {...props} /> : <Imaging {...props} />}
    </div>
  );
}

/* ─── Laboratory ────────────────────────────────────────────────────── */

function Laboratory({ lab, sections, menu, tab }: Parameters<typeof DiagnosticsView>[0]) {
  const hub = useHub();
  const [section, setSection] = useState("");

  if (!lab) {
    return (
      <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-5">
        <p className="text-body-s text-foreground">
          The test menu hangs off the Laboratory department, and sections are its units.
        </p>
        <ErrorLine error={hub.error} />
        <Button
          size="sm"
          className="self-start"
          disabled={hub.pending}
          onClick={() => hub.run({ op: "add_departments", codes: ["LABORATORY"] })}
        >
          <PlusIcon aria-hidden /> Add the Laboratory
        </Button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {/* Sections: the hub units staff are assigned to; the menu's sections come from the catalogue (TM-5). */}
      <div className="flex flex-wrap items-center gap-2">
        {sections.map((s) => (
          <span key={s.id} className="border-border text-body-s rounded border px-2 py-0.5">
            {s.name}
          </span>
        ))}
        <Select
          aria-label="Add a laboratory section"
          className="w-56"
          value={section}
          onChange={setSection}
          placeholder="Add a section"
          options={LAB_SECTIONS.filter((s) => !sections.some((x) => x.code === s.code)).map(
            (s) => ({ value: s.code, label: s.label }),
          )}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={hub.pending || !section}
          onClick={() =>
            hub.run({ op: "add_unit", department_id: lab.id, catalogue_code: section }, () =>
              setSection(""),
            )
          }
        >
          Add
        </Button>
        <Link
          href={`/hospital-admin/departments?open=${lab.id}`}
          className="text-caption text-teal-700 hover:underline"
        >
          Section in-charges
        </Link>
      </div>
      <ErrorLine error={hub.error} />
      {/* Lab test menu v2 (board 13, 17): the same component as the lab's Set-up → Tests (TM-U6). */}
      <PillTabs
        label={LAB_TEST_MENU.hubTitle}
        current={tab}
        tabs={[
          {
            key: "menu",
            label: LAB_TEST_MENU.tabs.menu,
            href: "/hospital-admin/departments/diagnostics",
          },
          {
            key: "profiles",
            label: LAB_TEST_MENU.tabs.profiles,
            href: "/hospital-admin/departments/diagnostics?tab=profiles",
          },
        ]}
      />
      {tab === "profiles" ? <HospitalProfiles data={menu} /> : <TestMenu data={menu} />}
    </section>
  );
}

/* ─── Imaging & other tests ─────────────────────────────────────────── */

function Imaging({
  offerings,
  problems,
  imagingComparison,
  presetLabel,
}: Parameters<typeof DiagnosticsView>[0]) {
  const [editing, setEditing] = useState<string | null>(null);
  const byCode = new Map(offerings.filter((o) => o.kind === "imaging").map((o) => [o.code, o]));
  const edit = IMAGING_ITEMS.find((i) => i.code === editing) ?? null;
  return (
    <section className="flex flex-col gap-3">
      {imagingComparison && presetLabel ? (
        <p className="text-muted-foreground text-body-s">
          You offer{" "}
          <span className="text-foreground font-mono tabular-nums">
            {imagingComparison.offered}
          </span>{" "}
          of the{" "}
          <span className="text-foreground font-mono tabular-nums">
            {imagingComparison.inPreset}
          </span>{" "}
          imaging services the MoH 2016 standards list for a {presetLabel}
          {imagingComparison.gaps.length
            ? ` · Not yet: ${imagingComparison.gaps.map((g) => g.label).join(", ")}`
            : ""}
          .
        </p>
      ) : null}
      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] border-collapse">
          <caption className="sr-only">Imaging and other tests</caption>
          <thead className="bg-muted/40">
            <tr className="text-muted-foreground text-left font-mono text-[10.5px] tracking-[0.12em] uppercase">
              <th className="px-3 py-2 font-medium">Service</th>
              <th className="px-3 py-2 font-medium">Where</th>
              <th className="px-3 py-2 font-medium">Machines</th>
              <th className="px-3 py-2 font-medium">Hours</th>
              <th className="px-3 py-2 font-medium">Now</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {IMAGING_ITEMS.map((i) => {
              const o = byCode.get(i.code);
              return (
                <tr key={i.code} className="text-body-s hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setEditing(i.code)}
                      className="text-foreground font-medium hover:underline"
                    >
                      {i.label}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {o && !o.confirmedAt ? (
                      <StatusChip status="planned" />
                    ) : (
                      <span className={cn(!o && "text-muted-foreground")}>{whereLabel(o)}</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 font-mono">
                    {o?.machines ?? "—"}
                  </td>
                  <td className="text-muted-foreground px-3 py-2">
                    {o?.provision === "in_house"
                      ? o.hours === "24h"
                        ? "24 h"
                        : (o.hoursNote ?? "—")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Now
                      offering={o}
                      problem={problems.find(
                        (p) => p.subjectKind === "imaging" && p.subjectRef === i.code,
                      )}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit ? (
        <OfferingPanel
          kind="imaging"
          code={edit.code}
          name={edit.label}
          offering={byCode.get(edit.code)}
          sections={[]}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

/* ─── one offering, one panel ───────────────────────────────────────── */

function OfferingPanel({
  kind,
  code,
  name,
  offering,
  sections,
  onClose,
}: {
  kind: Kind;
  code: string;
  name: string;
  offering: OfferingRow | undefined;
  sections: Section[];
  onClose: () => void;
}) {
  const hub = useHub();
  const [f, setF] = useState({
    provision: offering?.provision ?? "in_house",
    section_id: offering?.sectionId ?? "",
    hours: offering?.hours ?? "scheduled",
    hours_note: offering?.hoursNote ?? "",
    stated_tat: offering?.statedTat ?? "",
    referred_to: offering?.referredTo ?? "",
    machines: offering?.machines != null ? String(offering.machines) : "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    hub.run(
      {
        op: "upsert_offerings",
        items: [
          {
            kind,
            code,
            provision: f.provision,
            section_id: f.section_id || null,
            hours: f.provision === "in_house" ? f.hours : null,
            hours_note:
              f.provision === "in_house" && f.hours === "scheduled" ? f.hours_note || null : null,
            stated_tat: f.stated_tat || null,
            referred_to: f.provision === "referred" ? f.referred_to || null : null,
            machines:
              kind === "imaging" && f.provision === "in_house" && f.machines
                ? Number(f.machines)
                : null,
          },
        ],
      },
      onClose,
    );
  return (
    <HubPanel
      open
      onClose={onClose}
      title={name}
      description="Imaging & other tests"
      footer={
        <div className="flex w-full flex-col gap-2">
          <ErrorLine error={hub.error} />
          <Button className="self-start" disabled={hub.pending} onClick={save}>
            {hub.pending ? "Saving…" : offering && !offering.confirmedAt ? "Confirm" : "Save"}
          </Button>
        </div>
      }
    >
      {offering && !offering.confirmedAt ? (
        <p className="text-body-s text-muted-foreground">
          Planned from a standard or your application — confirm how you actually do it.
        </p>
      ) : null}
      <Field label="Where" group>
        <div role="radiogroup" aria-label="Where" className="flex flex-wrap gap-1.5">
          {WHERE.map((w) => (
            <button
              key={w.value}
              type="button"
              role="radio"
              aria-checked={f.provision === w.value}
              onClick={() => set("provision", w.value as typeof f.provision)}
              className={cn(
                "text-body-s rounded-sm border px-3 py-1.5",
                f.provision === w.value
                  ? "border-teal-700 bg-teal-50 text-teal-900"
                  : "border-input hover:bg-muted",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </Field>
      {kind === "lab" && sections.length ? (
        <Field label="Section (the bench it runs on)">
          <Select
            value={f.section_id}
            onChange={(v) => set("section_id", v)}
            placeholder="No section"
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
      ) : null}
      {f.provision === "in_house" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hours">
            <Select
              value={f.hours}
              onChange={(v) => set("hours", v as typeof f.hours)}
              options={[
                { value: "24h", label: "24 hours" },
                { value: "scheduled", label: "Scheduled" },
              ]}
            />
          </Field>
          {f.hours === "scheduled" ? (
            <Field label="When">
              <input
                className={inputClass}
                value={f.hours_note}
                onChange={(e) => set("hours_note", e.target.value)}
                maxLength={60}
                placeholder="Mon–Fri"
              />
            </Field>
          ) : null}
          {kind === "imaging" ? (
            <Field label="Machines">
              <input
                className={cn(inputClass, "font-mono")}
                inputMode="numeric"
                value={f.machines}
                onChange={(e) => set("machines", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
      {f.provision === "referred" ? (
        <Field
          label="Referred to"
          hint="The sample transport hub, CPHL, a named facility or a private lab."
        >
          <input
            className={inputClass}
            value={f.referred_to}
            onChange={(e) => set("referred_to", e.target.value)}
            maxLength={120}
          />
        </Field>
      ) : null}
      {f.provision !== "not_offered" ? (
        <Field label="Stated turnaround" hint="Your operational figure — never a clinical target.">
          <input
            className={inputClass}
            value={f.stated_tat}
            onChange={(e) => set("stated_tat", e.target.value)}
            maxLength={40}
            placeholder="2 h, 1 day…"
          />
        </Field>
      ) : null}
    </HubPanel>
  );
}
