import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { can } from "@/lib/ncdreg/context";
import { ensureTemplates, LANGUAGE_LABEL, listTemplates, PURPOSE_LABEL, STATUS_LABEL, type TemplatePurpose } from "@/lib/ncdreg/recall/templates";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { EmptyState, Page, PageTitle } from "../../_components/kit";
import { TemplateCard } from "./_components/template-card";

export const metadata: Metadata = { title: "SMS templates" };

/** E5 / I3: the facility's SMS templates. Edit a draft, submit it, and two different people approve it. */
export default async function TemplatesPage() {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "code_list_manage", "sms_template_approve")) notFound();
  if (can(ctx, "code_list_manage")) await ensureTemplates(ctx);
  const templates = await listTemplates(ctx);
  return (
    <Page>
      <PageTitle
        title="SMS templates"
        subline="Only an approved template is ever sent. Approval takes two different people. A message never names a condition, a measurement, a medicine or the department."
        right={
          <Link href="/ncd/recall" className="text-label text-teal-text underline-offset-4 hover:underline">
            Back to Recall
          </Link>
        }
      />
      {templates.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              id={t.id}
              title={`${PURPOSE_LABEL[t.purpose as TemplatePurpose] ?? t.purpose} · ${LANGUAGE_LABEL[t.language] ?? t.language}`}
              body={t.body}
              status={t.status}
              statusLabel={STATUS_LABEL[t.status] ?? t.status}
              version={t.version}
              firstApproved={!!t.firstApprover}
              approvedByMe={t.firstApprover === ctx.userId}
              canEdit={can(ctx, "code_list_manage")}
              canApprove={can(ctx, "sms_template_approve")}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No templates yet">
          <p className="text-body-s text-muted-foreground">A registry lead opening this page creates the English drafts and the empty Luganda slots.</p>
        </EmptyState>
      )}
    </Page>
  );
}
