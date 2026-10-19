import { requestId } from "@/lib/edge";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("requestId", () => {
  it("is a version-4 UUID, which the audit log's uuid column takes", () => {
    const ids = Array.from({ length: 50 }, requestId);
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
