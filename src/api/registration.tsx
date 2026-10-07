import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createId, getPlayer } from '@/api/player';
import type { MatchConfig, RegistrationState } from '@/api/contracts';
import {
  RegistrationContext,
  type RegistrationContextValue,
} from '@/api/registrationContext';
import {
  bumpAttempts,
  loadQueue,
  removeFromQueue,
  saveQueue,
  sendRegistration,
  clearQueue,
  type PendingRegistration,
} from '@/api/registrationQueue';
import type { MatchResult } from '@/ui/storage';

const PENDING_STATE: RegistrationState = {
  state: 'pending',
  message: 'Registering match…',
};

/**
 * Owns the local registration queue: a finished match is written to storage
 * before any request goes out, so a crash, a refresh or an offline API never
 * loses it. Confirmed records are removed from the queue and both queries are
 * invalidated so the ranking and the history tabs repaint together.
 */
export function RegistrationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [states, setStates] = useState<Record<string, RegistrationState>>({});
  const [latestId, setLatestId] = useState<string | null>(null);
  const [queue, setQueue] = useState<PendingRegistration[]>(loadQueue);

  const mutation = useMutation({
    mutationFn: sendRegistration,
    onSuccess: (_data, variables) => {
      setQueue(removeFromQueue(variables.id));
      setStates((previous) => ({
        ...previous,
        [variables.id]: { state: 'recorded', message: 'Recorded in ranking and history' },
      }));
      void queryClient.invalidateQueries({ queryKey: ['ranking'] });
      void queryClient.invalidateQueries({ queryKey: ['history'] });
    },
    onError: (_error, variables) => {
      setQueue(bumpAttempts(variables.id));
      setStates((previous) => ({
        ...previous,
        [variables.id]: {
          state: 'failed',
          message: 'Registration failed — it stays queued, retry from the menu.',
        },
      }));
    },
  });

  const { mutate } = mutation;

  // Anything left over from a previous session goes out as soon as the app
  // boots; the player can keep playing meanwhile.
  useEffect(() => {
    loadQueue().forEach((record) => mutate(record));
  }, [mutate]);

  const register = useCallback(
    (result: MatchResult, config: MatchConfig) => {
      const player = getPlayer();
      const record: PendingRegistration = {
        id: createId(),
        playerId: player.id,
        playerName: player.name,
        date: new Date(result.endedAt).toISOString(),
        score: result.score,
        durationMs: result.elapsedMs,
        endReason: result.endReason,
        config,
        attempts: 0,
        queuedAt: Date.now(),
      };
      const next = [...loadQueue().filter((item) => item.id !== record.id), record];
      saveQueue(next);
      setQueue(next);
      setLatestId(record.id);
      setStates((previous) => ({ ...previous, [record.id]: PENDING_STATE }));
      mutate(record);
    },
    [mutate]
  );

  const retryPending = useCallback(() => {
    loadQueue().forEach((record) => {
      setStates((previous) => ({ ...previous, [record.id]: PENDING_STATE }));
      mutate(record);
    });
  }, [mutate]);

  const resetQueue = useCallback(() => {
    clearQueue();
    setQueue([]);
    setStates({});
    setLatestId(null);
  }, []);

  const value = useMemo<RegistrationContextValue>(
    () => ({
      register,
      retryPending,
      pendingCount: queue.length,
      latestState: latestId ? (states[latestId] ?? PENDING_STATE) : null,
      resetQueue,
    }),
    [register, retryPending, queue, latestId, states, resetQueue]
  );

  return <RegistrationContext.Provider value={value}>{children}</RegistrationContext.Provider>;
}
