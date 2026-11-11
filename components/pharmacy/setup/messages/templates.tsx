"use client";

import type { SectionProps } from "./index";
import type { SmsTemplate } from "@/content/pharmacy-setup";
import type { TemplateRow } from "@/lib/pharmacy/setup/types";
import Link from "next/link";
import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  markLugandaCheckedAction,
  sendTestAction,
  toggleTemplateAction,
  updateTemplateAction,
} from "@/app/pharmacy/setup/setup-actions";
import { pillBtn } from "@/components/pharmacy/medicines/shared";
import { Chip, inputCls, labelCls } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { Panel } from "@/components/tide/work/kit";
import { HOLES, SMS_SAMPLE, SMS_TEMPLATES } from "@/content/pharmacy-setup";
import { MSG } from "@/content/pharmacy-setup-messages";
import {
  fillSample,
  isQuiet,
  normalisePhoneUG,
  smsParts,
  templateWarnings,
} from "@/lib/pharmacy/derive/setup/messages";
import { cn } from "@/lib/utils";

const M = MSG.templates;
type Aud = keyof typeof M.aud;
type Lang = "en" | "lg";
const tabCls = (on: boolean) =>
  cn(
    "h-[30px] rounded-[8px] px-3 text-[12px] font-semibold outline-none focus-visible:shadow-focus transition-colors duration-150",
    on ? "bg-card text-foreground shadow-tide-card" : "text-ink-600 bg-transparent",
  );

/** §D3: audience chips, then each template's row: switch, name and timing, languages, count, Edit. */
export function Templates(props: SectionProps & { testTo: string }) {
  const [aud, setAud] = useState<Aud>("all");
  const [open, setOpen] = useState<string>("");
  const groups = (["patients", "staff"] as const).filter((g) => aud === "all" || aud === g);
  return (
    <Panel
      title={M.title}
      action={
        <div role="group" aria-label={M.audience} className="flex flex-wrap gap-1.5">
          {(Object.keys(M.aud) as Aud[]).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={aud === a}
              onClick={() => setAud(a)}
              className={pillBtn(aud === a)}
            >
              {M.aud[a]}
            </button>
          ))}
        </div>
      }
    >
      {groups.map((g) => (
        <div key={g} className="flex flex-col">
          <h3 className="text-label text-ink-600 pb-1">{M.aud[g]}</h3>
          <ul className="divide-border flex flex-col divide-y">
            {SMS_TEMPLATES.filter((t) => t.audience === g).map((t) => {
              const row = props.view.templates.find((r) => r.key === t.key);
              return row ? (
                <Row
                  key={t.key}
                  {...props}
                  t={t}
                  row={row}
                  isOpen={open === t.key}
                  toggleOpen={() => setOpen(open === t.key ? "" : t.key)}
                />
              ) : null;
            })}
          </ul>
        </div>
      ))}
    </Panel>
  );
}

function Row({
  view,
  toast,
  run,
  pending,
  testTo,
  t,
  row,
  isOpen,
  toggleOpen,
}: SectionProps & {
  testTo: string;
  t: SmsTemplate;
  row: TemplateRow;
  isOpen: boolean;
  toggleOpen: () => void;
}) {
  const can = view.can.manage;
  const editable = can && t.audience === "patients";
  const toggle = () => {
    if (!row.on && !view.provider?.connected) return toast(MSG.connectFirst);
    void run(
      () => toggleTemplateAction({ key: t.key, on: !row.on }),
      () => M.toggled(t.name, !row.on),
    );
  };
  const lang = row.lg ? (
    row.lgCheckedAt ? (
      <Chip tone="blue" small>
        {M.luganda}
      </Chip>
    ) : (
      <Chip tone="amber" small>
        {M.lgNotChecked}
      </Chip>
    )
  ) : (
    <Chip tone="grey" small>
      {M.noLuganda}
    </Chip>
  );
  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <input
          type="checkbox"
          role="switch"
          aria-label={row.on ? M.turnOff(t.name) : M.turnOn(t.name)}
          checked={row.on}
          disabled={!can || pending}
          onChange={toggle}
          className="accent-primary size-5 shrink-0"
        />
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={toggleOpen}
          className="focus-visible:shadow-focus flex min-w-0 flex-1 basis-48 flex-col items-start rounded-[8px] text-left outline-none"
        >
          <span className="text-body-s font-semibold">{t.name}</span>
          <span className="text-caption text-muted-foreground">
            {M.when(row.on, t.timingLabel, row.timing)}
          </span>
        </button>
        <span className="flex flex-wrap items-center gap-1.5">
          <Chip tone="blue" small>
            {M.english}
          </Chip>
          {lang}
          <span className="text-caption text-muted-foreground px-1 tabular-nums">
            {M.sentMonth(row.sentThisMonth)}
          </span>
          <LabButton type="button" variant="text" size="sm" onClick={toggleOpen}>
            {isOpen ? M.close : editable ? M.edit : M.view}
          </LabButton>
        </span>
      </div>
      {isOpen ? (
        editable ? (
          <Editor
            view={view}
            toast={toast}
            run={run}
            pending={pending}
            testTo={testTo}
            t={t}
            row={row}
          />
        ) : (
          <div className="bg-tide-sunken rounded-tide-tile flex flex-col gap-2 p-3">
            <Preview view={view} t={t} row={row} lang="en" text={row.en} />
            {t.audience === "staff" ? (
              <p className="text-caption text-muted-foreground">
                {M.staffNote}{" "}
                <Link
                  href={M.staffHref}
                  className="text-primary font-semibold underline-offset-4 hover:underline"
                >
                  {M.staffLink}
                </Link>
                .
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </li>
  );
}

const sampleOf = (view: SectionProps["view"]) => ({
  ...SMS_SAMPLE,
  facility: view.provider?.facility || M.sampleFacility,
});

/** The SMS bubble with sample details, who it is from and when it goes. */
function Preview({
  view,
  t,
  row,
  lang,
  text,
}: {
  view: SectionProps["view"];
  t: SmsTemplate;
  row: TemplateRow;
  lang: Lang;
  text: string;
}) {
  const at =
    t.key === "staff_eve" ? M.sendEve(row.timing) : isQuiet(view.nowMin) ? M.sendQuiet : M.sendDay;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-caption text-muted-foreground font-medium">{M.preview}</span>
      <p className="bg-card shadow-tide-card max-w-[34ch] rounded-[16px] rounded-bl-[4px] px-3.5 py-2.5 text-[13px] leading-[18px] break-words">
        {text ? fillSample(text, sampleOf(view)) : lang === "lg" ? M.previewNoLg : M.previewEmpty}
      </p>
      <span className="text-caption text-muted-foreground">
        {M.from(view.provider?.senderId || M.defaultSender, at)}
      </span>
    </div>
  );
}

/** The inline editor (patient templates): timing, English | Luganda, holes, the count, warnings, preview. */
function Editor({
  view,
  toast,
  run,
  pending,
  testTo,
  t,
  row,
}: SectionProps & { testTo: string; t: SmsTemplate; row: TemplateRow }) {
  const [lang, setLang] = useState<Lang>("en");
  const [d, setD] = useState({ timing: row.timing, en: row.en, lg: row.lg ?? "" });
  const text = d[lang];
  const filled = fillSample(text, sampleOf(view));
  const pr = smsParts(filled);
  const cost = view.provider?.costUgx ?? 0;
  const warns = templateWarnings(text, filled, t.audience, lang);
  const lgSaved = lang === "lg" && !!row.lg;
  const lgUnchanged = d.lg === (row.lg ?? "");

  const save = () =>
    void run(
      () =>
        updateTemplateAction({
          key: t.key,
          timing: d.timing,
          // Empty: the default wording, so a later default change still reaches it.
          en: d.en.trim() === t.en ? "" : d.en,
          lg: d.lg,
        }),
      () => M.saved(t.name),
    );
  const test = () => {
    if (!view.provider?.connected) return toast(MSG.connectFirst);
    const to = normalisePhoneUG(testTo);
    if (!to) return toast(M.noTestNumber);
    void run(
      () => sendTestAction({ phone: testTo, body: filled || fillSample(d.en, sampleOf(view)) }),
      () => M.testedTo(to),
    );
  };

  return (
    <div className="bg-tide-sunken rounded-tide-tile grid min-w-0 gap-4 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div className="flex min-w-0 flex-col gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t.timingLabel}</span>
          <input
            value={d.timing}
            placeholder={t.timingHint}
            onChange={(e) => setD({ ...d, timing: e.target.value })}
            className={cn(inputCls, "max-w-xs")}
          />
        </label>
        <div
          role="tablist"
          aria-label={M.language}
          className="bg-ink-100 flex w-fit gap-1 rounded-[10px] p-1"
        >
          {(["en", "lg"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              onClick={() => setLang(l)}
              className={tabCls(lang === l)}
            >
              {l === "en" ? M.english : M.luganda}
            </button>
          ))}
        </div>
        <textarea
          rows={4}
          aria-label={M.textAria(t.name, lang === "lg")}
          value={text}
          placeholder={lang === "lg" ? M.textPhLg : M.textPh}
          onChange={(e) => setD({ ...d, [lang]: e.target.value })}
          className={cn(inputCls, "h-auto py-2 leading-5")}
        />
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-muted-foreground">{M.insert}</span>
          {HOLES[t.audience].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() =>
                setD({ ...d, [lang]: `${text ? text.replace(/\s*$/, " ") : ""}{${h}}` })
              }
              className="bg-card text-foreground hover:bg-ink-50 focus-visible:shadow-focus h-7 rounded-full px-2.5 font-mono text-[12px] shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none"
            >
              {`{${h}}`}
            </button>
          ))}
        </span>
        <span
          className={cn(
            "text-caption font-semibold",
            pr.parts > 2 ? "text-status-caution-fg-aa" : "text-muted-foreground",
          )}
        >
          {text ? M.count(filled.length, pr.parts, cost) : M.empty}
        </span>
        {lgSaved ? (
          lgUnchanged ? (
            <label className="text-body-s flex items-start gap-2">
              <input
                type="checkbox"
                checked={!!row.lgCheckedAt}
                disabled={!!row.lgCheckedAt || pending}
                onChange={() =>
                  void run(
                    () => markLugandaCheckedAction({ key: t.key }),
                    () => M.lgMarked,
                  )
                }
                className="accent-primary mt-0.5 size-4 shrink-0"
              />
              <span>{M.lgChecked}</span>
            </label>
          ) : (
            <p className="text-caption text-muted-foreground">{M.lgSaveFirst}</p>
          )
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <Preview view={view} t={t} row={row} lang={lang} text={text} />
        {warns.length ? (
          <ul className="bg-status-caution-bg text-status-caution-fg-aa rounded-tide-tile flex flex-col gap-1 px-3 py-2 text-[12.5px] leading-[17px] font-medium">
            {warns.map((w) => (
              <li key={w} className="flex gap-1.5">
                <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {M.warn(w, pr.parts)}
              </li>
            ))}
          </ul>
        ) : null}
        <span className="flex flex-wrap gap-2">
          <LabButton type="button" size="sm" onClick={test}>
            {M.testThis}
          </LabButton>
          <LabButton
            type="button"
            size="sm"
            variant="text"
            onClick={() => {
              setD({ ...d, en: t.en });
              toast(M.wasReset);
            }}
          >
            {M.reset}
          </LabButton>
        </span>
        <LabButton type="button" variant="primary" busy={pending} onClick={save} className="w-fit">
          {M.save}
        </LabButton>
      </div>
    </div>
  );
}
