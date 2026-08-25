import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api, ApiError } from '../lib/api';
import { useJobEvents } from '../lib/sse';
import { StatusBadge } from '../components/StatusBadge';
import type { JobResponse, JobStatus } from '../lib/types';

const STEP_LABELS: Record<JobStatus, string> = {
  RECEIVED: 'Ticket received',
  ANALYZING: 'Analyzing with Claude',
  CLONING: 'Cloning repository',
  FIXING: 'Applying the fix',
  VERIFYING: 'Running build/tests',
  AWAITING_INPUT: 'Waiting on a clarifying answer',
  PR_CREATED: 'Pull request opened',
  NOTIFIED: 'Cliq notified',
  FAILED: 'Failed',
};

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function durationBetween(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
        .getJob(id)
        .then(setJob)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load job'))
        .finally(() => setLoading(false));
  }, [id]);

  useJobEvents((updated) => {
    if (updated.id === id) {
      setJob(updated);
    }
  });

  async function handleRetry() {
    if (!id) return;
    setRetrying(true);
    setError(null);
    try {
      const updated = await api.retryJob(id);
      setJob(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm('Delete this job? This only removes CodeHealer\'s record - it does not touch the ticket, any PR, or the branch.')) {
      return;
    }
    setDeleting(true);
    try {
      await api.deleteJob(id);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[color:var(--color-text-400)]">Loading…</p>;
  }
  if (!job) {
    return <p className="text-sm text-[color:var(--color-accent-red)]">{error ?? 'Job not found'}</p>;
  }

  const statusHistory = job.statusHistory ?? [];
  const failedIndex = job.status === 'FAILED' ? statusHistory.length - 1 : -1;
  const failedDuringStep = failedIndex > 0 ? statusHistory[failedIndex - 1].status : null;

  return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <Link to="/dashboard" className="text-xs text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]">
              ← Back to dashboard
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-mono-brand text-2xl font-semibold tracking-tight">{job.ticketId}</h1>
              <StatusBadge status={job.status} />
            </div>
            {job.ticketTitle && <p className="mt-1 text-[color:var(--color-text-100)]">{job.ticketTitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {job.status === 'FAILED' && (
                <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="rounded-lg border border-[color:var(--color-accent-primary)]/40 px-3 py-1.5 text-xs text-[color:var(--color-accent-primary)] hover:border-[color:var(--color-accent-primary)] disabled:opacity-50"
                >
                  {retrying ? 'Retrying…' : 'Retry job'}
                </button>
            )}
            <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-[color:var(--color-border-800)] px-3 py-1.5 text-xs text-[color:var(--color-accent-red)] hover:border-[color:var(--color-accent-red)]/50 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete job'}
            </button>
          </div>
        </div>

        {error && (
            <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>
        )}

        {job.status === 'FAILED' && (
            <div className="rounded-2xl border border-[color:var(--color-accent-red)]/40 bg-[color:var(--color-accent-red)]/5 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-red)]">
                Failed{failedDuringStep ? ` during ${STEP_LABELS[failedDuringStep]}` : ''}
              </p>
              {job.failureReason && <p className="mt-1 text-sm text-[color:var(--color-text-100)]">{job.failureReason}</p>}
              <p className="mt-2 text-xs text-[color:var(--color-text-400)]">
                This ticket will not be picked up again automatically. Use Retry job to requeue it.
              </p>
            </div>
        )}

        {job.status === 'AWAITING_INPUT' && job.pendingQuestion && (
            <div className="rounded-2xl border border-violet-500/40 bg-violet-500/5 p-4">
              <p className="text-sm font-medium text-violet-300">Claude has a question, posted as a comment on the ticket</p>
              <p className="mt-1 text-sm text-[color:var(--color-text-100)]">{job.pendingQuestion}</p>
              <p className="mt-2 text-xs text-[color:var(--color-text-400)]">
                Reply on the ticket itself - CodeHealer checks for an answer on its next poll and resumes the fix automatically.
              </p>
            </div>
        )}

        <div className="glow-border grid grid-cols-2 gap-4 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6 sm:grid-cols-3">
          <InfoField label="Project" value={job.projectName ?? '—'} />
          <InfoField label="Created by" value={job.creatorName ?? '—'} />
          <InfoField label="Assignee" value={job.assigneeName ?? '—'} />
          <InfoField label="Received" value={formatDateTime(job.createdAt)} />
          <InfoField label="Last updated" value={formatDateTime(job.updatedAt)} />
          <InfoField
              label="Pull request"
              value={
                job.prUrl ? (
                    <a href={job.prUrl} target="_blank" rel="noreferrer" className="text-[color:var(--color-accent-teal)] hover:underline">
                      View PR
                    </a>
                ) : (
                    '—'
                )
              }
          />
        </div>

        {job.ticketDescription && (
            <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
              <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-text-400)]">Ticket description</h2>
              <div
                  className="prose-invert max-w-none text-sm text-[color:var(--color-text-100)] [&_a]:text-[color:var(--color-accent-teal)] [&_strong]:font-semibold"
                  // Ticket descriptions may be rich-text HTML from the agile host - sanitize
                  // before rendering since this is untrusted content, not plain text.
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.ticketDescription) }}
              />
            </div>
        )}

        <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
          <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-text-400)]">Timeline</h2>
          {statusHistory.length === 0 && (
              <p className="text-sm text-[color:var(--color-text-600)]">No status history recorded for this job.</p>
          )}
          <ol className="flex flex-col gap-0">
            {statusHistory.map((event, i) => {
              const isLast = i === statusHistory.length - 1;
              const isFailed = event.status === 'FAILED';
              const prev = i > 0 ? statusHistory[i - 1] : null;
              return (
                  <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {!isLast && (
                        <span className="absolute left-[7px] top-4 h-full w-px bg-[color:var(--color-border-800)]" />
                    )}
                    <span
                        className={`z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                            isFailed
                                ? 'border-[color:var(--color-accent-red)] bg-[color:var(--color-accent-red)]'
                                : 'border-[color:var(--color-accent-green)] bg-[color:var(--color-accent-green)]'
                        }`}
                    />
                    <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
                      <span className={`text-sm font-medium ${isFailed ? 'text-[color:var(--color-accent-red)]' : 'text-[color:var(--color-text-100)]'}`}>
                        {STEP_LABELS[event.status]}
                      </span>
                      <span className="text-xs text-[color:var(--color-text-600)]">
                        {formatDateTime(event.timestamp)}
                        {prev && ` (+${durationBetween(prev.timestamp, event.timestamp)})`}
                      </span>
                    </div>
                  </li>
              );
            })}
          </ol>
        </div>

        {job.logs.length > 0 && (
            <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
              <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-text-400)]">Execution logs</h2>
              <div className="flex max-h-96 flex-col gap-2 overflow-y-auto font-mono-brand text-xs">
                {job.logs.map((log, i) => (
                    <div key={i} className="flex gap-3 border-b border-[color:var(--color-border-800)] pb-2">
                      <span className="shrink-0 text-[color:var(--color-text-600)]">{formatDateTime(log.timestamp)}</span>
                      <span
                          className={
                            log.level === 'WARN'
                                ? 'text-[color:var(--color-accent-amber)]'
                                : log.level === 'ERROR'
                                    ? 'text-[color:var(--color-accent-red)]'
                                    : 'text-[color:var(--color-text-400)]'
                          }
                      >
                        {log.level}
                      </span>
                      <span className="whitespace-pre-wrap text-[color:var(--color-text-100)]">{log.message}</span>
                    </div>
                ))}
              </div>
            </div>
        )}
      </div>
  );
}

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
      <div>
        <p className="text-xs font-medium text-[color:var(--color-text-400)]">{label}</p>
        <p className="mt-1 text-sm text-[color:var(--color-text-100)]">{value}</p>
      </div>
  );
}
