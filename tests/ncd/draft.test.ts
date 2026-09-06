import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Autosave writes to the MUTABLE `clerkship_drafts` scratchpad, never to
 * `clinical_documentation`. That table is append-only and audited, so a write
 * per tab change would put a version on the clinical timeline every few seconds
 * — turning the record a later reader relies on into noise.
 *
 * These tests pin the two things that are easy to get wrong and impossible to
 * notice: that a failed save never takes the page down, and that a draft written
 * against an older catalog cannot smuggle dead keys back into the engine.
 */

const rows: { payload: unknown }[] = [];
const inserted: unknown[] = [];
let failNext = false;

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (failNext) throw new Error('relation "clerkship_drafts" does not exist');
            return rows;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: async () => {
          if (failNext) throw new Error('relation "clerkship_drafts" does not exist');
          inserted.push(v);
        },
      }),
    }),
  },
}));

const live = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/encounter/feature", () => ({ clerkshipDraftsLive: () => live.value }));
vi.mock("server-only", () => ({}));

const { loadNcdDraft, saveNcdDraft } = await import("@/lib/ncd/draft");
const { DIABETES_CATALOG } = await import("@/lib/ncd/catalog/diabetes");
const { recorded } = await import("@/lib/ncd/catalog/schema");

const payload = (values: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  payload: {
    kind: "ncd_capture",
    catalogId: DIABETES_CATALOG.id,
    catalogVersion: DIABETES_CATALOG.version,
    values,
    ...over,
  },
});

afterEach(() => {
  rows.length = 0;
  inserted.length = 0;
  failNext = false;
  live.value = true;
});

describe("loading a draft", () => {
  it("returns what was stored", async () => {
    rows.push(payload({ fpg: recorded(7.4) }));
    await expect(loadNcdDraft("e1", "a1", DIABETES_CATALOG)).resolves.toEqual({
      fpg: recorded(7.4),
    });
  });

  it("treats no draft as an ordinary empty state", async () => {
    await expect(loadNcdDraft("e1", "a1", DIABETES_CATALOG)).resolves.toBeUndefined();
  });

  /**
   * A draft outlives the catalog it was written against — a feature is renamed,
   * a section restructured. A dead key would sit in the record forever,
   * unreadable and uncountable; dropping it makes the question simply reappear
   * unanswered, which is the honest recovery.
   */
  it("drops values whose feature the catalog no longer has", async () => {
    rows.push(payload({ fpg: recorded(7.4), a_field_that_was_removed: recorded(true) }));
    const out = await loadNcdDraft("e1", "a1", DIABETES_CATALOG);
    expect(out).toEqual({ fpg: recorded(7.4) });
    expect(out).not.toHaveProperty("a_field_that_was_removed");
  });

  it("refuses a draft written against a different catalog", async () => {
    rows.push(payload({ fpg: recorded(7.4) }, { catalogId: "hypertension" }));
    await expect(loadNcdDraft("e1", "a1", DIABETES_CATALOG)).resolves.toBeUndefined();
  });

  it("refuses a payload it does not recognise", async () => {
    rows.push({ payload: { some: "other shape" } });
    await expect(loadNcdDraft("e1", "a1", DIABETES_CATALOG)).resolves.toBeUndefined();
  });

  /**
   * Migration 0048 is GATED, so the table may genuinely not exist. An absent
   * draft is a valid state and must never be a broken page.
   */
  it("survives the table not existing", async () => {
    failNext = true;
    await expect(loadNcdDraft("e1", "a1", DIABETES_CATALOG)).resolves.toBeUndefined();
  });

  it("reads nothing while the flag is off", async () => {
    live.value = false;
    rows.push(payload({ fpg: recorded(7.4) }));
    await expect(loadNcdDraft("e1", "a1", DIABETES_CATALOG)).resolves.toBeUndefined();
  });
});

describe("saving a draft", () => {
  it("stores the values under a recognisable, versioned shape", async () => {
    await expect(saveNcdDraft("e1", "a1", DIABETES_CATALOG, { fpg: recorded(7.4) })).resolves.toBe(
      true,
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      encounterId: "e1",
      authorId: "a1",
      payload: {
        kind: "ncd_capture",
        catalogId: DIABETES_CATALOG.id,
        catalogVersion: DIABETES_CATALOG.version,
        values: { fpg: recorded(7.4) },
      },
    });
  });

  /**
   * A failed autosave reports failure and does NOT throw. The values are still
   * in the clinician's browser, and the surface says plainly that the last save
   * did not land — losing a draft must never take the form down with it.
   */
  it("reports a failure instead of throwing", async () => {
    failNext = true;
    await expect(saveNcdDraft("e1", "a1", DIABETES_CATALOG, {})).resolves.toBe(false);
  });

  it("writes nothing while the flag is off", async () => {
    live.value = false;
    await expect(saveNcdDraft("e1", "a1", DIABETES_CATALOG, { fpg: recorded(7) })).resolves.toBe(
      false,
    );
    expect(inserted).toHaveLength(0);
  });
});
