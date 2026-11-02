import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { BoardProjectSummary } from '../lib/types';

export function BoardGalleryPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<BoardProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
        .listBoardProjects()
        .then(setProjects)
        .finally(() => setLoading(false));
  }, []);

  return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="eyebrow">Live tickets</p>
          <h1 className="page-title">Board</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-400)]">
            Browse the live board - pick a project to see every ticket, grouped by bucket.
          </p>
        </div>

        {loading && <p className="text-sm text-[color:var(--color-text-400)]">Loading…</p>}

        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
              <button
                  key={p.id}
                  onClick={() => navigate(`/board/${p.id}`)}
                  className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-5 text-left transition-colors hover:border-[color:var(--color-accent-primary)]/50"
              >
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 text-xs text-[color:var(--color-text-400)]">
                  {p.agilePlatform === 'JIRA' ? 'Jira' : 'Zoho'} project {p.externalId ?? '—'}
                  {p.lastPolledAt && <> · last polled {new Date(p.lastPolledAt).toLocaleTimeString()}</>}
                </p>
              </button>
          ))}
          {!loading && projects.length === 0 && (
              <p className="text-sm text-[color:var(--color-text-600)]">
                No projects with a ticket board configured yet.
              </p>
          )}
        </div>
      </div>
  );
}
