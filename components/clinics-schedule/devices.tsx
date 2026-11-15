"use client";

/** Desks and screens (S24, S25): which clinics each device covers, lock, and pairing a new one. */
import type { Ctx } from "./shared";
import type { Device } from "@/lib/clinics-schedule/model";
import { useState } from "react";

import { CS } from "@/content/clinics-schedule/copy";
import { fill } from "@/content/lab-workspace-v2";
import { edit } from "@/lib/clinics-schedule/model";
import { Chip, ChipRow, dateTxt, DeskDialog, Field, hit, hm, Icon, k, Seg } from "./shared";

type Kind = Device["kind"];
type Filter = "all" | Kind | "off";
const KINDS: readonly Kind[] = ["desk", "tablet", "screen"];
const ICON: Record<Kind, string> = { desk: "card", tablet: "person", screen: "eye" };

const seenTxt = (v: Device) => {
  if (v.online) return CS.devices.seen.now;
  if (!v.lastSeen) return CS.devices.seen.never;
  const at = new Date(v.lastSeen);
  return fill(CS.devices.seen.ago, {
    t: `${dateTxt(v.lastSeen.slice(0, 10))} ${hm(at.getHours() * 60 + at.getMinutes())}`,
  });
};
const isOff = (v: Device) => !v.online && !!v.lastSeen;

/** Clinics with no desk / no screen among the devices given. */
export function coverGaps(clinics: { id: string }[], devices: Device[]) {
  const has = (kind: Kind, id: string) =>
    devices.some((v) => v.kind === kind && v.clinicIds.includes(id));
  return {
    noDesk: clinics.filter((c) => !has("desk", c.id)),
    noScreen: clinics.filter((c) => !has("screen", c.id)),
  };
}

export function DevicesView({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const [mode, setMode] = useState<"devices" | "coverage">("devices");
  const [filter, setFilter] = useState<Filter>("all");
  const devs = Object.values(view.devices).filter((v) => hit(ctx.q, v.name, v.place));
  const all = Object.values(view.devices);
  const clinics = Object.values(view.clinics).sort((a, b) => a.name.localeCompare(b.name));
  const sel = ctx.sel ? view.devices[ctx.sel] : undefined;
  const on = all.filter((v) => v.online).length;
  const offs = all.filter(isOff);
  const { noDesk, noScreen } = coverGaps(clinics, all);
  const pick = (f: Filter, m: "devices" | "coverage" = "devices") => {
    setMode(m);
    setFilter(f);
  };

  const tiles = [
    {
      cls: offs.length ? "warn" : "",
      k: `${on}/${all.length}`,
      l: fill(CS.devices.tiles.online, { o: on, n: all.length }),
      sub: offs.length
        ? fill(CS.devices.tiles.offline, { name: offs[0]?.name ?? "" })
        : CS.devices.tiles.allOnline,
      go: () => pick(offs.length ? "off" : "all"),
    },
    {
      cls: noDesk.length ? "warn" : "",
      k: String(noDesk.length),
      l: noDesk.length
        ? fill(noDesk.length === 1 ? CS.devices.tiles.noDesk : CS.devices.tiles.noDeskN, {
            n: noDesk.length,
          })
        : CS.devices.tiles.everyDesk,
      sub: noDesk.length ? CS.devices.tiles.noDeskSub : "",
      go: () => pick("all", "coverage"),
    },
    {
      cls: noScreen.length ? "mid" : "",
      k: String(noScreen.length),
      l: noScreen.length
        ? fill(noScreen.length === 1 ? CS.devices.tiles.noScreen : CS.devices.tiles.noScreenN, {
            n: noScreen.length,
          })
        : CS.devices.tiles.everyScreen,
      sub: noScreen.length ? CS.devices.tiles.noScreenSub : "",
      go: () => pick("all", "coverage"),
    },
  ];
  const match = (v: Device, f: Filter) =>
    f === "all" ? true : f === "off" ? isOff(v) : v.kind === f;
  const shown = devs.filter((v) => match(v, filter));
  const cols = all
    .filter((v) => v.kind !== "tablet")
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

  const flip = (v: Device, clinicId: string) => {
    const has = v.clinicIds.includes(clinicId);
    const name = view.clinics[clinicId]?.name ?? "";
    const t = fill(has ? CS.devices.uncovers : CS.devices.covers, { name: v.name, clinic: name });
    ctx.commit(t, [
      edit(view, "devices", v.id, {
        ...v,
        clinicIds: has ? v.clinicIds.filter((x) => x !== clinicId) : [...v.clinicIds, clinicId],
      }),
    ]);
  };

  return (
    <div className={k("su-wrap", "su-split")}>
      <div className={k("su-page", "su-l")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{CS.devices.title}</h1>
            <span className={k("adate")}>{fill(CS.devices.sub, { n: all.length, o: on })}</span>
          </div>
          <span className={k("grow")} />
          <button type="button" className={k("btn", "sm")} onClick={() => ctx.modal({ k: "dev" })}>
            {CS.devices.add}
          </button>
        </div>

        <div className={k("su-dst")}>
          {tiles.map((t) => (
            <button key={t.l} type="button" className={k("su-dsc", t.cls)} onClick={t.go}>
              <span className={k("su-dsd")} aria-hidden="true" />
              <div>
                <b>{t.k}</b>
                <span>{t.l}</span>
                {t.sub ? <small>{t.sub}</small> : null}
              </div>
            </button>
          ))}
        </div>

        <div className={k("su-ctb")}>
          <Seg
            opts={(["devices", "coverage"] as const).map((m) => [m, CS.devices.modes[m]] as const)}
            value={mode}
            onPick={setMode}
            label={CS.devices.title}
          />
          <span className={k("su-grow")} />
          {mode === "devices" ? (
            <div className={k("su-cfs")} role="group" aria-label={CS.devices.title}>
              {(["all", "desk", "tablet", "screen", "off"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={k(filter === f && "on", f === "off" && "warn")}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {CS.devices.filters[f]}
                  <b>{devs.filter((v) => match(v, f)).length}</b>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {mode === "devices" ? (
          <div className={k("su-cls")}>
            {KINDS.map((kind) => {
              const rows = shown
                .filter((v) => v.kind === kind)
                .sort((a, b) => a.name.localeCompare(b.name));
              if (!rows.length) return null;
              const [label, meta] = CS.devices.groups[kind];
              return (
                <section key={kind} className={k("su-cgp")}>
                  <div className={k("su-cgh")}>
                    <b>{label}</b>
                    <small>{meta}</small>
                  </div>
                  <div className={k("su-dvg2")}>
                    {rows.map((v) => {
                      const cs = v.clinicIds.flatMap((id) => view.clinics[id] ?? []);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className={k("su-dv2", sel?.id === v.id && "sel", isOff(v) && "off")}
                          aria-pressed={sel?.id === v.id}
                          onClick={() => ctx.setSel(sel?.id === v.id ? null : v.id)}
                        >
                          <span className={k("su-dvt")}>
                            <span className={k("su-dvi")} aria-hidden="true">
                              <Icon n={ICON[v.kind]} size={16} />
                            </span>
                            <span className={k("su-dvn")}>
                              <b>{v.name}</b>
                              <small>{v.place}</small>
                            </span>
                          </span>
                          <span className={k("su-on", isOff(v) && "off", v.online && "ok")}>
                            {seenTxt(v)}
                          </span>
                          <span className={k("su-pcl2")}>
                            {cs.slice(0, 3).map((c) => (
                              <em key={c.id}>
                                <i style={{ background: c.colour }} />
                                {c.shortName || c.name}
                              </em>
                            ))}
                            {cs.length > 3 ? <em>+{cs.length - 3}</em> : null}
                            {!cs.length ? <small>{CS.devices.noClinics}</small> : null}
                          </span>
                          <span className={k("su-dvf")}>
                            <span>
                              {v.kind === "screen"
                                ? CS.devices.codesOnly
                                : v.lockMin
                                  ? fill(CS.devices.lockRule, { n: v.lockMin })
                                  : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {!shown.length ? (
              <div className={k("empty")}>
                <b>{CS.devices.nothing}</b>
                <span>{CS.devices.nothingSub}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={k("su-card", "su-cvw", "su-scroll")}>
            <table className={k("su-cv")}>
              <thead>
                <tr>
                  <th scope="col">{CS.clinics.title}</th>
                  {cols.map((v) => (
                    <th
                      key={v.id}
                      scope="col"
                      className={k(isOff(v) && "off")}
                      title={`${v.name} · ${v.place}`}
                    >
                      {v.name}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">{CS.devices.gap}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {clinics.map((c) => {
                  const nd = noDesk.includes(c);
                  const ns = noScreen.includes(c);
                  return (
                    <tr key={c.id} className={k(nd && "gap")}>
                      <th scope="row">
                        <i style={{ background: c.colour }} />
                        {c.name}
                      </th>
                      {cols.map((v) => {
                        const has = v.clinicIds.includes(c.id);
                        const lbl = fill(has ? CS.devices.cellRemove : CS.devices.cellAdd, {
                          clinic: c.name,
                          device: v.name,
                          place: v.place,
                        });
                        return (
                          <td key={v.id}>
                            <button
                              type="button"
                              className={k("su-cvc", has && "on")}
                              aria-pressed={has}
                              aria-label={lbl}
                              title={lbl}
                              onClick={() => flip(v, c.id)}
                            >
                              <Icon n="tick" size={14} />
                            </button>
                          </td>
                        );
                      })}
                      <td>
                        {nd || ns ? (
                          <span className={k("su-gap", nd && "warn")}>
                            {nd ? CS.devices.noDesk : CS.devices.noScreen}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={k("su-note", "su-cvn")}>{CS.devices.covNote}</p>
          </div>
        )}
      </div>
      {sel ? <DevicePanel key={sel.id} ctx={ctx} v={sel} flip={flip} /> : null}
    </div>
  );
}

function DevicePanel({
  ctx,
  v,
  flip,
}: {
  ctx: Ctx;
  v: Device;
  flip: (v: Device, clinicId: string) => void;
}) {
  const { view } = ctx;
  const clinics = Object.values(view.clinics).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <aside className={k("det", "su-det")} aria-label={v.name}>
      <div className={k("su-dh")}>
        <div>
          <h2>{v.name}</h2>
          <p>
            {CS.devices.kinds[v.kind]} · {v.place}
          </p>
        </div>
        <button type="button" className={k("btn", "sm", "q", "x")} onClick={() => ctx.setSel(null)}>
          {CS.close}
        </button>
      </div>
      {isOff(v) ? (
        <div className={k("su-awb")}>{fill(CS.devices.offNote, { seen: seenTxt(v) })}</div>
      ) : null}
      {v.kind !== "tablet" ? (
        <div className={k("su-sec")}>
          <span className={k("cap")}>
            {v.kind === "desk" ? CS.devices.mineDesk : CS.devices.mineScreen}
          </span>
          <ChipRow label={v.kind === "desk" ? CS.devices.mineDesk : CS.devices.mineScreen}>
            {clinics.map((c) => (
              <Chip key={c.id} on={v.clinicIds.includes(c.id)} onClick={() => flip(v, c.id)}>
                <i className={k("su-cdot")} style={{ background: c.colour }} />
                {c.shortName || c.name}
              </Chip>
            ))}
          </ChipRow>
        </div>
      ) : null}
      {v.kind !== "screen" ? (
        <div className={k("su-sec")}>
          <span className={k("cap")}>{CS.devices.lock}</span>
          <Seg
            opts={CS.devices.lockOpts.map((n) => [n, `${n} min`] as const)}
            value={v.lockMin}
            onPick={(n) =>
              ctx.commit(fill(CS.devices.lockSet, { name: v.name, n }), [
                edit(view, "devices", v.id, { ...v, lockMin: n }),
              ])
            }
            label={CS.devices.lock}
          />
          <p className={k("su-note")}>{CS.devices.lockH}</p>
        </div>
      ) : (
        <div className={k("su-sec")}>
          <span className={k("cap")}>{CS.devices.shows}</span>
          <p className={k("su-note")}>{CS.devices.showsH}</p>
          <div className={k("su-scr")}>
            <span>{CS.devices.sample.title}</span>
            <b>{CS.devices.sample.code}</b>
            <em>{CS.devices.sample.room}</em>
          </div>
        </div>
      )}
      <p className={k("su-note")}>{CS.devices.publishNote}</p>
    </aside>
  );
}

export function DeviceDialog({ ctx, close }: { ctx: Ctx; close: () => void }) {
  const { view } = ctx;
  const [kind, setKind] = useState<Kind>("desk");
  const [place, setPlace] = useState("");
  const [got, setGot] = useState<{ id: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const n = Object.values(view.devices).filter((v) => v.kind === kind).length + 1;
  const name = fill(CS.devices.newName[kind], { n });
  const get = async () => {
    if (!place.trim() || busy) return;
    setBusy(true);
    const r = await ctx.port.addDevice(kind, name, place.trim());
    setBusy(false);
    if (!r.ok) return ctx.say(r.error);
    setGot({ id: r.id, code: r.code });
  };
  const done = () => {
    if (got) {
      const dev: Device = {
        id: got.id,
        kind,
        name,
        place: place.trim(),
        clinicIds: [],
        lockMin: kind === "screen" ? null : 10,
        lastSeen: null,
        online: false,
      };
      ctx.commit(fill(CS.devices.added, { name }), [edit(view, "devices", got.id, dev)]);
      ctx.setSel(got.id);
    }
    close();
  };
  return (
    <DeskDialog
      open
      onClose={close}
      label={CS.devices.newT}
      tile="card"
      title={CS.devices.newT}
      lead={CS.devices.newSub}
      cls={k("su-m")}
    >
      <div className={k("su-sec")}>
        <Seg
          sm={false}
          opts={KINDS.map((x) => [x, CS.devices.kinds[x]] as const)}
          value={kind}
          onPick={(x) => !got && setKind(x)}
          label={CS.devices.newT}
        />
        <Field as="label" label={CS.devices.where}>
          <input
            className={k("in")}
            value={place}
            disabled={!!got}
            onChange={(e) => setPlace(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void get()}
            placeholder={CS.devices.wherePh}
            autoFocus
          />
        </Field>
        {got ? (
          <div className={k("su-pair")} aria-live="polite">
            <span>
              {CS.devices.onDevice} <b>{CS.devices.pairUrl}</b> {CS.devices.andType}
            </span>
            <b className="mono">{got.code}</b>
            <small>{CS.devices.codeNote}</small>
          </div>
        ) : null}
      </div>
      <div className={k("mf")}>
        {got ? (
          <button type="button" className={k("btn", "k")} onClick={done}>
            {CS.done}
          </button>
        ) : (
          <button
            type="button"
            className={k("btn", "k")}
            onClick={() => void get()}
            disabled={!place.trim() || busy || ctx.offline}
          >
            {CS.devices.getCode}
          </button>
        )}
        <button type="button" className={k("btn")} onClick={close}>
          {CS.cancel}
        </button>
      </div>
    </DeskDialog>
  );
}
