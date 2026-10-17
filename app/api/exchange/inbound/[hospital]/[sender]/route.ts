import { after, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { bearer, readCapped } from "@/lib/exchange/http";
import { parseSenderTime } from "@/lib/exchange/outbox";
import { authenticate, processInbound, SCOPE, storeInbound } from "@/lib/exchange/store";
import { labExchangeLiveFor } from "@/lib/lab/feature";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX = 1024 * 1024;
const CHANNEL: Record<string, "fhir" | "hl7v2" | "astm" | "file"> = {
  "application/fhir+json": "fhir",
  "application/json": "fhir",
  "x-application/hl7-v2+er7": "hl7v2",
  "application/x-astm": "astm",
};

/**
 * The inbound exchange endpoint (Lab Phase 4 §8; EX-2, EX-3): the sender's token, then the message is committed
 * before anything is acknowledged; the 202 means "we hold it", never "it is filed". A duplicate is acknowledged
 * and not processed again. Processing runs after the response; if it dies, the sweep picks the message up (S29).
 * No patient detail is logged.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ hospital: string; sender: string }> },
) {
  const p = await params;
  if (!z.uuid().safeParse(p.hospital).success || !z.uuid().safeParse(p.sender).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!labExchangeLiveFor(p.hospital))
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const channel =
    CHANNEL[(request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase()];
  if (!channel) return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  const raw = await readCapped(request, MAX);
  if (raw === null || raw.length === 0)
    return NextResponse.json({ error: "payload_too_large_or_empty" }, { status: 413 });
  const now = new Date();
  try {
    const stored = await db.transaction(async (tx) => {
      const who = await authenticate(tx, {
        token,
        scope: SCOPE.inbound,
        senderId: p.sender,
        hospitalId: p.hospital,
        now,
      });
      if (!who) return null;
      const given = request.headers.get("x-sender-time");
      return storeInbound(tx, {
        senderId: who.senderId,
        channel,
        contentType: request.headers.get("content-type")!.split(";")[0]!.trim(),
        raw,
        externalId: request.headers.get("x-message-id")?.slice(0, 200) ?? null,
        senderTime: given?.slice(0, 40) ?? null,
        senderTimeUtc: given ? (parseSenderTime(given, who.zone)?.utc ?? null) : null,
      });
    });
    if (!stored) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!stored.duplicate)
      after(() =>
        db
          .transaction((tx) => processInbound(tx, stored.messageId, new Date()))
          .catch((e: unknown) =>
            logger.error("exchange.process.failed", {
              messageId: stored.messageId,
              kind: e instanceof Error ? e.name : "unknown",
            }),
          ),
      );
    return NextResponse.json(
      { messageId: stored.messageId, duplicate: stored.duplicate },
      { status: 202 },
    );
  } catch (e) {
    // Not stored: the sender must retry (EX-2).
    logger.error("exchange.store.failed", { kind: e instanceof Error ? e.name : "unknown" });
    return NextResponse.json({ error: "not_stored_retry" }, { status: 503 });
  }
}
