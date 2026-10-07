import { useEffect, useState } from 'react';
import { describeError } from '@/api/client';
import { PAGE_SIZE } from '@/api/contracts';
import { useHistory } from '@/api/queries';
import { Pager } from '@/ui/components/Pager';
import { END_LABELS, formatDateTime, formatTime } from '@/ui/format';

/**
 * The local player's registered matches, newest first. Uses the same loading,
 * empty, error and background-update states as the ranking tab.
 */
export function HistoryPanel() {
  const [page, setPage] = useState(1);
  const query = useHistory(page, PAGE_SIZE);
  const data = query.data;

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
        Loading history…
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="tabs__state">
      <p className="tabs__banner" role="status">
        {query.isError
          ? `Could not refresh: ${describeError(query.error)}`
          : query.isFetching
            ? 'Updating…'
            : `${data.total} recorded match${data.total === 1 ? '' : 'es'}`}
      </p>

      {data.items.length === 0 ? (
        <p className="tabs__empty">No matches recorded yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Score</th>
              <th scope="col">Time</th>
              <th scope="col">End</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((record) => (
              <tr key={record.id}>
                <td>{formatDateTime(record.date)}</td>
                <td>{record.score}</td>
                <td>{formatTime(record.durationMs)}</td>
                <td>{END_LABELS[record.endReason] ?? record.endReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
