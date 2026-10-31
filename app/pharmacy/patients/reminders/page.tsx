import { PageTabs } from "@/app/pharmacy/_components/page-tabs";
import { EmptyState, LatePill, Panel, Pill } from "@/components/tide/work/kit";
import { PRW } from "@/content/pharmacy-rework-patients";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import { tabOf } from "@/lib/pharmacy/ia";
import { smsSender } from "@/lib/pharmacy/sms-sender";
import { remindersData } from "@/lib/pharmacy/sms/read";
import { BuildButton, MessageActions, RuleRow, SendAll } from "./_components/sms-client";

export const dynamic = "force-dynamic";

const S = PRW.sms;

/** Reminders (rework PRD §6.3): today's SMS queue and the rules. Not connected → listed, never sent. */
export default async function RemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = tabOf("reminders", sp.tab);
  const actor = await requirePharmacyActor();
  if (!pharmacyTiersFor(actor.hospitalId).core) return <EmptyState title={PRW.common.tierOff} />;
  const d = await remindersData(actor.hospitalId, tab, new Date().getTime());
  const connected = smsSender() !== null;
  return (
    <div className="flex flex-col gap-4">
      <PageTabs page="reminders" current={tab} />
      <p className="text-body-s">{connected ? S.connected : S.notConnected}</p>
      {d.tab === "rules" ? (
        <Panel title={S.rulesTitle}>
          <ul className="divide-border flex flex-col divide-y">
            {d.rules.map((r) => (
              <li key={r.rule} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{S.rules[r.rule]}</span>
                  <Pill tone={r.enabled ? "passed" : "neutral"}>{r.enabled ? S.on : S.off}</Pill>
                  <span className="ml-auto">
                    <RuleRow rule={r.rule} enabled={r.enabled} en={r.en} lg={r.lg} />
                  </span>
                </div>
                <p className="text-body-s text-ink-700">{r.en ?? S.templates[r.rule]!.en}</p>
                {r.edited ? <p className="text-caption text-muted-foreground">{S.templateDraft}</p> : null}
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground mt-2">{S.lugandaDraft}</p>
        </Panel>
      ) : (
        <Panel
          title={S.queueTitle}
          action={
            <span className="flex flex-wrap gap-2">
              <BuildButton />
              <SendAll ids={d.messages.filter((m) => m.status === "scheduled").map((m) => m.id)} connected={connected} />
            </span>
          }
        >
          {!d.messages.length ? (
            <EmptyState compact title={S.queueNone} next={S.queueNext} />
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {d.messages.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.recipient}</span>
                    <span className="text-body-s text-muted-foreground">
                      {S.rules[m.rule]} · {S.lang[m.lang]}
                    </span>
                    {m.status === "failed" ? <LatePill>{S.status.failed!}</LatePill> : <Pill tone={m.status === "sent" ? "passed" : "neutral"}>{S.status[m.status]!}</Pill>}
                    <span className="ml-auto">
                      <MessageActions id={m.id} status={m.status} connected={connected} />
                    </span>
                  </div>
                  <p className="text-body-s text-ink-700">{m.body}</p>
                  {m.failure || m.cost ? (
                    <p className="text-caption text-muted-foreground">{[m.failure, m.cost ? `${S.cost} ${m.cost}` : null].filter(Boolean).join(" · ")}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
