"use client";

/** Preview as a patient (S13, CS7, CS8): the booking card, the ticket and the text, from the draft view. */
import type { Ctx } from "./shared";

import { CS } from "@/content/clinics-schedule/copy";
import { fill } from "@/content/lab-workspace-v2";
import { bookableOf, cardIdentity, sessionsOf } from "@/lib/clinics-schedule/model";
import { composeReceiptSms } from "@/lib/notifications/receipt";
import {
  dateTxt,
  dayName,
  DeskDialog,
  feeTxt,
  hm,
  k,
  nextOn,
  Pav,
  placeName,
  sesTime,
} from "./shared";

export function PreviewDialog({ ctx, id, close }: { ctx: Ctx; id: string; close: () => void }) {
  const { view, d } = ctx;
  const c = view.clinics[id];
  if (!c) return null;
  const list = sessionsOf(view, id);
  const next = list
    .map((s) => ({ s, date: nextOn(d.today, s.weekday) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.s.start - b.s.start)[0];
  const doc = next ? view.people[next.s.personIds[0] ?? ""] : undefined;
  const ident = cardIdentity(doc);
  const docName = ident.name ?? (doc ? fill(CS.people.panel.cadreCard, { cadre: doc.cadre }) : "");
  const fee = feeTxt(c, view).t;
  const left = next ? Math.max(0, bookableOf(next.s) - (d.booked[next.s.id] ?? 0)) : 0;
  const where = next ? placeName(view, next.s.roomIds[0]) || placeName(view, c.blockId) : "";
  const office =
    c.tier !== "general" && doc?.officeId
      ? fill(CS.people.panel.findAt, { office: placeName(view, doc.officeId) })
      : null;
  const date = next ? dateTxt(next.date) : "";
  const at = next
    ? next.s.kind === "day"
      ? fill(CS.preview.arrive, { s: hm(next.s.start), e: hm(next.s.end) })
      : fill(CS.preview.at, { t: hm(next.s.start) })
    : "";
  const sms = next
    ? composeReceiptSms({
        hospitalName: d.hospitalName,
        serviceName: c.confidential ? CS.preview.confName : c.name,
        startsAtIso: `${next.date}T${hm(next.s.start)}:00+03:00`,
        bookingCode: CS.preview.sampleCode,
      })
    : "";
  const parts = Math.max(1, Math.ceil(sms.length / 160));

  return (
    <DeskDialog
      open
      onClose={close}
      label={fill(CS.preview.title, { name: c.name })}
      tile="eye"
      title={fill(CS.preview.title, { name: c.name })}
      lead={CS.preview.sub}
      cls={k("su-m", "md")}
    >
      {!next ? (
        <div className={k("empty")}>
          <b>{CS.preview.noSes}</b>
          <span>{CS.preview.noSesSub}</span>
        </div>
      ) : (
        <div className={k("su-pv3")}>
          <div className={k("su-pvc")}>
            <span className={k("cap")}>{CS.preview.card}</span>
            <div className={k("su-ph")}>
              <div className={k("su-bc")}>
                <div className={k("su-bch")}>
                  <i style={{ background: c.colour }} aria-hidden="true" />
                  <b>{c.name}</b>
                  {c.tier !== "general" ? (
                    <em className={k("su-tag")}>{CS.clinics.tiers[c.tier]}</em>
                  ) : null}
                </div>
                <div className={k("su-bcd")}>
                  <Pav p={ident.name ? doc : undefined} />
                  <span>
                    <b>{docName}</b>
                    {doc ? (
                      <small>
                        {ident.name ? doc.role : fill(CS.preview.cadreNote, { cadre: doc.cadre })}
                      </small>
                    ) : null}
                  </span>
                </div>
                <div className={k("su-bcs")}>
                  {list.map((s) => (
                    <span key={s.id}>
                      {dayName(s.weekday)} {sesTime(s)}
                    </span>
                  ))}
                </div>
                <div className={k("su-bcn")}>
                  <span>
                    <small>{CS.preview.next}</small>
                    <b>{date}</b>
                  </span>
                  <span>
                    <small>{CS.preview.fee}</small>
                    <b>{fee}</b>
                  </span>
                </div>
                <span className={k("su-bcb")}>{fill(CS.preview.book, { n: left })}</span>
              </div>
            </div>
          </div>
          <div className={k("su-pvc")}>
            <span className={k("cap")}>{CS.preview.ticket}</span>
            <div className={k("su-ph")}>
              <div className={k("su-tk")}>
                <small>{CS.preview.code}</small>
                <b className="mono">{CS.preview.sampleCode.replace(/(...)(...)/, "$1 $2")}</b>
                <span className={k("su-tkl")}>{c.name}</span>
                <span>
                  {date} · {at}
                </span>
                {where ? <span>{where}</span> : null}
                {office ? <span>{office}</span> : null}
                <span>
                  {docName} · {fee}
                </span>
                <small className={k("su-tkf")}>{CS.preview.payLine}</small>
              </div>
            </div>
          </div>
          <div className={k("su-pvc")}>
            <span className={k("cap")}>{CS.preview.sms}</span>
            <div className={k("su-ph", "su-phs")}>
              <div className={k("su-sms")}>
                <small>{CS.preview.smsFrom}</small>
                <p>{sms}</p>
              </div>
              <small className={k("su-smsn", parts > 1 && "warn")}>
                {fill(parts === 1 ? CS.preview.chars : CS.preview.charsN, {
                  n: sms.length,
                  p: parts,
                })}
              </small>
              {parts > 1 ? <small className={k("su-smsn", "warn")}>{CS.preview.over}</small> : null}
              {c.confidential ? (
                <small className={k("su-smsn")}>{CS.preview.confidential}</small>
              ) : null}
            </div>
          </div>
        </div>
      )}
      <div className={k("mf")}>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.done}
        </button>
      </div>
    </DeskDialog>
  );
}
