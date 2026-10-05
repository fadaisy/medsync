import { notFound } from "next/navigation";

import { conditionSettings, definitionVersions, facilityStatus, getSettings } from "@/lib/ncdreg/admin";
import { can } from "@/lib/ncdreg/context";
import { DEMO_CATALOGUE } from "@/lib/ncdreg/demo/source";
import { staffAndRoles } from "@/lib/ncdreg/read/admin-view";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { ALL_CODE_LISTS, MEDICINE_LIST } from "@/lib/ncdreg/standard/code-lists";
import { Page, PageTitle } from "../_components/kit";
import { CatalogueTable, DefinitionVersions, DemoCard, GoLivePanel, RolesPanel, SettingsForm } from "./_components/admin-panels";

export const dynamic = "force-dynamic";

/** Administration (§11.3 item 10): catalogue, code lists, thresholds, settings, roles, demo data, go-live. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "condition_catalogue_manage", "code_list_manage", "demo_data_manage", "ncd_role_assign", "go_live_request", "clinical_safety_approve")) notFound();
  const sp = await searchParams;
  const [status, catalogue, settings, versions, staff] = await Promise.all([
    facilityStatus(ctx),
    conditionSettings(ctx),
    getSettings(ctx),
    definitionVersions(ctx),
    can(ctx, "ncd_role_assign", "condition_catalogue_manage", "go_live_request") ? staffAndRoles(ctx) : Promise.resolve({ staff: [], roles: [] }),
  ]);
  return (
    <Page className="gap-8">
      <PageTitle title="Administration" subline="Registry settings for this facility. Every change is versioned and audited." />
      <DemoCard
        demo={status.demo ? { status: status.demo.status, mode: status.demo.mode, startedAt: status.demo.startedAt.toISOString(), counts: status.demo.counts as Record<string, unknown>, progress: status.demo.progress as Record<string, unknown> } : null}
        copy={DEMO_CATALOGUE.ui_copy}
        modes={DEMO_CATALOGUE.modes.map((m) => ({ id: m.id, label: m.label, description: m.description }))}
        approved={status.approved}
        canManage={can(ctx, "demo_data_manage")}
        initialOpen={sp.demo === "on" ? "on" : sp.demo === "off" ? "off" : null}
      />
      <GoLivePanel
        approved={status.approved}
        request={status.goLive ? { id: status.goLive.id, status: status.goLive.status, requestedBy: status.goLive.requestedBy } : null}
        synthetic={status.syntheticPersons}
        draftCore={status.draftCoreEnabled.map((c) => ctx.catalogue.find((m) => m.code === c)?.label ?? c)}
        canRequest={can(ctx, "go_live_request")}
        canApprove={can(ctx, "clinical_safety_approve")}
        canRemove={can(ctx, "demo_data_manage")}
        me={ctx.userId}
      />
      <CatalogueTable
        approved={status.approved}
        canManage={can(ctx, "condition_catalogue_manage")}
        rows={catalogue.map((c) => ({ code: c.module.code, label: c.module.label, level: c.module.level, status: c.module.status, version: c.module.version, enabled: c.enabled, registrations: c.registrations, versions: c.history.length }))}
      />
      <SettingsForm initial={settings as unknown as Record<string, unknown>} canManage={can(ctx, "code_list_manage")} />
      <DefinitionVersions
        lists={[...ALL_CODE_LISTS.map((l) => ({ id: l.id, label: l.label, version: l.version, status: l.status, codes: l.codes.length })), { id: MEDICINE_LIST.id, label: MEDICINE_LIST.label, version: MEDICINE_LIST.version, status: MEDICINE_LIST.status, codes: MEDICINE_LIST.medicines.length }]}
        versions={versions.map((v) => ({ id: v.id, definitionId: v.definitionId, version: v.version, status: v.status, author: v.author, payload: v.payload }))}
        me={ctx.userId}
        canManage={can(ctx, "code_list_manage")}
      />
      {staff.staff.length || staff.roles.length ? <RolesPanel staff={staff.staff} roles={staff.roles} canAssign={can(ctx, "ncd_role_assign")} /> : null}
    </Page>
  );
}
