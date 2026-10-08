# Architecture

Pirate Battle — React + TypeScript (strict) + PixiJS 8.22. Vite build, `@` → `src` alias.

## Layers

```
src/
  config/       gameConfig.ts — timers, cooldowns, speeds, spawn rules (single source of truth)
  game/         simulation (pure logic, no rendering)
    simulation.ts   orchestrator: start/pause/resume/end/reset, score, end reason
    input.ts        GameInput buffer (held/suppressed/pressed)
    arena.ts        bounds + island geometry, hit tests, free spawn points
    systems/        movement, weapons, ai, projectiles, spawning, effects
  pixi/         rendering (reads simulation state only)
    PixiApp.tsx     canvas, camera, letterbox, antialias:false
    GameRenderer.ts ships, projectiles, health bars, effects, tiles
    assetLoader.ts  manifest → Pixi Assets
  ui/           React screens, HUD, overlays, styles
    screens/        MenuScreen, OptionsScreen, GameScreen, ResultScreen
    components/     GameHud, TouchControls, Pager, RankingPanel,
                    HistoryPanel, NetworkPanel
    shell.css       menu/options shell, 9-slice panel, touch pads, data
                    tables, pager, network panel, orientation
    game.css        HUD, overlays, controls legend
    storage.ts      PlayerOptions + MatchResult in localStorage
  api/          network layer (Axios + TanStack Query + registration queue)
    client.ts       axios instance (baseURL '/api', 3s timeout), describeError
    player.ts       player identity in localStorage, createId()
    contracts.ts    matchConfigKey, ranking/history comparators, register DTOs
    queryClient.ts  staleTime/gcTime/retry policy (isRetryable)
    queries.ts      useRanking / useHistory (keepPreviousData)
    registrationQueue.ts  pending registrations persisted in localStorage
    registration.tsx      RegistrationProvider + useRegistration hook
  mocks/        MSW layer (works in dev and in the published build)
    scenario.ts     13 scenarios, seed/latency knobs, window.__pirateBattleNet
    handlers.ts     GET /api/ranking, GET /api/history, POST /api/matches
    fixtures.ts     deterministic ranking/history fixtures (ties included)
    store.ts        recorded matches, idempotent by client-generated id
    browser.ts      setupWorker, started in main.tsx
```

The simulation never imports Pixi; the renderer never mutates simulation state.
React reads simulation snapshots for the HUD and pushes intents through
`GameInput` / `GameSimulation` methods.

## Time units

- `GameSimulation.step(dtMs)` / `update(dtMs)` — milliseconds from the game loop.
- Physics (`integrateShip`, `steerToward`, projectile travel) — **seconds**
  (`dt = dtMs / 1000`, converted at the `simulation.ts` boundary and inside
  `updateProjectiles(ctx, dtMs)`).
- Cooldowns, effect `ageMs`, `spawnTimerMs`, `timeRemainingMs` — **milliseconds**.

The loop runs delta-time with sub-stepping (cap per frame), so behaviour is
identical at 10 fps or 144 fps. Headless CI here is fill-rate bound
(SwiftShader): `antialias: false` in `PixiApp.tsx`; render work is < 0.2 ms JS.

## Input

`GameInput` holds three sets: `held`, `suppressed`, `presses`.

- `suppressHeld()` is called on resume: keys still down do nothing until
  released and pressed again → no input accumulates across pause.
- `consumePress(action)` latches a press: a tap that starts and ends between
  two simulation steps still fires exactly once (firing uses
  `consumePress || isDown`). Movement/turning read `isDown` only.
- Paused/ended phases ignore input entirely; blur and tab-hide pause the match.

## HUD sync

React owns no gameplay state. `GameScreen.tsx` polls the simulation each frame
and mirrors it into local state (`syncHud`) — health, timer, score, phase —
while Pixi renders the world from the same snapshot.

Test hook (dev only): `window.__pirateBattle = { simulation, input, app, renderer }`.

## End of match

`phase` machine: `ready → running → paused → ended`. Reasons: `'timeUp'`,
`'playerDead'`, `'abandoned'` (leave from the pause dialog), `'quit'`. On end,
input is reset and the loop stops advancing the simulation. `startMatch` /
`restartMatch` rebuild the full state (enemies, projectiles, effects, score,
hull, timer).

## Screens and state machine

`App.tsx` owns three mutually exclusive screens — `menu | options | match`.
Only one is mounted at a time, so leaving the match unmounts `GameScreen` and
its cleanup stops the loop, destroys the Pixi renderer, drops the global
listeners and clears `window.__pirateBattle`.

`Play` reads `PlayerOptions` from storage and builds the match config with
`createGameConfigSnapshot({ sessionTimeSeconds, enemySpawn: { intervalMs } })`.
Each match therefore uses the options valid at start; editing Options later
only affects the next match.

## Local persistence

`ui/storage.ts` keeps `pirate-battle.options` and `pirate-battle.last-result`
in localStorage with validation and defaults on read. Gameplay never reads
storage.

`GameScreen` builds the `MatchResult` in a `useLayoutEffect` when the phase
becomes `ended` (so the dialog paints in the same frame) and calls `onFinished`
exactly once per match — `finishSentRef`, cleared by start/restart — but only
for `timeUp` / `playerDead`: an abandoned match is never stored as the last
result. `App.handleFinished` writes it with `saveLastResult`, which feeds the
menu card; the Match History shown in the menu comes from the API (below).

## Data layer

`GET /api/ranking?sessionTimeSeconds&spawnIntervalMs&page&limit` and
`GET /api/history?playerId&page&limit` are read through TanStack Query; the
body of `POST /api/matches` is `RegisterMatchBody` (client-generated `id`,
player, date, score, duration, end reason, `config`). Matches only compare
against each other when `matchConfigKey` (`sessionTimeSeconds:intervalMs`) is
equal, and both lists use deterministic comparators — ranking: score desc →
date asc → id asc; history: date desc → id asc — so equal scores never
reorder between renders.

The query client retries a GET only on 408/429/5xx or a missing response
(`isRetryable`, at most twice); mutations retry once. `useRanking` /
`useHistory` use `placeholderData: keepPreviousData`, so paging keeps the
previous rows on screen while the next page loads and a slow answer never
replaces a newer page.

Registration goes through `api/registration.tsx`: `register(result)` builds
the record, appends it to the queue in localStorage **before** the POST, and
mutates the query. On success it removes the record and invalidates
`['ranking']` + `['history']` (both tabs refresh); on failure it bumps
`attempts` and keeps the record, so a network error never blocks the game —
the player can start another match, and a page refresh re-sends the whole
queue. The id is generated on the client, which makes `POST /api/matches`
idempotent: a duplicate answer does not create a second record.

## Mock scenarios (MSW)

`mocks/scenario.ts` picks one of 13 responses for every endpoint
(`success`, `empty`, `multi-page`, `slow`, `variable-latency`,
`out-of-order`, `timeout`, `network-error`, `server-error` → GET 500 / POST
422, `ranking-unavailable`, `history-unavailable`, `register-timeout`,
`offline-at-end`) and can be pinned with `?scenario=`, `?seed=` (mulberry32
fixtures) and `?latency=` on the URL. Delays are base 120 ms, slow 1800 ms,
variable 150–1400 ms; `out-of-order` answers odd pages slowly so a late
response can never overwrite the page the user is looking at.
`window.__pirateBattleNet` exposes scenario/seed/latency/request counters to
the test suites, and `NetworkPanel` switches scenarios (plus a state reset)
at runtime. The worker is registered in `main.tsx`, so the same mocks run in
the published build.

## Touch controls

`ui/components/TouchControls.tsx` renders six pads: turn-left / forward /
turn-right on the left, fire-left / fire-front / fire-right on the right. Every
pad tracks its own set of `pointerId`s and calls `setPointerCapture`, so a
finger sliding off still releases where it started, two thumbs can hold two
pads at once, and the action only goes up when the last finger lifts. Pads push
the same `GameAction` vocabulary into `GameInput`, so latching, suppression and
`consumePress` behave exactly like the keyboard.

The pads are `tabIndex=-1` buttons inside an `aria-hidden` container (they
duplicate the keyboard controls) and `shell.css` shows them only under
`@media (pointer: coarse)`, which also hides `.controls-legend`. Landscape is
the supported orientation: portrait + coarse pointer displays `.rotate-hint`
over the match.

## Limitations and balance decisions

Every gameplay number lives in `config/gameConfig.ts` as typed data, so a
balance change never touches system code; `createGameConfigSnapshot` deep-clones
the defaults plus per-match overrides, and `validateGameConfig` enforces the
documented bounds.

**Balance decisions**

- **Session and spawns:** 120 s matches (60–180) and a 3000 ms spawn interval
  (500–10000) are the two knobs exposed in Options — the defaults produce a
  readable ~40-spawn match without swarming. Spawns pick a free point at least
  250 px from the player (10 tries), split 60 % chaser / 40 % shooter, so the
  player always has room to react.
- **Player:** hull 100, top speed 220, turn rate π rad/s, 500 ms of
  invulnerability after (re)spawn. The front cannon is a fast single shot
  (damage 10, cooldown 250 ms, range 500); each broadside fires 3 projectiles
  with a 0.15 spread (damage 8, cooldown 400 ms, range 400) — wider coverage
  at the cost of reach, rewarding positioning over kiting.
- **Enemies:** chasers are glass cannons that close fast (hull 40, speed 180)
  and ram for 20 damage (worth 1 point); shooters hold at 220 px — just inside
  the player's broadside reach — and fire 15 damage every 1200 ms (hull 60),
  so pushing one is a real trade-off. Enemy projectile damage (15) vs player
  hull (100) gives ~6 clean hits before death, enough to recover from a
  mistake in a two-minute match.
- **Arena:** a fixed 1280×720 world with seven islands that block ships and
  cannonballs (`islandCollision: true`, 40 px bounds padding), which turns the
  layout into cover and keeps fights local.

**Limitations**

- **Frontend-only delivery:** the published build runs the MSW worker, so the
  leaderboard/history/registration API is a local mock store — there is no
  real backend, auth or cross-device identity (the player id is generated
  client-side into localStorage).
- **Performance environment:** the reference host renders headless Chromium
  through SwiftShader (software WebGL), averaging ≈7 fps at 1280×800
  (`reports/performance.md`). The simulation is delta-time, so gameplay
  behaviour is frame-rate independent; on hardware with a GPU the fill-rate
  bound disappears (render JS is < 0.2 ms/frame).
- **Input scope:** keyboard + the six touch pads only — no gamepad. Coarse
  pointer devices are supported in landscape; portrait shows the rotate hint
  instead of a portrait layout.
- **Network simulation:** the 13 scenarios cover latency, timeouts, HTTP
  errors and ordering, but not packet loss or bandwidth shaping; seeded delays
  make even the "random" ones deterministic.
- **Single-player only:** no multiplayer, replays or leaderboards beyond the
  mock ranking filtered by configuration.
