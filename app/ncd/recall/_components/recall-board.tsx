"use client";

import type { RecallRow } from "@/lib/ncdreg/read/views";
import type { ConditionModule } from "@/lib/ncdreg/standard/types";
import { useMemo, useState, useTransition } from "react";
import { MessageSquareTextIcon, PhoneIcon } from "lucide-react";

import { Tag } from "@/components/medsync/tag";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/data-table";
import { CALL_OUTCOME, labelOf } from "@/lib/ncdreg/standard/code-lists";
import { cn } from "@/lib/utils";
import { EventDialog } from "../../_components/event-dialog";
import { ClassChip, fmtDate, fmtShort, Num, PhoneText } from "../../_components/kit";
import { useOutbox } from "../../_components/outbox-provider";
import { revealPhoneAction } from "../../actions";
import { Seg } from "../../visit/[visitId]/_components/controls";

type Filter = "to_call" | "called" | "no_phone";
type Outcome = (typeof CALL_OUTCOME.codes)[number]["code"];

const FILTERS: [Filter, string][] = [
  ["to_call", "To call"],
  ["called", "Called"],
  ["no_phone", "No phone"],
];
const inFilter = (r: RecallRow, f: Filter) =>
  f === "no_phone"
    ? r.noPhone
    : f === "called"
      ? !r.noPhone && r.calledThisMonth
      : !r.noPhone && !r.calledThisMonth;

/** E1: the overdue list as a roomy table, with "Log a call" beside it (a panel in the grid, not a sheet). */
export function RecallBoard({
  rows,
  today,
  catalogue,
  canReveal,
  canRecordEvent,
  template,
}: {
  rows: RecallRow[];
  today: string;
  catalogue: readonly ConditionModule[];
  canReveal: boolean;
  canRecordEvent: boolean;
  template: { body: string; approved: boolean } | null;
}) {
  const [filter, setFilter] = useState<Filter>("to_call");
  const shown = useMemo(() => rows.filter((r) => inFilter(r, filter)), [rows, filter]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((r) => r.identity.id === selectedId) ?? null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Overdue patients" className="flex min-w-0 flex-col gap-3">
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter the overdue list"
        >
          {FILTERS.map(([f, label]) => (
            <FilterChip
              key={f}
              active={filter === f}
              onClick={() => setFilter(f)}
              count={rows.filter((r) => inFilter(r, f)).length}
            >
              {label}
            </FilterChip>
          ))}
          <span className="text-caption text-muted-foreground ml-auto">
            Showing {shown.length} of {rows.length}
          </span>
        </div>
        <div className="border-border overflow-x-auto border-y">
          <table className="w-full min-w-[820px] border-collapse text-[14px]">
            <caption className="sr-only">
              Overdue patients, longest overdue first. Select a patient to log a call.
            </caption>
            <thead>
              <tr className="text-ink-600 border-border border-b text-left text-[13px]">
                {["Patient", "Days overdue", "Missed", "At last visit", "Phone", "Last call"].map(
                  (h) => (
                    <th key={h} scope="col" className="h-11 px-3.5 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const on = r.identity.id === selectedId;
                const phone = r.identity.phones.find((p) => !p.invalid) ?? r.identity.phones[0];
                return (
                  <tr
                    key={r.identity.id}
                    className={cn(
                      "border-border h-14 cursor-pointer border-b last:border-b-0",
                      on ? "bg-accent" : "hover:bg-ink-25",
                    )}
                    onClick={() => setSelectedId(r.identity.id)}
                  >
                    <td className="px-3.5">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSelectedId(r.identity.id)}
                        className="focus-visible:shadow-focus flex flex-col items-start rounded-sm text-left outline-none"
                      >
                        <span className="text-foreground font-medium">{r.identity.name}</span>
                        <span className="text-caption text-muted-foreground font-mono">
                          {r.identity.registryNumber}
                        </span>
                      </button>
                    </td>
                    <td className="px-3.5">
                      <Num>{r.daysOverdue}</Num>
                    </td>
                    <td className="px-3.5">
                      <Num>{fmtShort(r.missed)}</Num>
                    </td>
                    <td className="px-3.5">
                      {r.classes.length ? (
                        <span className="flex flex-wrap gap-1">
                          {r.classes.map((c) => (
                            <ClassChip key={c.label} label={c.label} leading={c.leading} />
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not recorded</span>
                      )}
                    </td>
                    <td className="px-3.5">
                      {phone ? (
                        <PhoneText
                          masked={phone.masked}
                          invalid={phone.invalid}
                          demo={r.identity.isSynthetic}
                        />
                      ) : (
                        <span className="text-muted-foreground">No phone recorded</span>
                      )}
                    </td>
                    <td className="px-3.5">
                      {r.lastCall ? (
                        <span>
                          {labelOf(CALL_OUTCOME, r.lastCall.outcome)} ·{" "}
                          <Num>{fmtShort(r.lastCall.date)}</Num>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not called</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!shown.length ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground h-14 px-3.5">
                    No patients in this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <aside
        aria-label="Log a call"
        className="bg-card border-border shadow-card flex flex-col gap-4 rounded-xl border p-4 lg:sticky lg:top-4"
      >
        {selected ? (
          <LogCall
            key={selected.identity.id}
            row={selected}
            today={today}
            modules={catalogue.filter((m) => selected.conditions.includes(m.label))}
            canReveal={canReveal}
            canRecordEvent={canRecordEvent}
            onLogged={() => setSelectedId(null)}
          />
        ) : (
          <p className="text-body-s text-muted-foreground">
            Select a patient in the list to log a call.
          </p>
        )}
        <TemplatePreview template={template} />
      </aside>
    </div>
  );
}

function LogCall({
  row,
  today,
  modules,
  canReveal,
  canRecordEvent,
  onLogged,
}: {
  row: RecallRow;
  today: string;
  modules: readonly ConditionModule[];
  canReveal: boolean;
  canRecordEvent: boolean;
  onLogged: () => void;
}) {
  const { submit } = useOutbox();
  const idn = row.identity;
  const valid = idn.phones.filter((p) => !p.invalid);
  const [slot, setSlot] = useState<1 | 2>(valid[0]?.slot ?? 1);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Outcome | null>(null);
  const [newDate, setNewDate] = useState("");
  const [eventType, setEventType] = useState<"death" | "transfer_out" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reveal = (s: 1 | 2) =>
    start(async () => {
      const r = await revealPhoneAction(idn.id, s);
      if (r.ok && r.value) setRevealed((v) => ({ ...v, [s]: r.value!.number }));
      else setMsg(r.ok ? "No number recorded." : r.message);
    });

  const log = (outcome: Outcome) =>
    start(async () => {
      setMsg(null);
      const r = await submit("call.log", {
        callId: crypto.randomUUID(),
        personId: idn.id,
        appointmentId: row.appointmentId,
        outcome,
        newAppointmentDate: outcome === "will_return" && newDate ? newDate : null,
        phoneSlot: valid.length ? slot : null,
      });
      if (r.ok) onLogged();
      else setMsg(r.message);
    });

  // Moved or transferred and Died open the event form; the call is logged once the event is saved.
  const choose = (o: Outcome) => {
    if (o === "died" || o === "moved_or_transferred") {
      if (!canRecordEvent)
        return setMsg(
          "Recording a death or a transfer needs the event permission. Ask a clinician.",
        );
      return setEventType(o === "died" ? "death" : "transfer_out");
    }
    setPicked(o);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-caption text-ink-600 font-medium">Log a call</p>
        <p className="text-body-m text-foreground font-medium">{idn.name}</p>
        <p className="text-caption text-muted-foreground">
          <span className="font-mono">{idn.registryNumber}</span> · {row.daysOverdue} days overdue ·
          missed {fmtDate(row.missed)}
          {row.conditions.length ? ` · ${row.conditions.join(", ")}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {idn.phones.length ? (
          idn.phones.map((p) => (
            <div
              key={p.slot}
              className="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
            >
              <span className="inline-flex items-center gap-2">
                <PhoneIcon className="text-ink-500 size-4" aria-hidden />
                {revealed[p.slot] ? (
                  idn.isSynthetic ? (
                    <PhoneText masked={revealed[p.slot]!} demo />
                  ) : (
                    <a
                      href={`tel:${revealed[p.slot]!.replace(/\s+/g, "")}`}
                      className="text-teal-text font-mono tabular-nums underline-offset-4 hover:underline"
                    >
                      {revealed[p.slot]}
                    </a>
                  )
                ) : (
                  <PhoneText masked={p.masked} invalid={p.invalid} demo={idn.isSynthetic} />
                )}
              </span>
              {canReveal && !revealed[p.slot] && !p.invalid ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => reveal(p.slot)}
                >
                  Show number
                </Button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-body-s text-muted-foreground">No phone recorded.</p>
        )}
        <p className="text-caption text-muted-foreground">
          Showing a phone number is written to the audit log.
        </p>
        {valid.length > 1 ? (
          <Seg
            label="Number called"
            value={String(slot)}
            onChange={(v) => setSlot(v === "2" ? 2 : 1)}
            options={valid.map((p) => [String(p.slot), `Number ${p.slot}`] as const)}
            hideLabel={false}
          />
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label mb-1">Outcome</legend>
        <div className="grid grid-cols-2 gap-2">
          {CALL_OUTCOME.codes.map((o) => (
            <Button
              key={o.code}
              variant={picked === o.code ? "soft" : "secondary"}
              className="h-11"
              aria-pressed={picked === o.code}
              disabled={pending}
              onClick={() => choose(o.code as Outcome)}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <p className="text-caption text-muted-foreground">
          Pick an outcome, then confirm. Moved, transferred or died opens the event form and stops
          every reminder.
        </p>
      </fieldset>

      {picked ? (
        <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
          {picked === "will_return" ? (
            <label className="flex flex-col gap-1">
              <span className="text-label">New appointment date (optional)</span>
              <input
                type="date"
                min={today}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="border-input h-10 rounded-lg border bg-transparent px-3 text-[14px]"
              />
            </label>
          ) : null}
          <p className="text-body-s">
            Log <span className="font-medium">{labelOf(CALL_OUTCOME, picked)}</span>
            {picked === "wrong_number"
              ? " and flag the number invalid"
              : picked === "declined"
                ? " and remove from the overdue list"
                : ""}
            ?
          </p>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => log(picked)}>
              Confirm
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setPicked(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {msg ? (
        <p role="alert" className="text-body-s text-foreground">
          {msg}
        </p>
      ) : null}

      {eventType ? (
        <EventDialog
          key={eventType}
          open
          onOpenChange={(o) => (o ? null : setEventType(null))}
          personId={idn.id}
          personName={idn.name}
          modules={modules}
          initialType={eventType}
          today={today}
          onDone={() => log(eventType === "death" ? "died" : "moved_or_transferred")}
        />
      ) : null}
    </div>
  );
}

function TemplatePreview({ template }: { template: { body: string; approved: boolean } | null }) {
  return (
    <div className="border-border flex flex-col gap-2 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label inline-flex items-center gap-1.5">
          <MessageSquareTextIcon className="text-ink-500 size-4" aria-hidden />
          Missed-visit SMS
        </p>
        <Tag hue="slate">{template?.approved ? "Approved template" : "Draft template"}</Tag>
      </div>
      <p className="border-border text-ink-700 rounded-lg border border-dashed p-3 font-mono text-[12px]">
        {template?.body || "No template written yet."}
      </p>
      {!template?.approved ? (
        <p className="text-caption text-muted-foreground">
          None sent. A template is sent only after two people approve it.
        </p>
      ) : null}
      <p className="text-caption text-muted-foreground">
        It never names a condition, a measurement, a medicine or the department.
      </p>
    </div>
  );
}
