import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { RegisterKind } from "@/lib/lab/register-store";
import type { ReactNode } from "react";

import { fill, LAB3, LAB3_REGISTER } from "@/content/lab-phase-3";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { loadLabSections } from "@/lib/lab/read";
import { dailyRegister } from "@/lib/lab/register";
import {
  classAccessFor,
  columnChoices,
  loadRegisterDay,
  registerConfigFor,
  withIdentities,
} from "@/lib/lab/register-store";
import { dayOf } from "@/lib/lab/stock";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { Pill } from "../../_components/v2/kit";
import { DayPicker, PickChip } from "../../_components/v2/period-picker";
import { SpaceHeader } from "../../_components/v2/space";
import { dateWords, dayWords, timeWords } from "../../_lib/days";
import { PrintRegister, RegisterColumns } from "../../register/_components/register-forms";

const R = LAB3_REGISTER;
const C = LABWS2_REPORTS.register;
const cellCls = "border border-black px-1 py-0.5 align-top";

/**
 * Reports → Daily register (prompt 5.9): the old /lab/register re-laid in the place. One section, one day, A4
 * landscape, black on white; the print event is written before the print dialog opens (DR-4); the lead edits and
 * signs the columns. Section, day and register apply at once (no Show button).
 */
export async function RegisterView({
  scope,
  lead,
  sp,
  tabs,
}: {
  scope: LabTechScope;
  lead: boolean;
  sp: { section?: string; day?: string; register?: string };
  tabs: ReactNode;
}) {
  const now = new Date();
  const sections = await loadLabSections(scope.hospitalId);
  const section = sections.find((s) => s.id === sp.section) ?? sections[0];
  const today = dayOf(now, DEFAULT_TIME_ZONE);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") && sp.day! <= today ? sp.day! : today;
  const access = classAccessFor(scope.access.permissions);
  const offered: RegisterKind[] = ["general", ...access];
  const register = (offered.find((r) => r === sp.register) ?? "general") as RegisterKind;
  const { raw, cfg } = await db.transaction(async (t) => ({
    raw: section
      ? await loadRegisterDay(t as never, scope.hospitalId, { sectionId: section.id, day })
      : [],
    cfg: await registerConfigFor(t as never, scope.hospitalId, register, now),
  }));
  const ids = await identitiesFor(
    scope,
    raw
      .filter((l) => (register === "general" ? !l.restrictedClass : l.restrictedClass === register))
      .map((l) => l.patientUserId),
    "lab_register",
  );
  const out = section
    ? dailyRegister({
        hospitalId: scope.hospitalId,
        sectionId: section.id,
        day,
        timeZone: DEFAULT_TIME_ZONE,
        register:
          register === "general"
            ? { kind: "general" }
            : { kind: "class", restrictedClass: register },
        classAccess: access,
        config: cfg.config,
        lines: withIdentities(raw, ids),
      })
    : null;
  const title =
    register === "general"
      ? fill(R.printTitle, { section: section?.name ?? "" })
      : register === "hiv"
        ? fill(R.hivTitle, { section: section?.name ?? "" })
        : fill(R.classTitle, { class: R.registers[register], section: section?.name ?? "" });
  const note = (n: string) => (n.startsWith("entered ") ? `entered ${dayWords(n.slice(8))}` : n);
  const keep = { tab: "register", section: section?.id, day, register };

  return (
    <>
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } body { background: white !important; } aside, header, nav, [data-print-hide] { display: none !important; } }`}</style>
      <SpaceHeader
        tabs={tabs}
        chips={
          <>
            <PickChip
              base="/lab/reports"
              keep={keep}
              param="section"
              name={C.section}
              value={section?.id ?? null}
              all={false}
              options={sections.map((s) => ({ value: s.id, label: s.name }))}
            />
            <DayPicker
              base="/lab/reports"
              keep={keep}
              param="day"
              label={C.day}
              value={day}
              now={now.toISOString()}
            />
            <PickChip
              base="/lab/reports"
              keep={keep}
              param="register"
              name={C.register}
              value={register}
              all={false}
              options={offered.map((r) => ({ value: r, label: R.registers[r] }))}
            />
          </>
        }
      />
      <div data-print-hide className="mb-4 flex flex-col gap-3 print:hidden">
        <p className="text-body-s text-muted-foreground">{R.lede}</p>
        {access.length === 0 ? <p className="text-body-s">{R.noAccess}</p> : null}
        <div className="flex flex-wrap items-start gap-3">
          {section && out?.ok ? (
            <PrintRegister
              register={register}
              sectionId={section.id}
              day={day}
              rows={out.rows.length}
            />
          ) : null}
          {lead ? (
            <RegisterColumns
              register={register}
              choices={columnChoices(register)}
              current={cfg.draft?.payload ?? cfg.config}
              draft={
                cfg.draft
                  ? { id: cfg.draft.id, authoredByMe: cfg.draft.authoredBy === scope.userId }
                  : null
              }
            />
          ) : null}
        </div>
        {!cfg.signed ? <p className="text-body-s text-muted-foreground">{R.defaultsNote}</p> : null}
        {cfg.draft ? <Pill tone="caution">{R.draftWaiting}</Pill> : null}
      </div>

      <article className="shadow-tide-card rounded-tide-card flex flex-col gap-2 bg-white p-4 text-[12px] leading-snug text-black print:rounded-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b-2 border-black pb-2">
          <p className="text-[16px] font-semibold">{title}</p>
          <p className="text-right">
            {scope.hospitalName} · {dayWords(day)}
          </p>
        </div>
        {!out || !out.ok || out.rows.length === 0 ? (
          <p>{out && !out.ok ? R.noAccess : R.none}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {out.columns.map((c) => (
                  <th key={c} scope="col" className={`${cellCls} text-left font-semibold`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {out.rows.map((r, i) => (
                <tr key={`${r.labNumber}-${i}`} className="break-inside-avoid">
                  {r.cells.map((c, j) => (
                    <td key={j} className={cellCls}>
                      {c}
                      {j === r.cells.length - 1 && r.notes.length ? (
                        <span className="block italic">{r.notes.map(note).join(" · ")}</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <footer className="flex flex-col gap-1 border-t border-black pt-2">
          <p>{fill(LAB3.registerFooter, { time: `${dateWords(now)} ${timeWords(now)}` })}</p>
          {register === "general" ? <p>{LAB3.registerHiv}</p> : null}
          <p>{R.checkedBy}</p>
        </footer>
      </article>
    </>
  );
}
