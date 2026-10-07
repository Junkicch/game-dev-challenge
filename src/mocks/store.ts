import type { MatchRecord } from '@/types/game';

/**
 * Confirmed matches live in localStorage so ranking and history survive a
 * refresh and keep working while the network is down. This is the mock
 * "server" side of the contract; the client never reads it directly.
 */
const RECORDS_KEY = 'pirate-battle.records';

function isRecord(value: unknown): value is MatchRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<MatchRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.playerId === 'string' &&
    typeof record.date === 'string' &&
    typeof record.score === 'number' &&
    typeof record.durationMs === 'number' &&
    typeof record.endReason === 'string' &&
    typeof record.config === 'object' &&
    record.config !== null
  );
}

export function loadRecords(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

export function saveRecords(records: MatchRecord[]): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // storage blocked: this session simply has no confirmed history
  }
}

export function findRecord(id: string): MatchRecord | undefined {
  return loadRecords().find((record) => record.id === id);
}

/** Idempotent: the same id never produces a second stored record. */
export function addRecord(record: MatchRecord): void {
  const records = loadRecords();
  if (records.some((existing) => existing.id === record.id)) return;
  saveRecords([...records, record]);
}

export function resetRecords(): void {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    // ignore
  }
}
