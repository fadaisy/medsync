import { describe, expect, it } from "vitest";

import { LABEL_PROMPT, readLabel } from "@/app/api/mobile/food-label/_lib/read";

describe("reading a nutrition label photo (ADR 0357)", () => {
  it("asks for what is printed, per 100 g first, nothing guessed", () => {
    expect(LABEL_PROMPT).toMatch(/Do not guess/);
    expect(LABEL_PROMPT).toMatch(/per 100 g/);
  });

  it("takes a per-100 g column as printed", () => {
    expect(
      readLabel('{"name":"Biscuits","per":"100","kcal":480,"carbs":68.4,"protein":7,"fat":20,"fibre":null}'),
    ).toEqual({ ok: true, name: "Biscuits", kcal: "480", carbs: "68.4", protein: "7", fat: "20" });
  });

  it("scales per-serving values by the serving size, and refuses without one", () => {
    expect(readLabel('{"per":"serving","serving_g":30,"kcal":150,"carbs":20,"protein":3}')).toEqual({
      ok: true,
      servingG: "30",
      kcal: "500",
      carbs: "66.7",
      protein: "10",
    });
    expect(readLabel('{"per":"serving","serving_g":null,"kcal":150,"carbs":20}')).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("uses kJ only when there is no kcal", () => {
    expect(readLabel('{"per":"100","kcal":null,"kj":1674,"carbs":10}')).toMatchObject({ kcal: "400" });
  });

  it("drops what 100 g cannot hold, and anything that is not a label", () => {
    expect(readLabel('{"per":"100","kcal":1200,"carbs":10}')).toMatchObject({ ok: false });
    expect(readLabel('{"per":"serving","serving_g":10,"kcal":50,"carbs":15}')).toMatchObject({ ok: false });
    expect(readLabel('{"unreadable": true}')).toMatchObject({ ok: false });
    expect(readLabel("no json here")).toMatchObject({ ok: false });
  });
});
