# Pirate Battle — solution (React + PixiJS)

Single-player browser naval battle: a timed arena match against Chasers and
Shooters among islands, plus a leaderboard and match history backed by REST
APIs mocked with MSW and consumed through Axios + TanStack Query.

- **Stack:** React 18 · TypeScript · Vite 5 · PixiJS 8 · TanStack Query 5 ·
  Axios · MSW 2 · Playwright
- **Documentation:** [`ARCHITECTURE.md`](ARCHITECTURE.md) (decisions,
  React/Pixi integration, limitations) · [`DESAFIO.md`](DESAFIO.md) (original
  brief, in Portuguese) · [`step.txt`](step.txt) (phase log)
- **Deploy:** public URL — *pending* (see [Deploy](#deploy))

---

## Setup

Requirements: **Node 18+** (20 recommended) and npm.

```bash
npm ci                       # install from lockfile
npx playwright install chromium   # only needed to run the test suites
npm run dev                  # http://localhost:5173
```

**Environment variables:** none required — the game runs 100% in the browser
with local mocks. Vite supports `.env` files, but the code consumes no keys
(`.env*` is listed in `.gitignore`, keeping only `.env.example` should one ever
be needed).

Publishable build (static, no backend):

```bash
npm run build     # tsc + vite build -> dist/
npm run preview   # serves dist/ on http://localhost:4173
```

The MSW Service Worker is served from `public/`, so any static host works with
no extra configuration.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server with hot reload (Vite) |
| `npm run build` | typecheck + production build into `dist/` |
| `npm run preview` | serve the local `dist/` build |
| `npm run lint` | ESLint (config in `eslint.config.js`) |
| `npm run typecheck` | type check (`tsc -b`, no emit) |
| `npm run test` | Playwright: desktop **and** mobile projects |
| `npm run test:e2e` | Playwright, `desktop` project only |
| `npm run test:mobile` | Playwright, `mobile` project only (Pixel 5 landscape) |
| `npm run test:perf` | performance suite (3-minute match + memory cycles) |
| `npm run report` | open the HTML report of the last run |

The suites start the preview server themselves (`webServer` in
`playwright.config.ts`: `npm run build && npm run preview` on port 4173) — from
a clean checkout, `npm ci && npx playwright install chromium && npm run test:e2e`
is enough.

## Controls

### Keyboard

| Action | Keys |
| --- | --- |
| Throttle | `W` or `↑` |
| Turn left | `A` or `←` |
| Turn right | `D` or `→` |
| Front shot | `Space` or `J` |
| Left broadside (3 projectiles) | `Q` or `F` |
| Right broadside (3 projectiles) | `E` or `H` |
| Pause / resume | `P` or `Esc` |

The match pauses automatically when the window/tab loses focus; on resume,
keys still held do nothing until released and pressed again (no accumulated
input). While a match is running, keys are only captured while the gameplay
context is active.

### Touch (coarse-pointer devices)

On-screen pads: left cluster (turn left, throttle, turn right) and right
cluster (left broadside, front shot, right broadside). Multi-touch is tracked
per finger (each pad captures its own pointerIds), so steering and firing can
happen at the same time. In portrait, a rotate-your-device hint covers the
match.

## Gameplay configuration

Menu → **Options**:

- **Game session time:** match duration, 60–180 s (default 120).
- **Enemy spawn time:** interval between spawns, 500–10000 ms (default 3000).

The limits are shown in the form itself; out-of-range values raise an
accessible error (`role="alert"`) and keep the form open. Choices are
validated and persisted in `localStorage` (`pirate-battle.options`) across
refreshes; each match snapshots the configuration at start, so later edits
only apply to the next match.

Other local data: `pirate-battle.last-result` (the "Last match" card),
`pirate-battle.player-id` / `player-name`, `pirate-battle.records`
(idempotent record ids) and `pirate-battle.pending-registrations` (the queue
that survives refresh/offline).

## Network scenarios (MSW)

In the menu, the **Network scenarios (mock API)** block (below the tabs):

- **Scenario** — one of the 13 scenarios below;
- **Seed** — PRNG seed (fixtures and "random" delays become deterministic,
  default `1337`);
- **Latency override (ms)** — forces a fixed delay (empty = scenario default);
- **Reset state** — clears scenario/seed/latency, restores the record store
  to the fixtures and empties the pending registration queue.

Everything can also be pinned through the URL before opening the game:

```
/?scenario=register-timeout&seed=42&latency=0
```

| id (`?scenario=`) | Behaviour |
| --- | --- |
| `success` | normal responses (default) |
| `empty` | empty leaderboard and history |
| `multi-page` | large fixtures, several pages in both tabs |
| `slow` | every response takes ~1.8 s |
| `variable-latency` | seeded random delay (150–1400 ms) |
| `out-of-order` | odd pages are slow; late answers arrive last |
| `timeout` | queries never answer within the client budget (3 s) |
| `network-error` | connection failure everywhere |
| `server-error` | GETs answer 500, registration is rejected with 422 |
| `ranking-unavailable` | leaderboard 503, history works |
| `history-unavailable` | history 503, leaderboard works |
| `register-timeout` | the record is stored, but the answer arrives after the client timeout |
| `offline-at-end` | the connection drops at the end of the match |

### How to reproduce failures

1. **Pending registration that recovers:** scenario `network-error` → play to
   the end → the result joins the queue (the "waiting to register" notice
   shows) → refresh → queue intact → switch to `success` → reload: everything
   registers **exactly once** (idempotent through the client-generated id).
2. **Registration timeout:** `?scenario=register-timeout` → end of match →
   state "Registration failed — it stays queued" → click **Retry
   registration** → it answers quickly (the record already exists) and never
   duplicates.
3. **Offline at the end of the match:** `offline-at-end` → end → failure →
   switch back to `success` and use **Retry registration**.
4. **A late answer never overwrites the current page:** `out-of-order` →
   paginated tabs (page 3 answers fast, the slow answer for page 1/2 arrives
   afterwards and is discarded).
5. **An error in a single tab:** `ranking-unavailable` → the Ranking tab shows
   an error with a retry button while Match History keeps working (and vice
   versa).
6. **Empty/loading:** `empty` (empty lists) and `slow` (loading state).
7. **A query that never answers:** `timeout` → the tab exhausts the TanStack
   Query retries and shows an error with a retry button.

## Tests (Playwright)

```bash
npm run test:e2e     # desktop (63 tests)
npm run test:mobile  # mobile (63 tests)
npm run test         # both projects (126 tests)
```

- **Reports:** HTML in `reports/playwright-report/` (`npm run report`),
  structured results in `reports/results.json`.
- **Traces and screenshots:** on failure, `test-results/<case>/trace.zip`
  (open with `npx playwright show-trace <file>`).
- **Visual regression:** `tests/e2e/visual.spec.ts` compares the menu, a
  stable arena state and the result screen against baselines versioned per
  project in `tests/e2e/visual.spec.ts-snapshots/`. After an intentional
  visual change:
  `npx playwright test --grep "main menu|arena|result screen" --update-snapshots`
  (review the diff before committing).
- **Run a single test:**
  `npm run test:e2e -- --grep "test name"`; console output with
  `npm run test:e2e -- --reporter=list`.
- **Isolation:** every test opens its own context/`localStorage`; scenario
  and seed are pinned per test; the suite runs against the **production
  build** (the same condition as the deploy).
- **Test instrumentation:** `window.__pirateBattle`
  (`simulation`, `input`, `renderer`, `app`) observes state and injects input,
  `window.__pirateBattleNet` controls scenario/seed/latency. Combat tests
  drive the game's real controls (they never apply damage directly to the
  simulation), so rules, collisions and rendering all run for real.

Suites: navigation/options (01), failing assets and retry (02), movement and
arena (03), weapons/cooldown/scoring (04), enemies and spawn (05), match end
(06), pause/focus (07), result and persistence (08), abandon/navigation and
touch (09), tabs with loading/empty/error/pagination (10), registration and
the pending queue (11), idempotent retries and out-of-order answers (12) and
visual regression.

## Performance

```bash
npm run test:perf
```

Runs against the optimized build and writes into `reports/`:

- `performance.md` / `performance.json` — average FPS, p95 frame time and
  peak entities in a real three-minute match; memory across five
  start → play → leave cycles (looking for unbounded resource growth), plus
  hardware, browser, resolution, configuration used and observed
  limitations.

## Deploy

`dist/` is static (React + Pixi + the MSW worker in `public/`): it runs on
Vercel, Netlify or Cloudflare Pages with no environment variables.

```bash
npm run build   # publish dist/
```

**Public URL:** _to fill in on publication (required for the delivery)._

## Debug scripts

No standalone script is needed to run or validate the project — everything
goes through the commands in the table above and the suites in `tests/`.
