import { matchConfigFrom, matchConfigKey, type MatchConfig } from '@/api/contracts';
import { DEFAULT_GAME_CONFIG } from '@/config/gameConfig';
import { mulberry32 } from '@/mocks/scenario';
import type { MatchRecord, RankingEntry } from '@/types/game';

const FIXTURE_NAMES = [
  'Black Anne',
  'Calico Jack',
  'Dread Mary',
  'Horned Grace',
  'Mad Anne',
  'Red Legs',
  'Sea Wolf',
  'Silver Bill',
  'Storm Jane',
  'Barnacle Ben',
  'Cannon Kate',
  'Driftwood Dan',
  'Gull Wing',
  'Iron Patch',
  'Cutlass Ruth',
  'Salt Sue',
];

/** Repeated scores so equal scores are common and the tie-break shows up. */
const FIXTURE_SCORES = [
  74, 74, 61, 61, 61, 48, 48, 36, 36, 36, 25, 25, 18, 12, 12, 9, 9, 9, 6, 4, 4, 3, 1,
];

const FIXTURE_BASE_MS = Date.UTC(2026, 9, 1, 12, 0, 0);

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isoAt(offsetMs: number): string {
  return new Date(FIXTURE_BASE_MS - offsetMs).toISOString();
}

/**
 * Other players' ranking entries for a given configuration. Seeded by the
 * config key, so the same configuration always yields the same board, and
 * independent from the local player's own records (those come from storage).
 */
export function rankingFixtures(config: MatchConfig, count: number): RankingEntry[] {
  const configKey = matchConfigKey(config);
  const random = mulberry32(hashString(configKey) ^ 0x9e3779b9);
  const offset = Math.floor(random() * FIXTURE_NAMES.length);
  const entries: RankingEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    const name = FIXTURE_NAMES[(offset + index) % FIXTURE_NAMES.length];
    const score = FIXTURE_SCORES[index % FIXTURE_SCORES.length];
    entries.push({
      id: `fx-${configKey}-${index}`,
      playerId: `fixture-${index % 9}`,
      playerName: name,
      score,
      date: isoAt(index * 4 * 60 * 60 * 1000),
      matchId: `fxm-${configKey}-${index}`,
      config,
    });
  }

  return entries;
}

/** The local player's history in scenarios where more pages are needed. */
export function historyFixtures(playerId: string, count: number): MatchRecord[] {
  const config = matchConfigFrom(DEFAULT_GAME_CONFIG.sessionTimeSeconds, 3000);
  const records: MatchRecord[] = [];

  for (let index = 0; index < count; index += 1) {
    records.push({
      id: `fxh-${index}`,
      playerId,
      date: isoAt(index * 3 * 60 * 60 * 1000),
      score: FIXTURE_SCORES[(index + 3) % FIXTURE_SCORES.length],
      durationMs: (45 + index * 7) * 1000,
      endReason: index % 4 === 3 ? 'playerDead' : 'timeUp',
      config,
    });
  }

  return records;
}
