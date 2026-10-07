import { api } from '@/api/client';
import type { RegisterMatchBody, RegisterMatchResponse } from '@/api/contracts';

/** A finished match waiting for the API: survives refresh and failures. */
export type PendingRegistration = RegisterMatchBody & {
  attempts: number;
  queuedAt: number;
};

const QUEUE_KEY = 'pirate-battle.pending-registrations';

export function loadQueue(): PendingRegistration[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingRegistration =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as PendingRegistration).id === 'string' &&
        typeof (item as PendingRegistration).playerId === 'string'
    );
  } catch {
    return [];
  }
}

export function saveQueue(queue: PendingRegistration[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage blocked: the queue simply does not survive a refresh
  }
}

export function removeFromQueue(id: string): PendingRegistration[] {
  const next = loadQueue().filter((item) => item.id !== id);
  saveQueue(next);
  return next;
}

export function bumpAttempts(id: string): PendingRegistration[] {
  const next = loadQueue().map((item) =>
    item.id === id ? { ...item, attempts: item.attempts + 1 } : item
  );
  saveQueue(next);
  return next;
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
}

/**
 * One HTTP attempt. The endpoint is keyed by the client generated match id,
 * so retrying (or sending the same match twice) returns the stored record
 * instead of creating a second one.
 */
export async function sendRegistration(record: RegisterMatchBody): Promise<RegisterMatchResponse> {
  const body: RegisterMatchBody = {
    id: record.id,
    playerId: record.playerId,
    playerName: record.playerName,
    date: record.date,
    score: record.score,
    durationMs: record.durationMs,
    endReason: record.endReason,
    config: record.config,
  };
  const { data } = await api.post<RegisterMatchResponse>('/matches', body);
  return data;
}
