import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/api/client';
import {
  matchConfigKey,
  type HistoryResponse,
  type MatchConfig,
  type RankingResponse,
} from '@/api/contracts';
import { getPlayer } from '@/api/player';

/** Query keys: config + page are part of the key, so delayed answers for an
 * old page can never land on top of the page currently on screen. */
export const queryKeys = {
  ranking: (config: MatchConfig, page: number, limit: number) =>
    ['ranking', matchConfigKey(config), page, limit] as const,
  history: (page: number, limit: number) =>
    ['history', getPlayer().id, page, limit] as const,
  all: () => [['ranking'], ['history']] as const,
};

async function get<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<T>(path, { params });
  return data;
}

/** Ranking for the configuration the player is about to play with. */
export function useRanking(
  config: MatchConfig,
  page: number,
  limit: number
): UseQueryResult<RankingResponse> {
  return useQuery({
    queryKey: queryKeys.ranking(config, page, limit),
    queryFn: () =>
      get<RankingResponse>('/ranking', {
        sessionTimeSeconds: config.sessionTimeSeconds,
        spawnIntervalMs: config.enemySpawn.intervalMs,
        page,
        limit,
      }),
    placeholderData: keepPreviousData,
  });
}

/** Paginated history of the local player's registered matches. */
export function useHistory(page: number, limit: number): UseQueryResult<HistoryResponse> {
  return useQuery({
    queryKey: queryKeys.history(page, limit),
    queryFn: () => get<HistoryResponse>('/history', { playerId: getPlayer().id, page, limit }),
    placeholderData: keepPreviousData,
  });
}
