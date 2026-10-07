import type { GameEndReason } from '@/types/game';

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const END_LABELS: Record<GameEndReason, string> = {
  timeUp: "Time's up",
  playerDead: 'Your ship was destroyed',
  abandoned: 'Match abandoned',
  quit: 'Match left',
};

/** `2026-10-01 12:00` from an ISO string, without the seconds or the Z. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 16).replace('T', ' ');
}
