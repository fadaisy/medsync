import { existsSync } from "node:fs";

// Load .env then .env.local so Supabase URLs / keys are populated before any
// test imports the supabase client. Node 20.12+ has process.loadEnvFile.
for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}
