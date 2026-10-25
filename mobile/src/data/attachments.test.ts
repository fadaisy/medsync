import { attachmentPath, storedMime } from "@/data/attachments";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("attachments", () => {
  it("keeps a type the bucket takes, guesses one when the picker names none, refuses the rest", () => {
    expect(storedMime("photo", "image/heic")).toBe("image/heic");
    expect(storedMime("video", null)).toBe("video/mp4");
    expect(storedMime("voice", undefined)).toBe("audio/mp4");
    expect(storedMime("photo", "image/gif")).toBeNull();
  });

  it("puts the file in the uploader's folder, under the appointment (0186's path check)", () => {
    expect(attachmentPath("u1", "a1", "video/quicktime", "x")).toBe("u1/a1/x.mov");
  });
});
