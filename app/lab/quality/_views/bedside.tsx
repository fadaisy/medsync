import { and, eq, inArray } from "drizzle-orm";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { db } from "@/db";
import { labSignedConfigs } from "@/db/schema";
import { loadBedsideQuality } from "@/lib/lab/bedside-quality-store";
import { labPoctQualityLiveFor } from "@/lib/lab/feature";
import {
  AssessDialog,
  DeviceRuleDialog,
  RangesDialog,
  SignBedside,
  SwitchOn,
  ValidityDialog,
} from "../_components/bedside-forms";
import { QList } from "../_components/q-list";
import { QcChip } from "../_components/qc-chip";
import { QUALITY } from "../_lib/copy";
import { requireQualityScope } from "../_lib/scope";
import { EmptyState } from "../../_components/v2/kit";
import { dayWords } from "../../_lib/days";
import { Frame } from "./frame";

const B = QUALITY.bedside;
const panel =
  "bg-card shadow-tide-card rounded-tide-card border-border flex flex-col gap-3 border p-4";

/**
 * The laboratory's side of bedside quality (Lab Phase 3 §5.10, §6.9; labPoctQuality): per bedside test the
 * device control rule and the competency validity with its grace period (drafts signed by the laboratory lead
 * alone, E-LAB3-12), switch-on for existing operators (D-LAB3-16), strip-lot ranges entered once from the vial,
 * and each operator's assessment per test (lapsed amber). The checks themselves are the nurses' (/nurse/bedside).
 */
export async function BedsideView({ v2 }: { v2: boolean }) {
  const { scope, lead } = await requireQualityScope(labPoctQualityLiveFor);
  const p = scope.access.permissions;
  const assess = lead || p.has("poct.assess");
  const stock = lead || p.has("lab.stock.manage");
  const now = new Date();
  const v = await db.transaction((t) => loadBedsideQuality(t as never, scope.hospitalId, now));
  const draftIds = v.tests.flatMap((t) => [t.ruleDraft?.id, t.validityDraft?.id]).filter(Boolean);
  const authored = draftIds.length
    ? await db
        .select({ id: labSignedConfigs.id, by: labSignedConfigs.authoredBy })
        .from(labSignedConfigs)
        .where(
          and(
            eq(labSignedConfigs.hospitalId, scope.hospitalId),
            inArray(labSignedConfigs.id, draftIds as string[]),
          ),
        )
    : [];
  const mine = new Set(authored.filter((a) => a.by === scope.userId).map((a) => a.id));
  const levelsFor = (code: string | null) =>
    v.tests.find((t) => t.code === code)?.rule?.payload.levels ?? null;
  return (
    <Frame v2={v2} hospital={scope.hospitalName} title={B.title} lede={B.lede}>
      {v.tests.length === 0 ? <EmptyState compact title={B.noDevices} /> : null}
      {v.tests.map((t) => (
        <section key={t.code} aria-labelledby={`t-${t.code}`} className={panel}>
          <h2 id={`t-${t.code}`} className="text-heading-s font-medium">
            {t.display}
          </h2>
          <p className="text-body-s text-muted-foreground">
            {t.devices
              .map((d) => (d.state === "blocked" ? `${d.model} (${B.blocked})` : d.model))
              .join(", ")}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-body-m font-medium">{B.rule}</h3>
              {t.rule ? (
                <p className="text-body-s">
                  {`${t.rule.payload.triggers.map((x) => B.triggerWords[x]).join(" · ")} · ${B.levels}: ${t.rule.payload.levels.join(", ")}${t.rule.payload.requiredBeforeUse ? ` · ${B.required}` : ""}`}
                </p>
              ) : (
                <QcChip tone="amber">{B.noRule}</QcChip>
              )}
              {lead ? (
                <DeviceRuleDialog
                  testCode={t.code}
                  test={t.display}
                  initial={t.ruleDraft?.payload ?? t.rule?.payload ?? null}
                />
              ) : null}
              {lead && t.ruleDraft ? (
                <SignBedside configId={t.ruleDraft.id} author={mine.has(t.ruleDraft.id)} />
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-body-m font-medium">{B.validity}</h3>
              {t.validity ? (
                <p className="text-body-s">
                  {B.validityWords(t.validity.payload.validDays, t.validity.payload.graceDays)}
                </p>
              ) : (
                <QcChip tone="amber">{B.noValidity}</QcChip>
              )}
              {lead ? (
                <ValidityDialog
                  testCode={t.code}
                  test={t.display}
                  initial={t.validityDraft?.payload ?? t.validity?.payload ?? null}
                />
              ) : null}
              {lead && t.validityDraft ? (
                <SignBedside configId={t.validityDraft.id} author={mine.has(t.validityDraft.id)} />
              ) : null}
              {lead && t.validity ? <SwitchOn testCode={t.code} test={t.display} /> : null}
            </div>
          </div>
        </section>
      ))}
      <section aria-labelledby="lots" className={panel}>
        <h2 id="lots" className="text-heading-s font-medium">
          {B.lots}
        </h2>
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{B.rangesLede}</p>
        <QList
          caption={B.lots}
          rows={v.lots}
          rowKey={(l) => l.id}
          empty={B.noLots}
          columns={[
            { id: "lot", header: B.lotColumns[0]!, cell: (l) => l.lot },
            { id: "test", header: B.lotColumns[1]!, cell: (l) => l.test ?? "—" },
            {
              id: "use",
              header: B.lotColumns[2]!,
              cell: (l) => (l.useBy ? dayWords(l.useBy) : "—"),
            },
            {
              id: "ranges",
              header: B.lotColumns[3]!,
              cell: (l) => {
                if (l.ranges)
                  return Object.entries(l.ranges)
                    .map(([k, r]) => `${k} ${r.low}–${r.high}`)
                    .join(" · ");
                const levels = levelsFor(l.testCode);
                return (
                  <span className="flex flex-col gap-1">
                    <QcChip tone="amber">{B.notEntered}</QcChip>
                    {stock && levels ? (
                      <RangesDialog lot={{ id: l.id, lot: l.lot }} levels={levels} />
                    ) : !levels ? (
                      <span className="text-caption text-muted-foreground">{B.ruleFirst}</span>
                    ) : null}
                  </span>
                );
              },
            },
          ]}
        />
      </section>
      <section aria-labelledby="comp" className={panel}>
        <h2 id="comp" className="text-heading-s font-medium">
          {B.competency}
        </h2>
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{B.assessLede}</p>
        <QList
          caption={B.competency}
          rows={v.competencies}
          rowKey={(c) => `${c.userId}:${c.testCode}`}
          empty={B.noOperators}
          columns={[
            { id: "who", header: B.compColumns[0]!, cell: (c) => c.name },
            { id: "test", header: B.compColumns[1]!, cell: (c) => c.test },
            {
              id: "assessed",
              header: B.compColumns[2]!,
              cell: (c) =>
                c.grandfathered ? B.grandfathered : c.assessedOn ? dayWords(c.assessedOn) : "—",
            },
            {
              id: "valid",
              header: B.compColumns[3]!,
              cell: (c) =>
                c.status === "valid" || c.status === "grace" ? (
                  <StatusWord icon glyph={CheckIcon}>
                    {`${dayWords(c.validTo!)}${c.status === "grace" ? ` · ${B.grace}` : ""}`}
                  </StatusWord>
                ) : c.status === "lapsed" ? (
                  <QcChip tone="amber">{B.lapsed(dayWords(c.validTo!))}</QcChip>
                ) : (
                  <QcChip tone="amber">{B.statusWords[c.status]}</QcChip>
                ),
            },
            {
              id: "do",
              header: B.compColumns[4]!,
              cell: (c) =>
                assess ? (
                  <AssessDialog
                    userId={c.userId}
                    name={c.name}
                    testCode={c.testCode}
                    test={c.test}
                  />
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </section>
    </Frame>
  );
}
