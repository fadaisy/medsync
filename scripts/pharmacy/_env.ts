/**
 * Load the env before anything else is imported (owner item 5): a catalogue script's imports reach lib/env, which
 * validates at import, before runCli would load the env. This folder's .env files, or a worktree's main checkout's,
 * exactly as runCli and `npm run db:migrate` choose them. Import it first, for its side effect only. It does
 * nothing when a test imports the script's core: only a script run from the command line reads the env files.
 */
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

import { envFiles } from "../migrate";

if (/scripts[\\/]pharmacy[\\/][^\\/]+\.ts$/.test(process.argv[1] ?? "")) {
  let common: string | null = null;
  try {
    common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // not a git checkout: only this folder's env files
  }
  for (const f of envFiles(process.cwd(), common ? dirname(common) : null)) process.loadEnvFile(f);
}
