import type { RegisterKind } from "@/lib/lab/register-store";
import type { Metadata } from "next";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LAB } from "@/content/lab";
import { fill, LAB3, LAB3_REGISTER } from "@/content/lab-phase-3";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { labHmisLiveFor } from "@/lib/lab/feature";
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
import { DateField } from "../_components/v2/fields";
import { dateWords, dayWords, timeWords } from "../_lib/days";
import { redirectIfV2 } from "../_lib/v2-redirect";
import { requireQualityScope } from "../quality/_lib/scope";
import { PrintRegister, RegisterColumns } from "./_components/register-forms";

export const metadata: Metadata = { title: "Daily register · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const R = LAB3_REGISTER;
const cellCls = "border border-black px-1 py-0.5 align-top";
const field =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";

/**
 * The daily register (Lab Phase 3 §5.12, artboard 12; DR-1..DR-5; labHmis): one section, one day, A4 landscape,
 * black on white. The general register never prints a restricted class; the HIV and other class registers print
 * only for staff who release results (GATE A §4). Each print writes a print event first (DR-4).
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; day?: string; register?: string }>;
}) {
  await redirectIfV2("/lab/reports?tab=register", searchParams);
  const { scope, lead } = await requireQualityScope(labHmisLiveFor);
  const now = new Date();
  const sp = await searchParams;
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

  return (
    <div className="mx-auto flex w-full max-w-[297mm] flex-col gap-5 px-4 py-6 sm:px-6 print:max-w-none print:p-0">
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } body { background: white !important; } aside, header, nav, [data-print-hide] { display: none !important; } }`}</style>
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title={R.title} />
      <div data-print-hide className="flex flex-col gap-3">
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{R.lede}</p>
        <form action="/lab/register" className="flex flex-wrap items-end gap-3">
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">Section</span>
            <select name="section" defaultValue={section?.id} className={field}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <DateField
            label={LABWS2_REPORTS.register.day}
            name="day"
            defaultValue={day}
            now={now.toISOString()}
          />
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">Register</span>
            <select name="register" defaultValue={register} className={field}>
              {offered.map((r) => (
                <option key={r} value={r}>
                  {R.registers[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Show
          </button>
        </form>
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
        {cfg.draft ? <StatusWord tone="caution">{R.draftWaiting}</StatusWord> : null}
      </div>

      <article className="flex flex-col gap-2 bg-white p-4 text-[12px] leading-snug text-black print:p-0">
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
    </div>
  );
}
