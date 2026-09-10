/**
 * Worker shell.
 *
 * All the logic is in `simHost.ts`, which knows nothing about workers. This
 * file is the four lines that connect it to one.
 */

import { handle, setPost } from "./simHost.ts";
import type { ToWorker } from "./protocol.ts";

setPost((message) => self.postMessage(message));
self.onmessage = (event: MessageEvent<ToWorker>) => handle(event.data);
