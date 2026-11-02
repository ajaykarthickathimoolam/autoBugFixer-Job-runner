import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api, ApiError } from '../lib/api';
import type { BoardResponse } from '../lib/types';

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function BoardDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    api
        .getBoard(projectId)
        .then(setBoard)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load board'))
        .finally(() => setLoading(false));
  }, [projectId]);

  return (
      <div className="flex flex-col gap-4">
        <div>
          <Link to="/board" className="text-xs text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]">
            ← Back to Board
          </Link>
          <h1 className="page-title mt-2">{board?.projectName ?? 'Board'}</h1>
        </div>

        {loading && <p className="text-sm text-[color:var(--color-text-400)]">Loading the board - this can take a few seconds…</p>}
        {error && <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>}

        {board && !loading && (
            board.buckets.length === 0 ? (
                <p className="text-sm text-[color:var(--color-text-600)]">No buckets found on this board.</p>
            ) : (
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {board.buckets.map((bucket) => (
                      <div
                          key={bucket.id}
                          className="glow-border flex w-80 shrink-0 flex-col rounded-2xl bg-[color:var(--color-panel-900)]/80 p-4"
                      >
                        <div className="mb-3 flex shrink-0 items-center justify-between px-1">
                          <h2 className="truncate text-sm font-semibold text-[color:var(--color-text-100)]" title={bucket.name}>
                            {bucket.name}
                            {bucket.isBacklog && (
                                <span className="ml-2 rounded-full border border-[color:var(--color-border-800)] px-2 py-0.5 text-xs font-normal text-[color:var(--color-text-400)]">
                                  Backlog
                                </span>
                            )}
                          </h2>
                          <span className="shrink-0 rounded-full bg-[color:var(--color-bg-900)] px-2 py-0.5 text-xs text-[color:var(--color-text-600)]">
                            {bucket.items.length}
                          </span>
                        </div>

                        <div className="flex flex-col gap-3">
                          {bucket.items.length === 0 && (
                              <p className="px-1 text-xs text-[color:var(--color-text-600)]">No tickets in this bucket.</p>
                          )}
                          {bucket.items.map((item) => (
                              <div key={item.id} className="rounded-xl border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)]/40 p-3">
                                <p className="text-sm font-medium text-[color:var(--color-text-100)]">
                                  {item.title || item.id}
                                </p>
                                {item.description && (
                                    <div
                                        className="mt-1 max-w-none text-xs text-[color:var(--color-text-400)] line-clamp-2"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.description) }}
                                    />
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-600)]">
                                  <span className="rounded-full border border-[color:var(--color-accent-teal)]/30 px-2 py-0.5 text-[color:var(--color-accent-teal)]">
                                    {item.assigneeName ?? 'Unassigned'}
                                  </span>
                                  {item.points != null && <span>{item.points} pts</span>}
                                  {formatDate(item.endDate) && <span>Due {formatDate(item.endDate)}</span>}
                                </div>
                              </div>
                          ))}
                        </div>
                      </div>
                  ))}
                </div>
            )
        )}
      </div>
  );
}
