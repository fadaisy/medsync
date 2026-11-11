"use client";

import type { Tile } from "./header";
import type { RulesView } from "@/lib/pharmacy/setup/types";
import { useState } from "react";

import { useToast } from "@/components/pharmacy/medicines/shared";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { RULES_TAB as R } from "@/content/pharmacy-setup-rules";
import { searchRules } from "@/lib/pharmacy/derive/setup/rules";
import { Groups } from "./groups";
import { Header } from "./header";
import { History } from "./history";
import { Waiting } from "./waiting";

/** Set-up › Rules (SETUP-TABS §C): header and tiles, waiting proposals, groups with their rules, history. */
export function RulesTab({ view }: { view: RulesView | null }) {
  if (!view)
    return (
      <Panel title={R.title}>
        <EmptyState compact title={R.needsDb} />
      </Panel>
    );
  return <Rules view={view} />;
}

function Rules({ view }: { view: RulesView }) {
  const [toastNode, toast] = useToast();
  const [q, setQ] = useState("");
  const [tile, setTile] = useState<Tile>("");
  const [sel, setSel] = useState(view.groups[0]?.key ?? "");
  const [histAll, setHistAll] = useState(true);

  const searched = searchRules(view.groups, q);
  const nav = searched.filter(
    (g) =>
      (tile !== "unsigned" || !g.signed) &&
      (tile !== "pending" || view.proposals.some((p) => p.group === g.key)),
  );
  const orig = view.groups.find((g) => g.key === sel) ?? view.groups[0]!;
  const cur = nav.find((g) => g.key === sel) ??
    nav[0] ??
    searched.find((g) => g.key === sel) ?? { ...orig, rules: [] };
  const history = [...view.history].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Header
        view={view}
        history={history}
        q={q}
        setQ={setQ}
        tile={tile}
        setTile={(t) => {
          setTile(t);
          const first = view.groups.find((g) => !g.signed);
          if (t === "unsigned" && first) setSel(first.key);
        }}
      />
      <Waiting view={view} toast={toast} />
      <Groups view={view} nav={nav} cur={cur} q={q} onPick={setSel} toast={toast} />
      <History
        rows={histAll ? history : history.filter((h) => h.group === cur.title)}
        all={histAll}
        setAll={setHistAll}
      />
      {toastNode}
    </div>
  );
}
