import { DEFAULT_GAME_CONFIG, SPAWN_INTERVAL_LIMITS } from '@/config/gameConfig';
import type { GameEndReason } from '@/types/game';

/**
 * Player facing options (Options screen) and the last completed match, both
 * persisted in localStorage. Gameplay itself never reads storage: the match
 * receives a config snapshot built from these values when it starts.
 */
export type PlayerOptions = {
  sessionTimeSeconds: number;
  spawnIntervalMs: number;
};

export type MatchResult = {
  score: number;
  elapsedMs: number;
  endReason: GameEndReason;
  playerHealth: number;
  playerMaxHealth: number;
  endedAt: number;
};

export const SESSION_TIME_LIMITS = {
  minSeconds: DEFAULT_GAME_CONFIG.minSessionTimeSeconds,
  maxSeconds: DEFAULT_GAME_CONFIG.maxSessionTimeSeconds,
} as const;

export const SPAWN_INTERVAL_DOC = SPAWN_INTERVAL_LIMITS;

export const DEFAULT_PLAYER_OPTIONS: PlayerOptions = {
  sessionTimeSeconds: DEFAULT_GAME_CONFIG.sessionTimeSeconds,
  spawnIntervalMs: DEFAULT_GAME_CONFIG.enemySpawn.intervalMs,
};

const OPTIONS_KEY = 'pirate-battle.options';
const LAST_RESULT_KEY = 'pirate-battle.last-result';

export type OptionErrors = Partial<Record<keyof PlayerOptions, string>>;

export function validatePlayerOptions(options: PlayerOptions): OptionErrors {
  const errors: OptionErrors = {};
  const { minSeconds, maxSeconds } = SESSION_TIME_LIMITS;
  const { minMs, maxMs } = SPAWN_INTERVAL_LIMITS;

  if (
    !Number.isFinite(options.sessionTimeSeconds) ||
    options.sessionTimeSeconds < minSeconds ||
    options.sessionTimeSeconds > maxSeconds
  ) {
    errors.sessionTimeSeconds = `Session time must be between ${minSeconds} and ${maxSeconds} seconds.`;
  }

  if (
    !Number.isFinite(options.spawnIntervalMs) ||
    options.spawnIntervalMs < minMs ||
    options.spawnIntervalMs > maxMs
  ) {
    errors.spawnIntervalMs = `Enemy spawn time must be between ${minMs} and ${maxMs} milliseconds.`;
  }

  return errors;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: options simply do not persist
  }
}

export function loadPlayerOptions(): PlayerOptions {
  const stored = readJson<Partial<PlayerOptions>>(OPTIONS_KEY);
  const merged: PlayerOptions = {
    sessionTimeSeconds:
      typeof stored?.sessionTimeSeconds === 'number'
        ? stored.sessionTimeSeconds
        : DEFAULT_PLAYER_OPTIONS.sessionTimeSeconds,
    spawnIntervalMs:
      typeof stored?.spawnIntervalMs === 'number'
        ? stored.spawnIntervalMs
        : DEFAULT_PLAYER_OPTIONS.spawnIntervalMs,
  };
  return Object.keys(validatePlayerOptions(merged)).length === 0
    ? merged
    : DEFAULT_PLAYER_OPTIONS;
}

export function savePlayerOptions(options: PlayerOptions): void {
  if (Object.keys(validatePlayerOptions(options)).length > 0) return;
  writeJson(OPTIONS_KEY, options);
}

export function loadLastResult(): MatchResult | null {
  const stored = readJson<Partial<MatchResult>>(LAST_RESULT_KEY);
  if (
    !stored ||
    typeof stored.score !== 'number' ||
    typeof stored.elapsedMs !== 'number' ||
    typeof stored.endReason !== 'string'
  ) {
    return null;
  }
  return {
    score: stored.score,
    elapsedMs: stored.elapsedMs,
    endReason: stored.endReason as GameEndReason,
    playerHealth: typeof stored.playerHealth === 'number' ? stored.playerHealth : 0,
    playerMaxHealth: typeof stored.playerMaxHealth === 'number' ? stored.playerMaxHealth : 0,
    endedAt: typeof stored.endedAt === 'number' ? stored.endedAt : 0,
  };
}

export function saveLastResult(result: MatchResult): void {
  writeJson(LAST_RESULT_KEY, result);
}
