"use client";

/**
 * The Tether guide (ADR 0522): a centred wide dialog with the topics on the left (Walkthroughs first) and the
 * how-tos as an accordion, each with its numbered steps, a "Good to know" note and three ways on: walk me through
 * it, watch it done, take me there. One search box covers the how-tos and the walkthroughs.
 */
import type { DemoKey, WalkKey } from "@/content/hospital-admin/guide";
import { useState } from "react";

import { DeskDialog, Icon, k } from "@/components/clinics-schedule/shared";
import { DEMO_OF, GUIDE, TOPICS, WALKS } from "@/content/hospital-admin/guide";
import { fill } from "@/content/lab-workspace-v2";
import { routeHref } from "@/lib/hospital-admin/guide/route";
import { searchHowTos, searchWalks, terms } from "@/lib/hospital-admin/guide/search";
import g from "./guide.module.css";

const G = GUIDE.dialog;
const HOWTOS = TOPICS.reduce((n, t) => n + t.items.length, 0);

export function GuideDialog({
  open,
  onClose,
  setupHidden,
  onShowSetup,
  onWalk,
  onDemo,
  onGo,
}: {
  open: boolean;
  onClose: () => void;
  setupHidden: boolean;
  onShowSetup: () => void;
  onWalk: (k: WalkKey) => void;
  onDemo: (k: DemoKey) => void;
  onGo: (href: string) => void;
}) {
  const [topic, setTopic] = useState<string>("walks");
  /** The open how-to; null is the topic's first, "" none. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const searching = terms(q).length > 0;
  const isWalks = !searching && topic === "walks";
  const current = TOPICS.find((t) => t.key === topic) ?? TOPICS[0]!;
  const walks = searchWalks(q, WALKS);
  const hits = searching ? searchHowTos(q, TOPICS) : [];
  const arts = searching
    ? hits.map((h) => ({ key: `${h.topic.key}${h.index}`, a: h.item, topic: h.topic.label }))
    : isWalks
      ? []
      : current.items.map((a, i) => ({ key: `${current.key}${i}`, a, topic: null }));
  const showWalks = isWalks || (searching && walks.length > 0);
  const title = searching
    ? hits.length
      ? fill(G.hits[hits.length === 1 ? 0 : 1], { n: hits.length, q: q.trim() })
      : fill(G.noHit, { q: q.trim() })
    : current.label;

  const pick = (t: string) => {
    setTopic(t);
    setOpenKey(null);
    setQ("");
  };

  return (
    <DeskDialog
      open={open}
      onClose={onClose}
      label={G.label}
      size="xw"
      tile="help"
      title={G.title}
      lead={G.lead}
      closeLabel={G.close}
    >
      <div className={g.gw}>
        <nav className={g.gtl} aria-label={G.topics}>
          <button
            type="button"
            className={`${g.gt} ${isWalks ? g.on : ""}`}
            aria-pressed={isWalks}
            onClick={() => pick("walks")}
          >
            <span>{G.walks}</span>
            <em>{WALKS.length}</em>
          </button>
          {TOPICS.map((t) => {
            const on = !searching && !isWalks && t.key === current.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`${g.gt} ${on ? g.on : ""}`}
                aria-pressed={on}
                onClick={() => pick(t.key)}
              >
                <span>{t.label}</span>
                <em>{t.items.length}</em>
              </button>
            );
          })}
          <div className={g.gtools}>
            <button type="button" className={k("btn", "sm")} onClick={() => onWalk("menu")}>
              {G.tour}
            </button>
            {setupHidden ? (
              <button type="button" className={k("btn", "sm", "q")} onClick={onShowSetup}>
                {G.showSetup}
              </button>
            ) : null}
          </div>
        </nav>

        <div className={g.gart}>
          <input
            className={`${k("in")} ${g.gfind}`}
            type="search"
            placeholder={fill(G.find, { walks: WALKS.length, howtos: HOWTOS })}
            aria-label={G.findLabel}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpenKey(null);
            }}
          />

          {showWalks ? (
            <>
              <span className={k("cap")}>{searching ? G.walks : G.walksTitle}</span>
              <div className={g.gwk}>
                {walks.map((w) => {
                  const demo = DEMO_OF[w.key];
                  return (
                    <div key={w.key} className={g.gw2}>
                      <button type="button" className={g.gw1} onClick={() => onWalk(w.key)}>
                        <span>
                          <b>{w.title}</b>
                          <small>{w.sub}</small>
                        </span>
                        <em>
                          {fill(G.steps[w.steps.length === 1 ? 0 : 1], { n: w.steps.length })}
                        </em>
                        <Icon n="right" size={16} />
                      </button>
                      {demo ? (
                        <button
                          type="button"
                          className={g.gwatch}
                          onClick={() => onDemo(demo)}
                          aria-label={fill(G.watchAria, { title: w.title })}
                          title={G.watch}
                        >
                          {G.watchShort}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {!isWalks ? <span className={k("cap")}>{title}</span> : null}
          {searching && !hits.length && !walks.length ? (
            <p className={k("su-note")}>{G.none}</p>
          ) : null}

          {arts.map(({ key, a, topic: tl }, i) => {
            // The topic's first how-to starts open; in a search, every hit does.
            const on = openKey === key || (openKey === null && (searching || i === 0));
            const demo = a.walk ? DEMO_OF[a.walk] : undefined;
            const panel = `guide-${key}`;
            return (
              <div key={key} className={`${g.ga} ${on ? g.open : ""}`}>
                <button
                  type="button"
                  className={g.gq}
                  aria-expanded={on}
                  aria-controls={panel}
                  onClick={() => setOpenKey(on ? "" : key)}
                >
                  <span>
                    <b>{a.q}</b>
                    {tl ? <small>{tl}</small> : null}
                  </span>
                  <Icon n="down" size={16} />
                </button>
                {on ? (
                  <div className={g.gans} id={panel}>
                    <p>{a.what}</p>
                    {a.steps.length ? (
                      <ol className={g.gsteps}>
                        {a.steps.map((x, n) => (
                          <li key={x}>
                            <span aria-hidden="true">{n + 1}</span>
                            <p>{x}</p>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {a.note ? (
                      <div className={g.gnote}>
                        <b>{G.good}</b>
                        <p>{a.note}</p>
                      </div>
                    ) : null}
                    <div className={g.gacts}>
                      {a.walk ? (
                        <button
                          type="button"
                          className={k("btn", "sm", "k")}
                          onClick={() => onWalk(a.walk!)}
                        >
                          {G.walk}
                        </button>
                      ) : null}
                      {demo ? (
                        <button
                          type="button"
                          className={k("btn", "sm")}
                          onClick={() => onDemo(demo)}
                        >
                          {G.watch}
                        </button>
                      ) : null}
                      {a.go ? (
                        <button
                          type="button"
                          className={k("btn", "sm")}
                          onClick={() => onGo(routeHref(a.go!))}
                        >
                          {G.go}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </DeskDialog>
  );
}
