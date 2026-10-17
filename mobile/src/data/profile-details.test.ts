import type { OnFile } from "@/data/profile-details";

import { detailsBody, formFrom, languageOf } from "@/data/profile-details";

jest.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({}) } } }));

const empty: OnFile = {
  idOnFile: false,
  idType: null,
  nokOnFile: false,
  relationship: null,
  titleCode: null,
  preferredLanguage: null,
};

describe("formFrom", () => {
  it("opens on what is on file, ID and next of kin empty", () => {
    const f = formFrom({ ...empty, titleCode: "dr", preferredLanguage: "Luganda" });
    expect(f).toMatchObject({ title: "dr", languageChoice: "Luganda", languageOther: "" });
    expect(f.idNumber).toBe("");
    expect(f.nokName).toBe("");
  });
  it("puts a language not in the chips under Other", () => {
    const f = formFrom({ ...empty, preferredLanguage: "Acholi" });
    expect(f).toMatchObject({ languageChoice: "Other", languageOther: "Acholi" });
    expect(languageOf(f)).toBe("Acholi");
  });
});

describe("detailsBody", () => {
  it("is empty when nothing changed", () => {
    const on = { ...empty, titleCode: "mr" as const, preferredLanguage: "English" };
    expect(detailsBody(formFrom(on), on)).toEqual({});
  });

  it("sends a changed title, including None", () => {
    const on = { ...empty, titleCode: "mr" as const };
    expect(detailsBody({ ...formFrom(on), title: "dr" }, on)).toEqual({ title: "dr" });
    expect(detailsBody({ ...formFrom(on), title: null }, on)).toEqual({ title: null });
  });

  it("sends the Other language as typed, and an empty one to clear", () => {
    const f = { ...formFrom(empty), languageChoice: "Other", languageOther: " Acholi " };
    expect(detailsBody(f, empty)).toEqual({ language: "Acholi" });
    const on = { ...empty, preferredLanguage: "English" };
    expect(detailsBody({ ...formFrom(on), languageChoice: null }, on)).toEqual({ language: "" });
  });

  it("sends an ID only while none is on file", () => {
    const f = { ...formFrom(empty), idType: "passport" as const, idNumber: " B123456 " };
    expect(detailsBody(f, empty)).toEqual({ id: { type: "passport", number: "B123456" } });
    expect(detailsBody(f, { ...empty, idOnFile: true, idType: "nin" })).toEqual({});
  });

  it("sends a next of kin with the phone in E.164, once a name or phone is typed", () => {
    const f = { ...formFrom(empty), nokName: "Amina", nokPhone: "772 000 000" };
    expect(detailsBody(f, empty)).toEqual({
      nok: { name: "Amina", relationship: null, phone: "+256772000000" },
    });
    // A name alone still goes: the server answers with the both-or-neither words.
    expect(detailsBody({ ...formFrom(empty), nokName: "Amina" }, empty).nok?.phone).toBe("");
    expect(detailsBody({ ...formFrom(empty), nokRelationship: "friend" }, empty)).toEqual({});
  });
});
