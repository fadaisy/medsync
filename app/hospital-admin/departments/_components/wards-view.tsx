"use client";

import type { WardRow } from "@/lib/services/data";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LayoutGridIcon, PlusIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WARD_AGE_GROUPS, WARD_SEXES, WARD_TYPES } from "@/supabase/functions/_shared/services-hub";
import {
  Amber,
  ConfirmBlock,
  ErrorLine,
  Field,
  fmtDate,
  HonestLine,
  HubPanel,
  inputClass,
  PanelColumns,
  RowButton,
  Select,
  StatusChip,
  useHub,
} from "./hub-ui";

type Option = { id: string; name: string };
type Nurse = { userId: string; name: string; cadre: string | null };
/** Per ward: a published layout and/or a draft. Null when the ward builder is off. */
type Layouts = Record<string, { published: boolean; draft: boolean }> | null;

const label = (list: ReadonlyArray<{ code: string; label: string }>, code: string | null) =>
  list.find((x) => x.code === code)?.label ?? null;

export function WardsView({
  wards,
  departments,
  nurses,
  places,
  layouts = null,
}: {
  wards: WardRow[];
  departments: Option[];
  nurses: Nurse[];
  places: Option[];
  layouts?: Layouts;
}) {
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(() => params.get("open"));
  const [adding, setAdding] = useState(() => params.get("new") === "1");
  const [showArchived, setShowArchived] = useState(false);
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "—";
  const visible = wards.filter((w) => showArchived || !w.archived);
  const open = wards.find((w) => w.id === openId) ?? null;
  const totalBeds = wards.filter((w) => !w.archived).reduce((n, w) => n + w.bedCount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <HonestLine>
          {layouts
            ? "Bed counts here are the denominator. Occupancy shows on each ward's live bed board once its layout is published."
            : "Occupancy arrives with the inpatient module. Bed counts here are the denominator."}
        </HonestLine>
        <Button size="sm" onClick={() => setAdding(true)} disabled={departments.length === 0}>
          <PlusIcon aria-hidden /> Add ward
        </Button>
      </div>
      {departments.length === 0 ? (
        <p className="text-body-s text-muted-foreground">
          Add a department first — every ward belongs to one.
        </p>
      ) : null}

      {visible.length ? (
        <section className="border-border bg-card overflow-hidden rounded-lg border">
          <div className="text-muted-foreground border-border hidden grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_1fr] gap-3 border-b px-4 py-2 font-mono text-[10.5px] tracking-[0.12em] uppercase md:grid">
            <span>Ward</span>
            <span>Department</span>
            <span>Type</span>
            <span>Beds</span>
            <span>In-charge</span>
            <span>Status</span>
          </div>
          <ul className="divide-border divide-y">
            {visible.map((w) => {
              const closedBeds = w.beds.filter((b) => !b.archived && b.closedReason).length;
              const sexAge = [label(WARD_SEXES, w.sex), label(WARD_AGE_GROUPS, w.ageGroup)]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={w.id}>
                  <RowButton label={`Open ${w.name}`} onClick={() => setOpenId(w.id)}>
                    <span className="grid min-w-0 flex-1 grid-cols-1 gap-1 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_1fr] md:items-center md:gap-3">
                      <span className="text-foreground text-body-s truncate font-medium">
                        {w.name}
                      </span>
                      <span className="text-muted-foreground text-caption truncate">
                        {deptName(w.departmentId)}
                      </span>
                      <span className="text-muted-foreground text-caption truncate">
                        {label(WARD_TYPES, w.wardType) ?? "—"}
                        {sexAge ? ` · ${sexAge}` : ""}
                      </span>
                      <span className="text-caption">
                        <span className="text-foreground font-mono tabular-nums">{w.bedCount}</span>
                        {closedBeds ? (
                          <span className="text-muted-foreground"> · {closedBeds} closed</span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-caption truncate">
                        {w.inCharge.length
                          ? w.inCharge
                              .map((c) => `${c.acting ? "Acting: " : ""}${c.name}`)
                              .join(" · ")
                          : "—"}
                      </span>
                      <span>
                        {w.archived ? (
                          <StatusChip status="archived" />
                        ) : w.closed ? (
                          <Amber>Temporarily closed</Amber>
                        ) : (
                          <StatusChip status="available" />
                        )}
                      </span>
                    </span>
                  </RowButton>
                </li>
              );
            })}
          </ul>
          <div className="border-border text-muted-foreground text-caption flex items-center justify-between border-t px-4 py-2.5">
            <span>
              <span className="text-foreground font-mono tabular-nums">{totalBeds}</span> beds
              across {wards.filter((w) => !w.archived).length} wards
            </span>
            {wards.some((w) => w.archived) ? (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="hover:text-foreground"
              >
                {showArchived ? "Hide archived" : "Show archived"}
              </button>
            ) : null}
          </div>
        </section>
      ) : departments.length ? (
        <p className="text-body-s text-muted-foreground">
          No wards yet. Add the wards you run; ICU, HDU, isolation and NICU beds feed Emergency
          &amp; support.
        </p>
      ) : null}

      {adding ? (
        <WardPanel
          ward={null}
          departments={departments}
          nurses={nurses}
          places={places}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {open ? (
        <WardPanel
          key={open.id}
          ward={open}
          departments={departments}
          nurses={nurses}
          places={places}
          layout={layouts ? (layouts[open.id] ?? { published: false, draft: false }) : null}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function WardPanel({
  ward,
  departments,
  nurses,
  places,
  layout = null,
  onClose,
}: {
  ward: WardRow | null;
  departments: Option[];
  nurses: Nurse[];
  places: Option[];
  /** The ward's layout state; null when the ward builder is off. */
  layout?: { published: boolean; draft: boolean } | null;
  onClose: () => void;
}) {
  const hub = useHub();
  const laidOut = !!layout?.published;
  const [form, setForm] = useState({
    name: ward?.name ?? "",
    department_id: ward?.departmentId ?? departments[0]?.id ?? "",
    ward_type: ward?.wardType ?? "",
    sex: ward?.sex ?? "",
    age_group: ward?.ageGroup ?? "",
    place_id: ward?.placeId ?? "",
    bed_count: String(ward?.bedCount ?? ""),
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const beds = Number(form.bed_count);
  const valid =
    form.name.trim().length >= 2 && form.department_id && Number.isInteger(beds) && beds >= 0;
  const save = () =>
    hub.run(
      {
        op: "upsert_ward",
        id: ward?.id,
        name: form.name.trim(),
        department_id: form.department_id,
        ward_type: form.ward_type || null,
        sex: form.sex || null,
        age_group: form.age_group || null,
        place_id: form.place_id || null,
        bed_count: beds,
      },
      () => !ward && onClose(),
    );

  const details = (
    <>
      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="Ward name">
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            maxLength={80}
            placeholder="For example, Female medical"
          />
        </Field>
        <Field label="Owning department">
          <Select
            value={form.department_id}
            onChange={set("department_id")}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </Field>
        <Field label="Type">
          <Select
            value={form.ward_type}
            onChange={set("ward_type")}
            placeholder="Choose"
            options={WARD_TYPES.map((t) => ({ value: t.code, label: t.label }))}
          />
        </Field>
        <Field
          label="Beds"
          hint={
            laidOut
              ? "Set by the published layout (ADR 0192). Change the beds on the plan."
              : "The total; closed beds still count."
          }
        >
          <input
            className={cn(inputClass, "font-mono")}
            inputMode="numeric"
            value={form.bed_count}
            readOnly={laidOut}
            aria-readonly={laidOut || undefined}
            onChange={(e) => set("bed_count")(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="Sex">
          <Select
            value={form.sex}
            onChange={set("sex")}
            placeholder="Choose"
            options={WARD_SEXES.map((t) => ({ value: t.code, label: t.label }))}
          />
        </Field>
        <Field label="Age group">
          <Select
            value={form.age_group}
            onChange={set("age_group")}
            placeholder="Choose"
            options={WARD_AGE_GROUPS.map((t) => ({ value: t.code, label: t.label }))}
          />
        </Field>
        <Field label="Place">
          <Select
            value={form.place_id}
            onChange={set("place_id")}
            placeholder="No place set"
            options={places.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      </section>
      <div>
        <Button disabled={hub.pending || !valid} onClick={save}>
          {hub.pending ? "Saving…" : ward ? "Save ward" : "Add ward"}
        </Button>
      </div>
    </>
  );

  return (
    <HubPanel
      open
      wide={!!ward && !ward.archived}
      onClose={onClose}
      title={ward ? ward.name : "Add a ward"}
      description={
        ward
          ? "Every change is audited."
          : "Name, department and beds are enough to start; the rest can follow."
      }
    >
      <ErrorLine error={hub.error} />

      {ward && !ward.archived ? (
        <PanelColumns
          left={
            <>
              {details}
              <Closure ward={ward} />
              <section className="border-border border-t pt-4">
                <ConfirmBlock
                  verb="Archive ward"
                  tone="caution"
                  pending={hub.pending}
                  consequence={
                    <>
                      It leaves every list and its beds stop counting. Its history stays, and you
                      can restore it.
                    </>
                  }
                  onConfirm={(reason) =>
                    hub.run({ op: "archive", target: "ward", id: ward.id, reason }, onClose)
                  }
                />
              </section>
            </>
          }
          right={
            <>
              {layout ? <LayoutEntry ward={ward} layout={layout} /> : null}
              <InCharge ward={ward} nurses={nurses} />
              <BedRegister ward={ward} laidOut={laidOut} />
            </>
          }
        />
      ) : (
        details
      )}
      {ward?.archived ? (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={hub.pending}
          onClick={() => hub.run({ op: "unarchive", target: "ward", id: ward.id })}
        >
          Restore from the archive
        </Button>
      ) : null}
    </HubPanel>
  );
}

function InCharge({ ward, nurses }: { ward: WardRow; nurses: Nurse[] }) {
  const hub = useHub();
  const [mode, setMode] = useState<"in_charge" | "acting" | null>(null);
  const [userId, setUserId] = useState("");
  const [endsOn, setEndsOn] = useState("");
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-foreground text-body-s font-medium">In-charge</h3>
      <ErrorLine error={hub.error} />
      {ward.inCharge.length ? (
        <ul className="flex flex-col gap-1.5">
          {ward.inCharge.map((c) => (
            <li key={c.id} className="text-body-s flex flex-wrap items-center gap-2">
              <span className="text-foreground">{c.name}</span>
              <span className="text-muted-foreground text-caption">
                {c.acting ? "Acting" : "In-charge"} since {fmtDate(c.since)}
              </span>
              <Button
                variant="link"
                size="sm"
                className="text-teal-700"
                disabled={hub.pending}
                onClick={() => hub.run({ op: "end_ward_in_charge", assignment_id: c.id })}
              >
                End
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-s text-muted-foreground">Nobody yet.</p>
      )}
      {mode ? (
        <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-md border p-3">
          {nurses.length ? (
            <Field
              label={mode === "acting" ? "Acting in-charge" : "In-charge"}
              hint="Approved nursing staff at this hospital."
            >
              <Select
                value={userId}
                onChange={setUserId}
                placeholder="Choose a nurse or midwife"
                options={nurses.map((n) => ({
                  value: n.userId,
                  label: n.cadre ? `${n.name} — ${n.cadre}` : n.name,
                }))}
              />
            </Field>
          ) : (
            <p className="text-body-s text-muted-foreground">
              No approved nursing staff at this hospital yet.
            </p>
          )}
          {mode === "acting" ? (
            <Field label="Acting until (optional)">
              <input
                type="date"
                className={inputClass}
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </Field>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={hub.pending || !userId}
              onClick={() =>
                hub.run(
                  {
                    op: "assign_ward_in_charge",
                    ward_id: ward.id,
                    user_id: userId,
                    acting: mode === "acting",
                    ends_on: endsOn || null,
                  },
                  () => {
                    setMode(null);
                    setUserId("");
                  },
                )
              }
            >
              Assign
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setMode("in_charge")}>
            {ward.inCharge.some((c) => !c.acting) ? "Change in-charge" : "Assign in-charge"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("acting")}>
            Add acting in-charge
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * The way into the ward builder (ADR 0191): the layout, and once published the live bed board. A ward
 * with a register but no layout can start from the register, so no bed is lost.
 */
function LayoutEntry({
  ward,
  layout,
}: {
  ward: WardRow;
  layout: { published: boolean; draft: boolean };
}) {
  const hub = useHub();
  const router = useRouter();
  const base = `/hospital-admin/departments/wards/${ward.id}`;
  const registered = ward.beds.filter((b) => !b.archived).length;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-foreground text-body-s font-medium">Layout</h3>
      <ErrorLine error={hub.error} />
      <p className="text-body-s text-muted-foreground">
        {layout.published
          ? `Published${layout.draft ? ", with a draft in progress" : ""}. Its beds are this ward's register.`
          : layout.draft
            ? "A draft is in progress; nothing is published yet."
            : "No layout yet. Lay the ward out on a floor plan: beds, rooms and what is at each bed."}
      </p>
      <div className="flex flex-wrap gap-2">
        {!layout.published && !layout.draft && registered > 0 ? (
          <Button
            size="sm"
            disabled={hub.pending}
            onClick={() =>
              hub.run({ op: "start_layout_from_register", ward_id: ward.id }, () =>
                router.push(`${base}/layout`),
              )
            }
          >
            Start from the register
          </Button>
        ) : null}
        {/* Navigations: links wearing the button's classes (a Button would stamp role="button"). */}
        <Link
          href={`${base}/layout`}
          className={buttonVariants({
            size: "sm",
            variant: !layout.published && !layout.draft && registered > 0 ? "secondary" : "primary",
          })}
        >
          <LayoutGridIcon aria-hidden /> Layout
        </Link>
        {layout.published ? (
          <Link
            href={`${base}/board`}
            className={buttonVariants({ size: "sm", variant: "secondary" })}
          >
            Live bed board
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function BedRegister({ ward, laidOut = false }: { ward: WardRow; laidOut?: boolean }) {
  const hub = useHub();
  const [closing, setClosing] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const active = ward.beds.filter((b) => !b.archived);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-foreground text-body-s font-medium">
          Bed register <span className="text-muted-foreground font-normal">(optional)</span>
        </h3>
        {!laidOut && active.length < ward.bedCount ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={hub.pending}
            onClick={() => hub.run({ op: "generate_beds", ward_id: ward.id })}
          >
            Generate{" "}
            {active.length
              ? `the other ${ward.bedCount - active.length}`
              : `Bed 1–${ward.bedCount}`}
          </Button>
        ) : null}
      </div>
      <ErrorLine error={hub.error} />
      {active.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {active.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => {
                  setClosing(closing === b.id ? null : b.id);
                  setWhy("");
                }}
                className={cn(
                  "text-caption rounded border px-2 py-1 font-mono",
                  b.closedReason
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                    : "border-border hover:bg-muted",
                )}
                title={b.closedReason ? `Closed: ${b.closedReason}` : "Open"}
              >
                {b.label}
                {b.closedReason ? " · closed" : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-s text-muted-foreground">
          No register — the count above is enough until you need named beds.
        </p>
      )}
      {closing
        ? (() => {
            const b = active.find((x) => x.id === closing)!;
            return b.closedReason ? (
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                disabled={hub.pending}
                onClick={() =>
                  hub.run({ op: "set_bed", bed_id: b.id, closed: false }, () => setClosing(null))
                }
              >
                Reopen {b.label}
              </Button>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Field label={`Close ${b.label} — why?`}>
                  <input
                    className={inputClass}
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    maxLength={200}
                    placeholder="For example, broken bed frame"
                  />
                </Field>
                <Button
                  size="sm"
                  disabled={hub.pending || why.trim().length < 3}
                  onClick={() =>
                    hub.run(
                      { op: "set_bed", bed_id: b.id, closed: true, closed_reason: why.trim() },
                      () => setClosing(null),
                    )
                  }
                >
                  Close bed
                </Button>
              </div>
            );
          })()
        : null}
    </section>
  );
}

function Closure({ ward }: { ward: WardRow }) {
  const hub = useHub();
  const [why, setWhy] = useState("");
  const [back, setBack] = useState("");
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-foreground text-body-s font-medium">Status</h3>
      <ErrorLine error={hub.error} />
      {ward.closed ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <Amber>Temporarily closed</Amber>
            <span className="text-muted-foreground">
              {ward.closed.reason} · since {fmtDate(ward.closed.since)}
              {ward.closed.expectedReopenOn
                ? ` · expected to reopen ${fmtDate(`${ward.closed.expectedReopenOn}T12:00:00+03:00`)}`
                : ""}
            </span>
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={hub.pending}
            onClick={() => hub.run({ op: "set_ward_closure", ward_id: ward.id, closed: false })}
          >
            Reopen the ward
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Close temporarily — why?">
            <input
              className={inputClass}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              maxLength={200}
              placeholder="For example, renovation"
            />
          </Field>
          <Field label="Expected to reopen (optional)">
            <input
              type="date"
              className={inputClass}
              value={back}
              onChange={(e) => setBack(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            variant="secondary"
            disabled={hub.pending || why.trim().length < 3}
            onClick={() =>
              hub.run({
                op: "set_ward_closure",
                ward_id: ward.id,
                closed: true,
                closed_reason: why.trim(),
                expected_reopen_on: back || null,
              })
            }
          >
            Close ward
          </Button>
        </div>
      )}
      <p className="text-muted-foreground text-caption">
        A closed ward shows in Availability until it reopens.
      </p>
    </section>
  );
}
