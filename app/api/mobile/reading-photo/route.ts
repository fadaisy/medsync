import { NextResponse } from "next/server";
import { z } from "zod";

import { patientFromBearer } from "@/app/api/mobile/visit-summaries/_lib/caller";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { allow } from "@/lib/onboarding/rate-limit";
import { PHOTO_KINDS, promptFor, readReply } from "./_lib/read";

export const dynamic = "force-dynamic";

/** The smallest current Claude model: a few digits off a screen need no more. */
const MODEL = "claude-haiku-5-5";
/** A phone photo shrunk to 1024 px is well under this; anything bigger is not one. */
const MAX_BASE64 = 2_000_000;

const Body = z.object({
  kind: z.enum(PHOTO_KINDS as ["bp", "sugar", "weight"]),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  image: z.string().min(100).max(MAX_BASE64),
});

/**
 * POST { kind, mime, image (base64) } → the boxes to fill, or why not
 * (ADR 0352). The patient's own photo of their own device's screen, read by
 * Claude and never stored: not here, not in a log. Signed-in patients only,
 * ten a minute. The phone shows the numbers in the boxes for the patient to
 * check; nothing is saved from here.
 */
export async function POST(request: Request) {
  if (!(await allow("mobile-reading-photo", 10)))
    return NextResponse.json({ error: "Too many photos. Wait a minute and try again." }, { status: 429 });
  const caller = await patientFromBearer(request);
  if (!caller.ok) return caller.response;
  if (!env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "Reading photos isn't switched on yet. Type the numbers instead." },
      { status: 503 },
    );

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "That photo couldn't be read. Try another." }, { status: 400 });
  const { kind, mime, image } = parsed.data;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 120,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mime, data: image } },
              { type: "text", text: promptFor(kind) },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      logger.warn("mobile.reading_photo.upstream", { status: res.status });
      return NextResponse.json(
        { error: "Couldn't read the photo just now. Type the numbers instead." },
        { status: 502 },
      );
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (body.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("");
    return NextResponse.json(readReply(kind, text));
  } catch (e) {
    logger.warn("mobile.reading_photo.failed", { reason: String(e) });
    return NextResponse.json(
      { error: "Couldn't read the photo just now. Type the numbers instead." },
      { status: 502 },
    );
  }
}
