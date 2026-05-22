// Vitest alias target for Next's `server-only` package — no-op in tests.
// In production, Next.js's bundler enforces server-only at build time; we
// don't need (or want) that enforcement during unit tests.
export {};
