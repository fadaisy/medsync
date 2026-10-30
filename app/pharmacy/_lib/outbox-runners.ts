"use client";

import { saveCountLine } from "../stock/store/count-actions";

/**
 * The writes the outbox may send later, by name. Only count lines: each is an upsert on (sheet, batch), so a late
 * or repeated send is harmless. A hand-over needs the server's identifier check, so offline it goes on the paper
 * downtime sheet instead.
 */
export const RUNNERS = { saveCountLine: (p: unknown) => saveCountLine(p) };
