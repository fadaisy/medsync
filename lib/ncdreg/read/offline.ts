/** What a device keeps for offline work (§9): today's list with trajectories, and the overdue list. */
import "server-only";

import type { OfflineSnapshot } from "../offline/cache";
import { can, type NcdContext } from "../context";
import { loadDataset } from "../indicators/load";
import { modulesOf, trajectory } from "./derive";
import { recallList, todayClinic } from "./views";

export async function offlineSnapshot(ctx: NcdContext): Promise<OfflineSnapshot> {
  const clinic = can(ctx, "person_search") ? await todayClinic(ctx) : { rows: [] };
  const ds = await loadDataset(ctx, clinic.rows.map((r) => r.personId));
  const byId = new Map(ds.persons.map((p) => [p.id, p]));
  const overdue = can(ctx, "recall_work") ? await recallList(ctx) : [];
  return {
    fetchedAt: ctx.enteredAt.toISOString(),
    date: ctx.today,
    clinic: clinic.rows.map((r) => {
      const p = byId.get(r.personId)!;
      return {
        personId: r.personId,
        name: r.identity.name,
        registryNumber: r.identity.registryNumber,
        sex: r.identity.sex,
        age: r.identity.age,
        conditions: r.conditions,
        visitId: r.visitId,
        stage: r.stage,
        heightCm: null,
        glucose: modulesOf(p, ctx.catalogue).some(({ module: m }) => m.visit_fields.some((f) => f.code === "glucose")),
        trajectory: trajectory(p).map((v) => ({
          date: v.date,
          bp: v.bp ? `${v.bp[0]}/${v.bp[1]}` : null,
          glucose: v.glucose ? v.glucose.value.toFixed(1) : null,
          weight: v.weightKg,
        })),
      };
    }),
    overdue: overdue.map((o) => ({
      personId: o.identity.id,
      name: o.identity.name,
      registryNumber: o.identity.registryNumber,
      daysOverdue: o.daysOverdue,
      phoneMasked: o.identity.phones.find((ph) => !ph.invalid)?.masked ?? null,
      demo: o.identity.isSynthetic,
    })),
  };
}
