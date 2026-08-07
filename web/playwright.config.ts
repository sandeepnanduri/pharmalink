import { defineConfig, devices } from '@playwright/test';

const PORT = 3210;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // shared SQLite fixture — keep runs deterministic
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `next start` serves the LAST build — always rebuild, or the suite silently
    // tests a stale bundle (new routes 404 and failures look like app bugs).
    // CLEAR .next first: an incremental rebuild over a stale cache can emit an
    // inconsistent React Client Manifest after client-component changes ("Could
    // not find module X#Component in the React Client Manifest"), which surfaces
    // as a bogus server-side-exception on the affected page. A clean build fixes it.
    // Reseed too: the seed clears all tables itself (deleteMany), so no
    // destructive `--force-reset` is needed.
    command: `node -e "require('fs').rmSync('.next',{recursive:true,force:true})" && npx prisma db push --skip-generate && npm run db:seed && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: false,
    timeout: 300_000,
    // Tests get their OWN database file. Sharing dev.db meant the suite wiped
    // and mutated the very data someone was looking at in `npm run dev` — a
    // moderation test would hold a listing and it would vanish from their
    // browser. Test data and demo data must never be the same rows.
    env: {
      DATABASE_URL: 'file:./test.db',
      // Pin the auth origin to THIS server. `.env` may carry a deployment
      // AUTH_URL (e.g. a public tunnel hostname) and Next loads it here too —
      // Auth.js would then bounce every sign-in to that external origin, so the
      // suite loses its session and every logged-in test fails with a bare
      // "current-user not found". Test env must never inherit deploy env.
      AUTH_URL: `http://localhost:${PORT}`,
      NEXTAUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
