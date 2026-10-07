import { useEffect, useState } from 'react';
import { describeError } from '@/api/client';
import { PAGE_SIZE, type MatchConfig } from '@/api/contracts';
import { getPlayer } from '@/api/player';
import { useRanking } from '@/api/queries';
import { Pager } from '@/ui/components/Pager';
import { formatDateTime } from '@/ui/format';

type RankingPanelProps = {
  config: MatchConfig;
};

/**
 * Leaderboard for the configuration the player is about to play with.
 * Handles loading, empty, error (with retry), background updates and paging.
 */
export function RankingPanel({ config }: RankingPanelProps) {
  const [page, setPage] = useState(1);
  const query = useRanking(config, page, PAGE_SIZE);
  const data = query.data;

  // A shorter total (another scenario, fewer records) can shrink the page count.
  useEffect(() => {
    if (!data) return;
    const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
    if (page > totalPages) setPage(totalPages);
  }, [data, page]);

  if (!data) {
    if (query.isError) {
      return (
        <div className="tabs__state tabs__state--error" role="alert">
          <p>{describeError(query.error)}</p>
          <button
            type="button"
            className="btn btn--text"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <p className="tabs__state" role="status">
        Loading ranking…
      </p>
    );
  }

  const playerId = getPlayer().id;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="tabs__state">
      <p className="tabs__banner" role="status">
        {query.isError
          ? `Could not refresh: ${describeError(query.error)}`
          : query.isFetching
            ? 'Updating…'
            : data.total === 0
              ? 'Nothing on the board yet'
              : `Top ${data.total} for this configuration`}
      </p>

      {data.items.length === 0 ? (
        <p className="tabs__empty">No rankings to show yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Pirate</th>
              <th scope="col">Score</th>
              <th scope="col">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((entry, index) => {
              const isYou = entry.playerId === playerId;
              return (
                <tr key={entry.id} className={isYou ? 'is-you' : undefined}>
                  <td>{(data.page - 1) * data.limit + index + 1}</td>
                  <td>
                    {entry.playerName}
                    {isYou ? ' (you)' : ''}
                  </td>
                  <td>{entry.score}</td>
                  <td>{formatDateTime(entry.date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
