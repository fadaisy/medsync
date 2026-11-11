// `npm run dev`: loads the local switches in .env.switches (gitignored), then starts next dev.
try {
  process.loadEnvFile(".env.switches");
} catch {}
await import("next/dist/bin/next");
