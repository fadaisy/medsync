/**
 * Assemble the single-file preview.
 *
 *   npm run build:single
 *
 * Takes the one-chunk build from `dist-single/` and writes a self-contained
 * page: the stylesheet in a <style>, the bundle in an inline module <script>,
 * the favicon as a data URI. No external requests of any kind, so it runs from
 * a file, a static host, or anywhere a page is allowed to run inline script.
 *
 * The output omits <!doctype>, <html>, <head> and <body> because the Artifact
 * host supplies those.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const dir = "dist-single";

// Vite's worker plugin emits a worker file whenever it sees the
// `new Worker(new URL(...))` pattern in the source, even when the branch
// containing it has been removed as dead code. The check at the end of this
// script confirms the bundle does not actually reference it.
const stray = (await readdir(join(dir, "assets")).catch(() => [])).filter((f) => f.endsWith(".js"));

const js = await readFile(join(dir, "bench.js"), "utf8");
const css = await readFile(join(dir, "bench.css"), "utf8");
const favicon = await readFile("public/favicon.svg", "utf8");

// A literal </script> inside the bundle would end the inline script early. In
// JavaScript source that sequence can only occur inside a string or a comment,
// so escaping the slash is safe and changes no behaviour.
const safeJs = js.replaceAll("</script", "<\\/script");

const html = `<title>Bionic islet sensor bench</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;utf8,${encodeURIComponent(favicon)}" />
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`;

const out = "dist-single/bench-preview.html";
await writeFile(out, html, "utf8");

const bytes = Buffer.byteLength(html, "utf8");
console.log(`${out}`);
console.log(`  stylesheet  ${(css.length / 1024).toFixed(1)} kB`);
console.log(`  script      ${(js.length / 1024).toFixed(1)} kB (one chunk, no worker file)`);
console.log(`  total       ${(bytes / 1024).toFixed(1)} kB in a single page`);
if (safeJs.includes("new Worker(")) {
  console.error("  WARNING: the bundle still constructs a Worker");
  process.exitCode = 1;
}
if (/\bfrom\s*["']\.\//.test(safeJs) || /import\(["']\.\//.test(safeJs)) {
  console.error("  WARNING: the bundle still references a relative module");
  process.exitCode = 1;
}
