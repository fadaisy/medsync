"use client";

/**
 * Clinics & schedule (ADRs 0501–0507): one workspace over the engine's records. Every edit is a draft `Change`;
 * admins see published + scheduled + drafts, patients see published until it is published (CS3). Seven views on
 * the shared Tether shell; pop-ups are centred dialogs (ADR 0161). Keys never fire while typing.
 */
import type { CsPort, When } from "./port";
import type { Ctx, Modal, View } from "./shared";
import type { CsData, CsUser, Job, Version } from "@/lib/clinics-schedule/fixture";
import type { Change, Edit } from "@/lib/clinics-schedule/model";
import type { AdminNavGroup } from "@/lib/hospital-admin/admin-nav";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { AdminHomeNav, AdminNavGroups } from "@/components/hospital-admin/admin-nav-groups";
import { GuideNavButton } from "@/components/hospital-admin/guide/guide-button";
import { DeskShell } from "@/components/reception/shell";
import { CS, CS_ERRORS } from "@/content/clinics-schedule/copy";
import { fill } from "@/content/lab-workspace-v2";
import {
  applyChanges,
  clashes,
  clashPairs,
  impactOf,
  publishBlockers,
  readiness,
  undoFrom,
} from "@/lib/clinics-schedule/model";
import { navTour } from "@/lib/hospital-admin/guide/keys";
import { GUIDE_NAV_EVENT } from "@/lib/hospital-admin/guide/route";
import { ClinicsView } from "./clinics";
import { ClosuresView, CxDialog } from "./closures";
import { DeviceDialog, DevicesView } from "./devices";
import { HistoryView, PublishDialog, RestoreDialog, SchedDialog } from "./history";
import { AddPersonDialog, PeopleView } from "./people";
import { localDrafts } from "./port";
import { PreviewDialog } from "./preview";
import {
  BandsDialog,
  OpenAllDialog,
  OpenDialog,
  PauseDialog,
  ReadyView,
  todoList,
  TplDialog,
} from "./ready";
import { SessionDialog } from "./session";
import { DeskDialog, Icon, VIEW_ICONS as ICONS, k, VIEWS } from "./shared";
import { BulkDialog, PrintDialog, WeekView } from "./week";

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
};

/** A clinic (and one of its tabs) from the URL, as the workspace's `sel` ("id#tab"). */
const selFrom = (clinic?: string | null, tab?: string | null) =>
  clinic ? (tab ? `${clinic}#${tab}` : clinic) : null;

const onlineSub = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function ClinicsWorkspace({
  data,
  port,
  forceOffline = false,
  initialView = "ready",
  initialClinic = null,
  initialTab = null,
  groups = [],
}: {
  data: CsData;
  port: CsPort;
  forceOffline?: boolean;
  initialView?: View;
  /** `?clinic=` and `?tab=`: open one clinic's panel on a tab (the guide's walkthroughs, ADR 0522). */
  initialClinic?: string | null;
  initialTab?: string | null;
  /** The admin menu's other groups (ADR 0520), the same as in the admin frame. */
  groups?: readonly AdminNavGroup[];
}) {
  const [published, setPublished] = useState(data.published);
  const [drafts, setDrafts] = useState<Change[]>(data.drafts);
  const [versions, setVersions] = useState<Version[]>(data.versions);
  const [job, setJob] = useState<Job | null>(data.job);
  const [user, setUser] = useState<CsUser>(data.user);
  const [view, setView] = useState<View>(initialView);
  const [sel, setSel] = useState<string | null>(selFrom(initialClinic, initialTab));
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [q, setQ] = useState("");
  const [rail, setRail] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);
  const online = useSyncExternalStore(
    onlineSub,
    () => navigator.onLine,
    () => true,
  );
  const offline = forceOffline || !online;

  // D-CS-15: drafts made offline live in the device's encrypted queue until saved.
  useEffect(() => {
    if (data.fixture) return;
    void localDrafts.read().then((saved) => {
      const fresh = saved.filter((c) => !data.drafts.some((d) => d.id === c.id));
      if (!fresh.length) return;
      setDrafts((d) => [...d, ...fresh]);
      if (navigator.onLine)
        void Promise.all(fresh.map((c) => port.saveChange(c))).then(() => localDrafts.write([]));
    });
  }, [data, port]);

  // The guide (ADR 0522) opens a view by URL; this desk keeps its view in state, so it follows the guide's link at
  // once. It only changes what is shown.
  useEffect(() => {
    const onGuide = (e: Event) => {
      const href = (e as CustomEvent<string>).detail;
      if (typeof href !== "string") return;
      const u = new URL(href, window.location.origin);
      if (u.pathname !== "/hospital-admin/clinics") return;
      const v = u.searchParams.get("view");
      setView((VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "ready");
      setSel(selFrom(u.searchParams.get("clinic"), u.searchParams.get("tab")));
      setModal(null);
      setDrawer(false);
    };
    window.addEventListener(GUIDE_NAV_EVENT, onGuide);
    return () => window.removeEventListener(GUIDE_NAV_EVENT, onGuide);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const queued = useMemo(() => [...(job?.changes ?? []), ...drafts], [job, drafts]);
  const snap = useMemo(() => applyChanges(published, queued), [published, queued]);
  const deptLive = (id: string) => data.departments[id]?.live ?? true;
  const rd = (id: string) => readiness(snap, id, deptLive);

  const say = (text: string, undo?: () => void) => setToast({ text, undo });

  const undo = (id: string) => {
    const { kept, removed } = undoFrom(drafts, id);
    if (!removed.length) return;
    setDrafts(kept);
    void port.undo(removed.map((c) => c.id));
    if (offline) void localDrafts.write(kept);
    say(fill(CS.history.undone, { what: removed[0]?.summary ?? "" }));
  };

  const commit = (summary: string, edits: Edit[], text?: string) => {
    const real = edits.filter((e) => JSON.stringify(e.before) !== JSON.stringify(e.after));
    if (!real.length) return;
    const ch: Change = {
      id: crypto.randomUUID(),
      summary,
      author: user.id,
      at: new Date().toISOString(),
      edits: real,
    };
    const next = [...drafts, ch];
    setDrafts(next);
    if (offline) void localDrafts.write(next);
    else
      void port.saveChange(ch).then((r) => {
        if (!r.ok) say(CS_ERRORS.saveFailed);
      });
    say(text ?? CS.ed.saved, () => undo(ch.id));
  };

  const go = (v: View, s: string | null = null) => {
    setView(v);
    setSel(s);
    setDrawer(false);
  };

  const texts = (list: Change[]) =>
    list.reduce((n, ch) => n + impactOf(snap, ch, data.booked, data.unitCost ?? 0).texts, 0);

  const publish = async (when: When) => {
    if (offline) return say(CS_ERRORS.offline);
    if (!drafts.length) return;
    if (publishBlockers(published, snap, deptLive).length) return say(CS_ERRORS.blocked);
    // CS9: a fee band change needs a second admin.
    if (drafts.some((c) => c.author === user.id && c.edits.some((e) => e.entity === "bands")))
      return say(CS_ERRORS.fourEyes);
    const ids = drafts.map((c) => c.id);
    const r = await port.publish(ids, when);
    if (!r.ok) return say(r.error);
    setModal(null);
    if (when === "now") {
      const tx = r.texts ?? texts(drafts);
      setPublished((p) => applyChanges(p, drafts));
      setVersions((v) => [
        ...v,
        {
          number: r.version || (v.at(-1)?.number ?? 0) + 1,
          at: new Date().toISOString(),
          by: user.id,
          textsSent: tx,
          changes: drafts,
        },
      ]);
      setDrafts([]);
      say(
        drafts.length === 1 ? CS.publish.done1 : fill(CS.publish.done, { n: drafts.length, t: tx }),
      );
    } else {
      const label = CS.publish.when[when];
      setJob({
        id: crypto.randomUUID(),
        runAt: r.runAt ?? label,
        by: user.id,
        changes: [...(job?.changes ?? []), ...drafts],
      });
      setDrafts([]);
      say(fill(CS.publish.schedDone, { n: ids.length, when: label }));
    }
  };

  const schedNow = async () => {
    if (!job) return;
    if (offline) return say(CS_ERRORS.offline);
    const r = await port.publishEarly();
    if (!r.ok) return say(r.error);
    setPublished((p) => applyChanges(p, job.changes));
    setVersions((v) => [
      ...v,
      {
        number: r.version || (v.at(-1)?.number ?? 0) + 1,
        at: new Date().toISOString(),
        by: user.id,
        textsSent: texts(job.changes),
        changes: job.changes,
      },
    ]);
    setJob(null);
    setModal(null);
    say(fill(CS.publish.done, { n: job.changes.length, t: texts(job.changes) }));
  };
  const schedCancel = async () => {
    if (!job) return;
    const r = await port.cancelSchedule();
    if (!r.ok) return say(r.error);
    setDrafts((d) => [...job.changes, ...d]);
    setJob(null);
    setModal(null);
    say(CS.publish.cancelled);
  };

  /** P7: pause at once (audited on the server); resuming is a draft. */
  const pause = async (id: string) => {
    const r = await port.pause(id);
    if (!r.ok) return say(r.error);
    setPublished((p) =>
      p.clinics[id]
        ? { ...p, clinics: { ...p.clinics, [id]: { ...p.clinics[id], paused: true } } }
        : p,
    );
    setModal(null);
    say(fill(CS.pause.done, { name: snap.clinics[id]?.name ?? "" }));
  };

  const ctx: Ctx = {
    d: { ...data, user, versions, job },
    view: snap,
    published,
    drafts,
    commit,
    say,
    modal: setModal,
    go,
    sel,
    setSel,
    q,
    deptLive,
    rd,
    newId: () => crypto.randomUUID(),
    port,
    offline,
  };

  /* ─── keys ─── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (modal) return; // the dialog closes itself
        if (sel) return setSel(null);
        if (drawer) return setDrawer(false);
        return;
      }
      if (typing(e) || modal) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VIEWS.length) {
        e.preventDefault();
        return go(VIEWS[n - 1] ?? "ready");
      }
      const act: Record<string, () => void> = {
        "/": () => findRef.current?.focus(),
        p: () => setModal({ k: "publish" }),
        u: () => drafts.length && undo(drafts.at(-1)!.id),
        "?": () => setModal({ k: "keys" }),
        "[": () => setRail((r) => !r),
      };
      const f = act[e.key.toLowerCase()] ?? act[e.key];
      if (!f) return;
      e.preventDefault();
      f();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ─── sidebar numbers ─── */
  const all = Object.values(snap.clinics);
  const st = all.map((c) => rd(c.id).status);
  const nLive = st.filter((s) => s === "live").length;
  const nReady = st.filter((s) => s === "ready").length;
  const nSetup = st.filter((s) => s === "setup").length;
  const total = all.filter((c) => c.ages !== "children").length;
  const pairs = clashPairs(clashes(snap));
  const leaveN = Object.values(snap.leave).filter((l) => l.status === "new").length;
  const offN = Object.values(snap.devices).filter((d) => !d.online && d.lastSeen).length;
  const todo = todoList(ctx);
  const ringC = 2 * Math.PI * 27;

  const badge: Partial<Record<View, { t: string; warn?: boolean }>> = {
    ...(nSetup ? { ready: { t: fill(CS.badge.fix, { n: nSetup }), warn: true } } : {}),
    ...(pairs.length
      ? {
          week: {
            t: fill(pairs.length === 1 ? CS.badge.clash : CS.badge.clashes, { n: pairs.length }),
            warn: true,
          },
        }
      : {}),
    ...(leaveN ? { people: { t: fill(CS.badge.leave, { n: leaveN }), warn: true } } : {}),
    ...(offN ? { devices: { t: fill(CS.badge.offline, { n: offN }), warn: true } } : {}),
    ...(drafts.length ? { history: { t: String(drafts.length) } } : {}),
  };

  const find = () => {
    const qq = q.trim().toLowerCase();
    if (!qq) return;
    const c = all.find(
      (x) => x.name.toLowerCase().includes(qq) || x.shortName.toLowerCase().includes(qq),
    );
    if (c) return go("clinics", c.id);
    const p = Object.values(snap.people).find(
      (x) => x.name.toLowerCase().includes(qq) || x.role.toLowerCase().includes(qq),
    );
    if (p) return go("people", p.id);
    const room = Object.values(snap.places).find((x) => x.name.toLowerCase().includes(qq));
    if (room) {
      const c2 = all.find((x) => x.roomIds.includes(room.id) || x.blockId === room.id);
      if (c2) return go("clinics", c2.id);
    }
    say(fill(CS.top.noMatch, { q: q.trim() }));
  };

  const jobWhen = job ? (CS.publish.when[job.runAt as When] ?? job.runAt) : "";
  const close = () => setModal(null);
  const m = modal;

  return (
    <DeskShell
      label={CS.label}
      priv={false}
      offline={offline}
      banner={
        <>
          <b>{CS.offline.title}</b>
          <span>{CS.offline.body}</span>
        </>
      }
      rail={rail}
      setRail={setRail}
      drawer={drawer}
      setDrawer={setDrawer}
      hospitalName={data.hospitalName}
      user={{ name: user.name, place: CS.dock.role }}
      syncText={offline ? CS.dock.offline : CS.dock.online}
      onKeys={() => setModal({ k: "keys" })}
      onSwitchUser={() => setModal({ k: "user" })}
      onEmergency={() => setModal({ k: "emerg" })}
      toast={toast}
      clearToast={() => setToast(null)}
      side={
        <div className={k(rail && !drawer && "railed")} style={{ display: "contents" }}>
          <button
            type="button"
            className={k("su-prog-card")}
            onClick={() => go("ready")}
            aria-label={fill(CS.launch.aria, { live: nLive, total })}
          >
            <span className={k("su-pt")}>
              <span>{CS.launch.title}</span>
              <em>{total ? Math.round((nLive / total) * 100) : 0}%</em>
            </span>
            <span className={k("su-pm")}>
              <span className={k("su-ring")} aria-hidden="true">
                <svg viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.16"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    fill="none"
                    stroke="var(--acc)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${total ? (ringC * nLive) / total : 0} ${ringC}`}
                  />
                </svg>
                <b>
                  {nLive}
                  <small>/{total}</small>
                </b>
              </span>
              <span className={k("su-pl2")}>
                <span>
                  <i className={k("lv")} />
                  <b>{nLive}</b> {CS.launch.taking}
                </span>
                <span>
                  <i className={k("rd")} />
                  <b>{nReady}</b> {CS.launch.ready}
                </span>
                <span>
                  <i className={k("st")} />
                  <b>{nSetup}</b> {CS.launch.fix}
                </span>
              </span>
            </span>
            <span className={k("su-pnext")}>
              <small>{CS.launch.next}</small>
              <span>{todo[0]?.title ?? CS.launch.allLive}</span>
            </span>
          </button>
          {groups.length ? <AdminHomeNav /> : null}
          <nav className={k("nav")} aria-label={CS.label}>
            {VIEWS.map((v, i) => (
              <button
                key={v}
                type="button"
                className={k("nv", view === v && "on")}
                onClick={() => go(v)}
                title={`${CS.views[v]} (${i + 1})`}
                aria-current={view === v ? "page" : undefined}
                data-tour={navTour(CS.views[v])}
              >
                <Icon n={ICONS[v]} size={19} />
                <span className={k("lbl")}>{CS.views[v]}</span>
                {badge[v] ? <em>{badge[v]!.t}</em> : null}
                {badge[v]?.warn ? <i className={k("dot")} aria-hidden="true" /> : null}
              </button>
            ))}
          </nav>
          <AdminNavGroups groups={groups} />
          <div className={k("grow")} />
          <GuideNavButton />
        </div>
      }
      top={
        <>
          <label className={k("srch")} data-tour="search">
            <span className={k("sr")}>{CS.top.find}</span>
            <Icon n="search" size={17} />
            <input
              ref={findRef}
              type="text"
              autoComplete="off"
              placeholder={CS.top.findPh}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") find();
                if (e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <span className={k("grow")} />
          {drafts.length ? (
            <button
              type="button"
              className={k("su-pub-pill")}
              onClick={() => setModal({ k: "publish" })}
              data-tour="wt-publish"
            >
              <span>
                {drafts.length === 1 ? CS.top.change1 : fill(CS.top.changes, { n: drafts.length })}
              </span>
              <b>{CS.top.review}</b>
            </button>
          ) : null}
          {job ? (
            <button
              type="button"
              className={k("su-sched-pill")}
              onClick={() => setModal({ k: "sched" })}
            >
              <Icon n="clock" size={15} />
              <span>
                {job.changes.length === 1
                  ? fill(CS.top.sched1, { when: jobWhen })
                  : fill(CS.top.sched, { n: job.changes.length, when: jobWhen })}
              </span>
            </button>
          ) : null}
          {!drafts.length && !job ? (
            <span className={k("su-saved")}>
              <i aria-hidden="true" />
              {CS.top.clean}
            </span>
          ) : null}
        </>
      }
      after={
        <>
          {m?.k === "ses" ? <SessionDialog ctx={ctx} m={m} close={close} /> : null}
          {m?.k === "cx" ? <CxDialog ctx={ctx} m={m} close={close} /> : null}
          {m?.k === "dev" ? <DeviceDialog ctx={ctx} close={close} /> : null}
          {m?.k === "addP" ? <AddPersonDialog ctx={ctx} close={close} /> : null}
          {m?.k === "open" ? <OpenDialog ctx={ctx} id={m.id} close={close} /> : null}
          {m?.k === "pause" ? (
            <PauseDialog ctx={ctx} id={m.id} close={close} pause={pause} />
          ) : null}
          {m?.k === "openAll" ? <OpenAllDialog ctx={ctx} close={close} /> : null}
          {m?.k === "tpl" ? <TplDialog ctx={ctx} close={close} /> : null}
          {m?.k === "bands" ? <BandsDialog ctx={ctx} close={close} /> : null}
          {m?.k === "bulk" ? <BulkDialog ctx={ctx} close={close} /> : null}
          {m?.k === "print" ? <PrintDialog ctx={ctx} close={close} /> : null}
          {m?.k === "ppv" ? <PreviewDialog ctx={ctx} id={m.id} close={close} /> : null}
          {m?.k === "publish" ? (
            <PublishDialog ctx={ctx} close={close} publish={publish} undo={undo} user={user} />
          ) : null}
          {m?.k === "sched" && job ? (
            <SchedDialog
              job={job}
              when={jobWhen}
              close={close}
              now={schedNow}
              cancel={schedCancel}
            />
          ) : null}
          {m?.k === "restore" ? <RestoreDialog ctx={ctx} n={m.n} close={close} /> : null}
          <UserDialog
            open={m?.k === "user"}
            close={close}
            users={data.users}
            user={user}
            pick={(u) => {
              setUser(u);
              setModal(null);
              say(fill(CS.user.now, { name: u.name }));
            }}
          />
          <DeskDialog
            open={m?.k === "keys"}
            onClose={close}
            label={CS.keys.title}
            tile="keys"
            title={CS.keys.title}
            lead={CS.keys.sub}
          >
            <div className={k("kys")}>
              {CS.keys.list.map(([what, keys]) => (
                <div key={what} className={k("ky")}>
                  <span>{what}</span>
                  <span className={k("kk")}>
                    {keys.map((x) => (
                      <kbd key={x}>{x}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </DeskDialog>
          <DeskDialog
            open={m?.k === "emerg"}
            onClose={close}
            label={CS.emergency.title}
            tile="alert"
            red
            title={CS.emergency.title}
            lead={CS.emergency.body}
          >
            <div className={k("mf")}>
              <a className={k("btn", "r")} href="/emergency">
                {CS.emergency.go}
              </a>
              <button type="button" className={k("btn")} onClick={close}>
                {CS.close}
              </button>
            </div>
          </DeskDialog>
        </>
      }
    >
      {view === "ready" ? <ReadyView ctx={ctx} /> : null}
      {view === "clinics" ? <ClinicsView ctx={ctx} /> : null}
      {view === "week" ? <WeekView ctx={ctx} /> : null}
      {view === "closures" ? <ClosuresView ctx={ctx} /> : null}
      {view === "people" ? <PeopleView ctx={ctx} /> : null}
      {view === "devices" ? <DevicesView ctx={ctx} /> : null}
      {view === "history" ? <HistoryView ctx={ctx} undo={undo} /> : null}
    </DeskShell>
  );
}

/** Switch user with the 4-digit PIN pad (fixture: any four digits; live: the desk PIN check). */
function UserDialog({
  open,
  close,
  users,
  user,
  pick,
}: {
  open: boolean;
  close: () => void;
  users: CsUser[];
  user: CsUser;
  pick: (u: CsUser) => void;
}) {
  const [picked, setPicked] = useState<CsUser | null>(null);
  const [pin, setPin] = useState("");
  const press = (d: string) => {
    if (!picked) return;
    if (d === "del") return setPin((p) => p.slice(0, -1));
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setPin("");
      setPicked(null);
      pick(picked);
    }
  };
  return (
    <DeskDialog
      open={open}
      onClose={close}
      label={CS.user.title}
      tile="swap"
      title={CS.user.title}
      lead={CS.user.sub}
    >
      <div className={k("su-users")}>
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            className={k("su-user", (picked?.id ?? user.id) === u.id && "on")}
            onClick={() => (u.id === user.id ? setPicked(null) : setPicked(u))}
          >
            <span className={k("av")}>
              {u.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span className={k("su-ut")}>
              <b>{u.name}</b>
              <small>
                {CS.dock.role} · {CS.user.can[u.can]}
              </small>
            </span>
            {u.id === user.id ? <em>{CS.user.signedIn}</em> : null}
          </button>
        ))}
      </div>
      {picked ? (
        <div className={k("su-pinw")}>
          <span>{fill(CS.user.pin, { name: picked.name })}</span>
          <div className={k("su-pind")} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={k(i < pin.length && "on")} />
            ))}
          </div>
          <div className={k("su-pink")}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((d) =>
              d ? (
                <button
                  key={d}
                  type="button"
                  onClick={() => press(d)}
                  aria-label={d === "del" ? CS.user.del : d}
                >
                  {d === "del" ? "⌫" : d}
                </button>
              ) : (
                <span key="gap" />
              ),
            )}
          </div>
          <small className={k("su-h")}>{CS.user.pinNote}</small>
        </div>
      ) : null}
      <div className={k("mf")}>
        <form action="/sign-out" method="post">
          <button type="submit" className={k("btn")}>
            {CS.user.signOut}
          </button>
        </form>
        <button type="button" className={k("btn", "q")} onClick={close}>
          {CS.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
