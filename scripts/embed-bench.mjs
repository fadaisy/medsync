/**
 * Copy the built sensor bench into public/bioniccell/.
 *
 *   npm run bench:embed
 *
 * The bench is a separate Vite application with its own toolchain. Rather than
 * making the MedSync build depend on it — a failed bench build would then take
 * the hospital application down with it — the built output is copied into
 * public/ and committed. Next serves public/ verbatim, so the bench is static
 * files on the same deployment, behind the same domain, at /bioniccell.
 *
 * Run this whenever the bench changes. It is deliberately not part of
 * `next build`.
 */
import { existsSync } from "node:fs";
import { cp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const from = "bionic-islet-bench/dist";
const to = "public/bioniccell";

if (!existsSync(from)) {
  console.error(`No build found at ${from}.`);
  console.error(
    "Run: npm --prefix bionic-islet-bench install && npm --prefix bionic-islet-bench run build",
  );
  process.exit(1);
}

await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });
// The bench's own robots.txt would land at /bioniccell/robots.txt, where it
// means nothing. The application serves the real one from app/robots.ts.
await rm(join(to, "robots.txt"), { force: true });

let bytes = 0;
const walk = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else bytes += (await stat(path)).size;
  }
};
await walk(to);

console.log(`${from} -> ${to}`);
console.log(`  ${(bytes / 1024).toFixed(0)} kB, served at /bioniccell`);
