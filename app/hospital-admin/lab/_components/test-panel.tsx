"use client";

import type { MenuRow } from "../_lib/model";
import type { Act, Prices } from "./shared";
import type { Hours, MenuOffering, SectionKey } from "@/lib/lab/test-menu";
import type { TestMenuData } from "@/lib/lab/test-menu-read";
import { useState } from "react";

import { Field, k, Seg, Toggle } from "@/components/clinics-schedule/shared";
import { rowItem } from "@/components/lab/test-menu/test-menu";
import { newKey } from "@/components/lab/test-menu/use-menu-action";
import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import { parseUgx } from "@/lib/lab/prices";
import { minutesWords, sectionName, SECTIONS } from "@/lib/lab/test-menu";
import { saveOfferingsAction, saveTestPriceAction } from "@/lib/lab/test-menu-actions";
import v from "./lab.module.css";
import { chargeWords } from "./shared";

/**
 * One test's detail (the prototype's panel, board 16): where it is done, its hours, the lab it goes to, the stated
 * turnaround and its section, then what the signed catalogue fixes. Changes are a draft until Save; a test taken
 * off the menu says what that does first. Results, units and ranges are never set here.
 */
export function TestPanel({
  row,
  data,
  act,
  prices,
  onClose,
}: {
  row: MenuRow;
  data: TestMenuData;
  act: Act;
  prices: Prices;
  onClose: () => void;
}) {
  const D = LAB_ADMIN.detail;
  const { t } = row;
  const [o, setO] = useState<MenuOffering>(row.o);
  const set = (p: Partial<MenuOffering>) => setO((x) => ({ ...x, ...p }));
  const name = t.masked ? C.restrictedTest : t.display;
  const profiles = data.profiles.filter((p) => p.testCodes.includes(t.code));
  const removing = o.where === "not_offered" && row.o.where !== "not_offered";
  const changed = JSON.stringify(o) !== JSON.stringify(row.o);
  const save = () =>
    act.run(
      () =>
        saveOfferingsAction({ surface: data.surface, clientKey: newKey(), items: [rowItem(o)] }),
      C.saved,
      removing ? onClose : undefined,
    );

  return (
    <aside className={k("det", "su-det")} aria-label={D.label}>
      <div className={k("su-dh")}>
        <div>
          <h2>{name}</h2>
          <p>{[sectionName(row.section), t.specimen, t.tube].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" className={k("btn", "sm", "q", "x")} onClick={onClose}>
          {D.close}
        </button>
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{D.where}</span>
        <Seg
          opts={(["in_house", "referred", "not_offered"] as const).map(
            (w) => [w, C.where[w]] as const,
          )}
          value={o.where}
          onPick={(w) => set({ where: w })}
          label={D.where}
          className={v.wrapSeg}
          tour="wt-lab-where"
        />
        {o.where === "in_house" ? (
          <>
            <span className={k("cap")}>{D.hours}</span>
            <Seg
              opts={[
                ["24h", C.hours["24h"]],
                ["scheduled", C.hours.scheduled],
                ["none", C.hours.none],
              ]}
              value={o.hours ?? "none"}
              onPick={(h) =>
                set({
                  hours: (h === "none" ? null : h) as Hours,
                  hoursNote: h === "scheduled" ? (o.hoursNote ?? "") : null,
                })
              }
              label={D.hours}
              className={v.wrapSeg}
            />
            {o.hours === "scheduled" ? (
              <Field as="label" label={C.hoursNote}>
                <input
                  className={k("in")}
                  maxLength={60}
                  value={o.hoursNote ?? ""}
                  onChange={(e) => set({ hoursNote: e.target.value })}
                />
              </Field>
            ) : null}
          </>
        ) : null}
        {o.where !== "not_offered" ? (
          <Field
            as="label"
            label={o.where === "referred" ? C.referredToLabel : C.downRefer}
            tour="wt-lab-labs"
          >
            <input
              className={k("in")}
              maxLength={120}
              value={o.referredTo ?? ""}
              onChange={(e) => set({ referredTo: e.target.value || null })}
            />
          </Field>
        ) : null}
      </div>

      {o.where !== "not_offered" ? (
        <div className={k("su-sec")} data-tour="wt-lab-tat">
          <span className={k("cap")}>{D.tat}</span>
          <Field
            as="label"
            label={C.turnaroundMinutes}
            hint={minutesWords(o.statedTurnaroundMinutes) ?? C.notSet}
          >
            <input
              className={k("in")}
              inputMode="numeric"
              value={o.statedTurnaroundMinutes ?? ""}
              onChange={(e) => {
                const x = e.target.value.replace(/\D/g, "").slice(0, 6);
                set({ statedTurnaroundMinutes: x ? Number(x) : null });
              }}
            />
          </Field>
          <p className={k("su-note")}>{D.tatHelp}</p>
        </div>
      ) : null}

      {prices && row.o.where !== "not_offered" ? (
        <PriceSection row={row} data={data} act={act} prices={prices} />
      ) : null}

      <div className={k("su-sec")}>
        <Field as="label" label={C.sectionLabel}>
          <select
            className={k("in")}
            value={o.sectionOverride ?? t.section ?? ""}
            onChange={(e) => set({ sectionOverride: e.target.value as SectionKey })}
          >
            {SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key === t.section ? C.recommendedMark(s.display) : s.display}
              </option>
            ))}
          </select>
        </Field>
        <p className={k("su-note")}>{C.sectionHelp}</p>
      </div>

      <div className={k("su-sec")}>
        {removing ? <p className={k("su-note")}>{C.removeConsequence(profiles.length)}</p> : null}
        <div className={v.row}>
          <button
            type="button"
            className={k("btn", "sm", "k")}
            disabled={!changed || act.pending}
            onClick={save}
          >
            {removing ? D.remove : D.save}
          </button>
        </div>
      </div>

      {t.components.length ? (
        <div className={k("su-sec")}>
          <span className={k("cap")}>{D.reportedAs}</span>
          <div className={k("chips", "sm")}>
            {t.components.map((c) => (
              <span key={c.id} className={k("su-ctag")}>
                {c.display}
              </span>
            ))}
          </div>
          <p className={k("su-note")}>{D.reportedLine}</p>
        </div>
      ) : null}

      <div className={k("su-sec")}>
        <span className={k("cap")}>{D.catalogue}</span>
        <div className={k("su-sum2")}>
          <div>
            <span>{C.specimen}</span>
            <b>{[t.specimen, t.tube].filter(Boolean).join(" · ") || "—"}</b>
          </div>
          <div>
            <span>{C.orderCode}</span>
            <b>{t.orderLoinc ?? C.noOrderCode}</b>
          </div>
        </div>
        {t.levelBasis ? (
          <p className={k("su-note")}>
            {t.levelBasis.basis === "national_menu_2017"
              ? C.levelBasis(t.levelBasis.table, t.levelBasis.narrative)
              : C.judgement}
          </p>
        ) : null}
        {t.advisory ? <p className={k("su-note")}>{t.advisory}</p> : null}
      </div>

      <div className={k("su-sec")}>
        <span className={k("cap")}>{D.inProfiles}</span>
        <p className={k("su-note")}>
          {profiles.length ? profiles.map((p) => p.name).join(", ") : D.noProfiles}
        </p>
      </div>
    </aside>
  );
}

/**
 * The hospital's own price for this test (ADR 0527): above zero or free, from a day, never zero. A new price is a
 * new row; the old one stays on record. A laboratory visit costs the total of its tests.
 */
function PriceSection({
  row,
  data,
  act,
  prices,
}: {
  row: MenuRow;
  data: TestMenuData;
  act: Act;
  prices: NonNullable<Prices>;
}) {
  const P = LAB_ADMIN.price;
  const now = prices.charges[row.t.code];
  const [amount, setAmount] = useState(now?.kind === "priced" ? String(now.ugx) : "");
  const [free, setFree] = useState(now?.kind === "free");
  const [from, setFrom] = useState(prices.today);
  const ugx = parseUgx(amount);
  const same =
    from === prices.today &&
    (free ? now?.kind === "free" : now?.kind === "priced" && now.ugx === ugx);
  const ok = from >= prices.today && (free || ugx !== null) && !same;
  const save = () =>
    act.run(
      () =>
        saveTestPriceAction({
          surface: data.surface,
          clientKey: newKey(),
          code: row.t.code,
          priceUgx: free ? null : ugx,
          free,
          fromDate: from,
        }),
      P.saved,
    );
  return (
    <div className={k("su-sec")} data-tour="wt-lab-price">
      <span className={k("cap")}>{P.cap}</span>
      <p className={k("su-note")}>
        {chargeWords(now) ? P.now.replace("{price}", chargeWords(now)!) : P.notSet}
      </p>
      <Toggle on={free} flip={() => setFree(!free)} t={P.isFree} />
      {free ? null : (
        <Field as="label" label={P.amount} hint={P.amountHint}>
          <input
            className={k("in")}
            inputMode="numeric"
            value={amount}
            maxLength={12}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d,\s]/g, ""))}
          />
        </Field>
      )}
      <Field as="label" label={P.from} hint={P.fromHint}>
        <input
          className={k("in")}
          type="date"
          min={prices.today}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </Field>
      {!free && amount.trim() && ugx === null ? <p className={k("su-note")}>{P.bad}</p> : null}
      <div className={v.row}>
        <button
          type="button"
          className={k("btn", "sm", "k")}
          disabled={!ok || act.pending}
          onClick={save}
        >
          {P.save}
        </button>
      </div>
      <p className={k("su-note")}>{P.help}</p>
    </div>
  );
}
