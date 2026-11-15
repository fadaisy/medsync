"use client";

/** History, publish and restore (P3, P9, P10, CS9): drafts with undo, the scheduled job, published versions. */
import type { When } from "./port";
import type { Ctx } from "./shared";
import type { CsUser, Job } from "@/lib/clinics-schedule/fixture";
import type { Change } from "@/lib/clinics-schedule/model";
import { useState } from "react";

import { CS, CS_ERRORS } from "@/content/clinics-schedule/copy";
import { fill } from "@/content/lab-workspace-v2";
import { impactOf, publishBlockers, restoreEdits } from "@/lib/clinics-schedule/model";
import { dateTxt, DeskDialog, hm, k, Seg, ugx } from "./shared";

export const whenTxt = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso)) return iso;
  const t = new Date(iso);
  return `${dateTxt(iso.slice(0, 10))} ${hm(t.getHours() * 60 + t.getMinutes())}`;
};
const who = (ctx: Ctx, id: string) =>
  ctx.d.names[id] ?? ctx.d.users.find((u) => u.id === id)?.name ?? id;
const nChanges = (n: number) => (n === 1 ? CS.history.changes1 : fill(CS.history.changesN, { n }));

/** One draft row: what, by whom, and who already booked it touches; undo takes every later draft with it. */
function DraftRow({
  ctx,
  ch,
  i,
  undo,
  by = true,
}: {
  ctx: Ctx;
  ch: Change;
  i: number;
  undo: (id: string) => void;
  by?: boolean;
}) {
  const after = ctx.drafts.length - i - 1;
  const im = impactOf(ctx.view, ch, ctx.d.booked, ctx.d.unitCost ?? 0);
  const label =
    after === 0
      ? CS.history.undo
      : after === 1
        ? CS.history.undoWith1
        : fill(CS.history.undoWith, { n: after });
  return (
    <div className={k("su-pi")}>
      <i aria-hidden="true" />
      <span>
        <b>{ch.summary}</b>
        <small>
          {by ? `${fill(CS.publish.by, { who: who(ctx, ch.author) })} ` : null}
          {im.booked ? fill(CS.publish.impact, { n: im.booked, t: im.texts }) : CS.publish.noImpact}
        </small>
      </span>
      <button type="button" className={k("btn", "sm", "q")} onClick={() => undo(ch.id)}>
        {label}
      </button>
    </div>
  );
}

export function HistoryView({ ctx, undo }: { ctx: Ctx; undo: (id: string) => void }) {
  const { d } = ctx;
  const job = d.job;
  const versions = [...d.versions].sort((a, b) => b.number - a.number);
  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{CS.history.title}</h1>
            <span className={k("adate")}>{CS.history.sub}</span>
          </div>
        </div>

        <div className={k("su-card", "su-hx")}>
          <div className={k("su-ch")}>
            <b>{CS.history.drafts}</b>
            <small>{CS.history.draftsH}</small>
            <span className={k("grow")} />
            {ctx.drafts.length ? (
              <button
                type="button"
                className={k("btn", "sm", "k")}
                onClick={() => ctx.modal({ k: "publish" })}
              >
                {CS.history.review}
              </button>
            ) : null}
          </div>
          {ctx.drafts.map((ch, i) => (
            <DraftRow key={ch.id} ctx={ctx} ch={ch} i={i} undo={undo} />
          ))}
          {!ctx.drafts.length ? <p className={k("su-none")}>{CS.history.noDrafts}</p> : null}
        </div>

        {job ? (
          <div className={k("su-card", "su-hxi", "su-hxs")}>
            <div className={k("su-hxh")}>
              <span className={k("su-cn")}>
                <b>
                  {fill(CS.history.sched, {
                    when: CS.publish.when[job.runAt as When] ?? whenTxt(job.runAt),
                  })}
                </b>
                <small>
                  {fill(CS.history.schedLine, { n: job.changes.length, who: who(ctx, job.by) })}
                </small>
              </span>
              <span className={k("grow")} />
              <button
                type="button"
                className={k("btn", "sm")}
                onClick={() => ctx.modal({ k: "sched" })}
              >
                {CS.history.see}
              </button>
            </div>
          </div>
        ) : null}

        <div className={k("su-hxl")}>
          {versions.map((v, i) => (
            <div key={v.number} className={k("su-card", "su-hxi")}>
              <div className={k("su-hxh")}>
                <span className={k("su-hxd")} aria-hidden="true" />
                <span className={k("su-cn")}>
                  <b>{fill(CS.history.published, { when: whenTxt(v.at) })}</b>
                  <small>
                    {fill(CS.history.pubLine, {
                      who: who(ctx, v.by),
                      n: nChanges(v.changes.length),
                      tx: v.textsSent
                        ? fill(CS.history.texts, { n: v.textsSent })
                        : CS.history.noTexts,
                    })}
                  </small>
                </span>
                <span className={k("grow")} />
                {i > 0 ? (
                  <button
                    type="button"
                    className={k("btn", "sm")}
                    onClick={() => ctx.modal({ k: "restore", n: v.number })}
                  >
                    {CS.history.restore}
                  </button>
                ) : null}
              </div>
              <ul className={k("su-hxu")}>
                {v.changes.slice(0, 4).map((ch) => (
                  <li key={ch.id}>{ch.summary}</li>
                ))}
                {v.changes.length > 4 ? (
                  <li className={k("more")}>
                    {fill(CS.history.more, { n: v.changes.length - 4 })}
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
          {!versions.length ? <p className={k("su-none")}>{CS.history.none}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function PublishDialog({
  ctx,
  close,
  publish,
  undo,
  user,
}: {
  ctx: Ctx;
  close: () => void;
  publish: (when: When) => Promise<void> | void;
  undo: (id: string) => void;
  user: CsUser;
}) {
  const { view, d } = ctx;
  const [when, setWhen] = useState<When>("now");
  const [busy, setBusy] = useState(false);
  const list = ctx.drafts;
  const tx = list.reduce((n, ch) => n + impactOf(view, ch, d.booked, d.unitCost ?? 0).texts, 0);
  const devs = Object.values(view.devices);
  const blockers = publishBlockers(ctx.published, view, ctx.deptLive);
  const fourEyes = list.some(
    (c) => c.author === user.id && c.edits.some((e) => e.entity === "bands"),
  );
  const canDraftOnly = user.can !== "publish";
  const moves = list.some((c) => c.edits.some((e) => e.entity === "sessions" && e.before));
  const name = (id: string | undefined) => view.clinics[id ?? ""]?.name ?? "";
  const go = async () => {
    setBusy(true);
    await publish(when);
    setBusy(false);
  };
  const label =
    when === "now"
      ? list.length === 1
        ? CS.publish.go1
        : fill(CS.publish.go, { n: list.length })
      : fill(CS.publish.sched, { when: CS.publish.when[when] });

  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.publish.title}
      tile="tick"
      title={CS.publish.title}
      lead={CS.publish.sub}
      cls={k("su-m", "md")}
    >
      {!list.length ? (
        <div className={k("empty")}>
          <b>{CS.publish.nothing}</b>
          <span>{CS.publish.nothingSub}</span>
        </div>
      ) : (
        <>
          <div className={k("su-pst")}>
            <div>
              <b>{list.length}</b>
              <span>{CS.publish.stats.changes}</span>
            </div>
            <div>
              <b>{tx}</b>
              <span>{CS.publish.stats.texts}</span>
            </div>
            <div>
              <b>{d.unitCost != null ? ugx(tx * d.unitCost) : "—"}</b>
              <span>
                {d.unitCost != null
                  ? fill(CS.publish.stats.cost, { rate: ugx(d.unitCost) })
                  : CS.publish.stats.noRate}
              </span>
            </div>
            <div>
              <b>{devs.length}</b>
              <span>
                {fill(CS.publish.updates, {
                  d: devs.filter((v) => v.kind === "desk").length,
                  s: devs.filter((v) => v.kind === "screen").length,
                })}
              </span>
            </div>
          </div>
          <div className={k("su-pub")}>
            {list.map((ch, i) => (
              <DraftRow key={ch.id} ctx={ctx} ch={ch} i={i} undo={undo} />
            ))}
          </div>
          {blockers.length || fourEyes ? (
            <div className={k("su-sec")}>
              <span className={k("cap")}>{CS.publish.blockers}</span>
              {blockers.map((b) => (
                <div key={`${b.kind}:${b.clinicIds.join()}`} className={k("su-warn")}>
                  <span>
                    {b.kind === "clash"
                      ? fill(CS.publish.clashB, {
                          a: name(b.clinicIds[0]),
                          b: name(b.clinicIds[1]),
                        })
                      : fill(CS.publish.readyB, {
                          name: name(b.clinicIds[0]),
                          why: ctx
                            .rd(b.clinicIds[0] ?? "")
                            .blockers.map((x) => CS.ready.why[x.k])
                            .join(", "),
                        })}
                  </span>
                  <button
                    type="button"
                    className={k("btn", "sm")}
                    onClick={() => {
                      close();
                      if (b.kind === "clash") ctx.go("week");
                      else ctx.go("clinics", b.clinicIds[0] ?? null);
                    }}
                  >
                    {b.kind === "clash" ? CS.publish.clashFix : CS.publish.readyFix}
                  </button>
                </div>
              ))}
              {fourEyes ? (
                <div className={k("su-warn")}>
                  <span>{CS_ERRORS.fourEyes}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className={k("su-sec")}>
            <span className={k("cap")}>{CS.publish.whenCap}</span>
            <Seg
              opts={(["now", "tonight", "tomorrow"] as When[]).map(
                (w) => [w, CS.publish.when[w]] as const,
              )}
              value={when}
              onPick={setWhen}
              label={CS.publish.whenCap}
            />
            <p className={k("su-note")}>
              {when === "now" ? CS.publish.whenNow : CS.publish.whenLater}
            </p>
            {when === "now" && moves && tx ? (
              <p className={k("su-note")}>{CS.publish.moveHint}</p>
            ) : null}
          </div>
        </>
      )}
      <div className={k("mf")}>
        {list.length ? (
          <button
            type="button"
            className={k("btn", "k")}
            onClick={() => void go()}
            disabled={busy || ctx.offline || canDraftOnly || fourEyes || blockers.length > 0}
            title={ctx.offline ? CS_ERRORS.offline : canDraftOnly ? CS.user.can.draft : undefined}
          >
            {label}
          </button>
        ) : null}
        <button type="button" className={k("btn")} onClick={close}>
          {CS.publish.keep}
        </button>
      </div>
    </DeskDialog>
  );
}

export function SchedDialog({
  job,
  when,
  close,
  now,
  cancel,
}: {
  job: Job | null;
  when: string;
  close: () => void;
  now: () => void;
  cancel: () => void;
}) {
  if (!job) return null;
  return (
    <DeskDialog
      open
      onClose={close}
      label={fill(CS.publish.schedT, { when })}
      tile="clock"
      title={fill(CS.publish.schedT, { when })}
      lead={CS.publish.schedSub}
      cls={k("su-m")}
    >
      <div className={k("su-pub")}>
        {job.changes.map((ch) => (
          <div key={ch.id} className={k("su-pi")}>
            <i aria-hidden="true" />
            <span>
              <b>{ch.summary}</b>
            </span>
          </div>
        ))}
      </div>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} onClick={now}>
          {CS.publish.early}
        </button>
        <button type="button" className={k("btn")} onClick={cancel}>
          {CS.publish.cancelS}
        </button>
      </div>
    </DeskDialog>
  );
}

export function RestoreDialog({ ctx, n, close }: { ctx: Ctx; n: number; close: () => void }) {
  const v = ctx.d.versions.find((x) => x.number === n);
  if (!v) return null;
  const later = ctx.d.versions
    .filter((x) => x.number > n)
    .sort((a, b) => a.number - b.number)
    .flatMap((x) => x.changes);
  const go = () => {
    ctx.commit(
      fill(CS.history.restoreSum, { n }),
      restoreEdits(ctx.view, later),
      fill(CS.history.restored, { n }),
    );
    close();
  };
  const t = fill(CS.history.restoreT, { when: whenTxt(v.at), who: who(ctx, v.by) });
  return (
    <DeskDialog
      open
      onClose={close}
      label={t}
      tile="swap"
      title={t}
      lead={CS.history.restoreSub}
      cls={k("su-m")}
    >
      <ul className={k("su-hxu")}>
        {later.slice(0, 6).map((ch) => (
          <li key={ch.id}>{ch.summary}</li>
        ))}
        {later.length > 6 ? (
          <li className={k("more")}>{fill(CS.history.more, { n: later.length - 6 })}</li>
        ) : null}
      </ul>
      <div className={k("mf")}>
        <button type="button" className={k("btn", "k")} onClick={go}>
          {CS.history.restoreGo}
        </button>
        <button type="button" className={k("btn")} onClick={close}>
          {CS.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
