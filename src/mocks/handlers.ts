import { delay, http, HttpResponse } from 'msw';
import {
  compareHistoryRecords,
  compareRankingEntries,
  matchConfigFrom,
  matchConfigKey,
  PAGE_SIZE,
  type RegisterMatchBody,
} from '@/api/contracts';
import { getPlayer } from '@/api/player';
import { historyFixtures, rankingFixtures } from '@/mocks/fixtures';
import {
  REQUEST_TIMEOUT_MS,
  getLatencyOverride,
  getScenario,
  latencyFor,
  outOfOrderLatency,
  trackRequest,
} from '@/mocks/scenario';
import { addRecord, findRecord, loadRecords } from '@/mocks/store';
import type { GameEndReason, MatchRecord, PaginatedResponse, RankingEntry } from '@/types/game';

/** Board sizes: enough pages to exercise pagination without noise. */
const FIXTURE_COUNTS = { default: 12, multiPage: 23, historyMultiPage: 14 } as const;

const END_REASONS: GameEndReason[] = ['timeUp', 'playerDead', 'abandoned', 'quit'];

function paginate<T>(items: T[], page: number, limit: number): PaginatedResponse<T> {
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
    hasMore: start + limit < items.length,
  };
}

function pageNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function entryFromRecord(record: MatchRecord): RankingEntry {
  const player = getPlayer();
  return {
    id: `rank-${record.id}`,
    playerId: record.playerId,
    playerName: record.playerId === player.id ? player.name : 'Unknown',
    score: record.score,
    date: record.date,
    matchId: record.id,
    config: record.config,
  };
}

/**
 * Every scenario that must stop the answer before its body, in one place.
 * Returns the response to send, or null when the request should succeed.
 */
async function blocked(kind: 'ranking' | 'history' | 'register'): Promise<Response | null> {
  const scenario = getScenario();
  const offline = scenario === 'network-error' || (scenario === 'offline-at-end' && kind === 'register');
  const unavailable =
    (kind === 'ranking' && scenario === 'ranking-unavailable') ||
    (kind === 'history' && scenario === 'history-unavailable');
  const httpError = scenario === 'server-error';

  if (scenario === 'timeout') {
    await delay(REQUEST_TIMEOUT_MS + 700);
    return HttpResponse.json({ message: 'Answered after the client gave up.' });
  }

  if (offline || unavailable || httpError) {
    await delay(getLatencyOverride() ?? 120);
    if (offline) return HttpResponse.error();
    if (unavailable) {
      return HttpResponse.json({ message: `${kind} is unavailable.` }, { status: 503 });
    }
    return kind === 'register'
      ? HttpResponse.json({ message: 'Match rejected by the server.' }, { status: 422 })
      : HttpResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }

  return null;
}

/** Shared request delay, honouring overrides and the out-of-order scenario. */
async function wait(kind: 'ranking' | 'history', page: number): Promise<void> {
  const scenario = getScenario();
  await delay(scenario === 'out-of-order' ? outOfOrderLatency(page) : latencyFor(kind));
}

export const handlers = [
  http.get('*/api/ranking', async ({ request }) => {
    trackRequest('ranking');
    const stopped = await blocked('ranking');
    if (stopped) return stopped;

    const url = new URL(request.url);
    const page = pageNumber(url.searchParams.get('page'), 1);
    const limit = pageNumber(url.searchParams.get('limit'), PAGE_SIZE);
    const config = matchConfigFrom(
      Number(url.searchParams.get('sessionTimeSeconds')),
      Number(url.searchParams.get('spawnIntervalMs'))
    );
    const scenario = getScenario();

    await wait('ranking', page);

    if (scenario === 'empty') {
      return HttpResponse.json(paginate<RankingEntry>([], page, limit));
    }

    const fixtures = rankingFixtures(
      config,
      scenario === 'multi-page' ? FIXTURE_COUNTS.multiPage : FIXTURE_COUNTS.default
    );
    const ownEntries = loadRecords()
      .filter((record) => matchConfigKey(record.config) === matchConfigKey(config))
      .map(entryFromRecord);
    const entries = [...fixtures, ...ownEntries].sort(compareRankingEntries);

    return HttpResponse.json(paginate(entries, page, limit));
  }),

  http.get('*/api/history', async ({ request }) => {
    trackRequest('history');
    const stopped = await blocked('history');
    if (stopped) return stopped;

    const url = new URL(request.url);
    const page = pageNumber(url.searchParams.get('page'), 1);
    const limit = pageNumber(url.searchParams.get('limit'), PAGE_SIZE);
    const playerId = url.searchParams.get('playerId') ?? '';
    const scenario = getScenario();

    await wait('history', page);

    if (scenario === 'empty') {
      return HttpResponse.json(paginate<MatchRecord>([], page, limit));
    }

    const own = loadRecords().filter((record) => record.playerId === playerId);
    const items =
      scenario === 'multi-page'
        ? [...historyFixtures(playerId, FIXTURE_COUNTS.historyMultiPage), ...own]
        : own;
    items.sort(compareHistoryRecords);

    return HttpResponse.json(paginate(items, page, limit));
  }),

  http.post('*/api/matches', async ({ request }) => {
    trackRequest('register');
    const stopped = await blocked('register');
    if (stopped) return stopped;

    let body: RegisterMatchBody;
    try {
      body = (await request.json()) as RegisterMatchBody;
    } catch {
      return HttpResponse.json({ message: 'Invalid JSON body.' }, { status: 400 });
    }

    const valid =
      typeof body?.id === 'string' &&
      body.id.length > 0 &&
      typeof body?.playerId === 'string' &&
      typeof body?.score === 'number' &&
      Number.isFinite(body.score) &&
      typeof body?.durationMs === 'number' &&
      END_REASONS.includes(body?.endReason) &&
      typeof body?.config?.sessionTimeSeconds === 'number';
    if (!valid) {
      return HttpResponse.json({ message: 'Invalid match payload.' }, { status: 400 });
    }

    // Idempotency: the match id already stored means the client is retrying.
    const existing = findRecord(body.id);
    if (existing) {
      await delay(getLatencyOverride() ?? 120);
      return HttpResponse.json({
        record: existing,
        rankingEntry: entryFromRecord(existing),
        duplicate: true,
      });
    }

    const record: MatchRecord = {
      id: body.id,
      playerId: body.playerId,
      date: typeof body.date === 'string' ? body.date : new Date().toISOString(),
      score: body.score,
      durationMs: body.durationMs,
      endReason: body.endReason,
      config: {
        sessionTimeSeconds: body.config.sessionTimeSeconds,
        enemySpawn: { ...body.config.enemySpawn },
      },
    };
    addRecord(record);

    // `register-timeout`: the record is already stored, the answer is just late.
    await delay(latencyFor('register'));

    return HttpResponse.json(
      { record, rankingEntry: entryFromRecord(record), duplicate: false },
      { status: 201 }
    );
  }),
];
