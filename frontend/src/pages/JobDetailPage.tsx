import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api, ApiError } from '../lib/api';
import { useJobEvents } from '../lib/sse';
import { StatusBadge } from '../components/StatusBadge';
import type { JobResponse, JobStatus, TraceEvent } from '../lib/types';

const STEP_LABELS: Record<JobStatus, string> = {
  RECEIVED: 'Ticket received',
  ANALYZING: 'Investigating / planning',
  CLONING: 'Cloning repository',
  FIXING: 'Applying the fix',
  VERIFYING: 'Running build/tests',
  SCANNING: 'Security scans',
  AWAITING_INPUT: 'Waiting on a clarifying answer',
  AWAITING_APPROVAL: 'Waiting on human approval',
  PAUSED: 'Paused',
  PR_CREATED: 'Pull request opened',
  NOTIFIED: 'Stakeholders notified',
  CLOSED: 'L1 response posted',
  ESCALATED: 'Escalated to human queue',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

const RESUME_LABELS: Record<string, string> = {
  PLAN: 'planning',
  CLONE: 'cloning',
  FIX: 'the fix',
  VERIFY: 'build and tests',
  SCAN: 'security scans',
  REMEDIATE: 'the approved security fix',
  PUSH: 'the push',
  PR: 'the pull request',
};

const PAUSABLE: JobStatus[] = [
  'RECEIVED',
  'ANALYZING',
  'CLONING',
  'FIXING',
  'VERIFYING',
  'SCANNING',
  'AWAITING_INPUT',
  'AWAITING_APPROVAL',
];
const RETRYABLE: JobStatus[] = ['FAILED', 'CANCELLED', 'ESCALATED'];

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
  const [acting, setActing] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[] | null>(null);
  const [clarification, setClarification] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getJob(id).then(setJob).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load job')).finally(() => setLoading(false));
    api.jobTrace(id).then(setTrace).catch(() => setTrace([]));
  }, [id]);

  useJobEvents((updated) => {
    if (updated.id === id) {
      setJob(updated);
    }
  });

  async function act(label: string, fn: () => Promise<JobResponse>) {
    setActing(label);
    setError(null);
    try {
      const updated = await fn();
      setJob(updated);
      if (id) {
        api.jobTrace(id).then(setTrace).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `${label} failed`);
    } finally {
      setActing(null);
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
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {PAUSABLE.includes(job.status) && (
                <button
                    onClick={() => id && act('Pause', () => api.pauseJob(id))}
                    disabled={!!acting}
                    className="rounded-lg border border-[color:var(--color-border-800)] px-3 py-1.5 text-xs hover:border-[color:var(--color-accent-amber)]/50 disabled:opacity-50"
                >
                  {acting === 'Pause' ? 'Pausing…' : 'Pause'}
                </button>
            )}
            {job.status === 'PAUSED' && (
                <button
                    onClick={() => id && act('Resume', () => api.resumeJob(id))}
                    disabled={!!acting}
                    className="rounded-lg border border-[color:var(--color-accent-primary)]/40 px-3 py-1.5 text-xs text-[color:var(--color-accent-primary)] disabled:opacity-50"
                >
                  {acting === 'Resume' ? 'Resuming…' : 'Resume'}
                </button>
            )}
            {PAUSABLE.includes(job.status) || job.status === 'PAUSED' ? (
                <button
                    onClick={() => {
                      if (!id) return;
                      const reason = prompt('Cancel reason (optional)') ?? undefined;
                      act('Cancel', () => api.cancelJob(id, reason));
                    }}
                    disabled={!!acting}
                    className="rounded-lg border border-[color:var(--color-border-800)] px-3 py-1.5 text-xs text-[color:var(--color-accent-red)] disabled:opacity-50"
                >
                  {acting === 'Cancel' ? 'Cancelling…' : 'Cancel'}
                </button>
            ) : null}
            {RETRYABLE.includes(job.status) && (
                <button
                    onClick={() => id && act('Retry', () => api.retryJob(id))}
                    disabled={!!acting}
                    className="rounded-lg border border-[color:var(--color-accent-primary)]/40 px-3 py-1.5 text-xs text-[color:var(--color-accent-primary)] hover:border-[color:var(--color-accent-primary)] disabled:opacity-50"
                >
                  {acting === 'Retry' ? 'Retrying…' : 'Retry job'}
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

        {job.stopRequested && job.status !== 'CANCELLED' && job.status !== 'FAILED' && (
            <div className="rounded-2xl border border-[color:var(--color-accent-amber)]/40 bg-[color:var(--color-accent-amber)]/5 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-amber)]">Stopping</p>
              <p className="mt-1 text-sm text-[color:var(--color-text-100)]">
                Cancel was requested. This stays on the current stage until the worker process has exited.
              </p>
            </div>
        )}

        {error && (
            <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>
        )}

        {job.status === 'PAUSED' && (
            <div className="rounded-2xl border border-[color:var(--color-accent-amber)]/40 bg-[color:var(--color-accent-amber)]/5 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-amber)]">Job is paused</p>
              <p className="mt-1 text-sm text-[color:var(--color-text-100)]">
                {job.pausedBy === 'guard'
                    ? 'The kill switch or Guard stopped this job. If Admin → Settings still has the kill switch on, turn it off first, then click Resume.'
                    : job.pausedBy
                      ? `Paused by ${job.pausedBy}. Click Resume to continue, or Cancel to stop.`
                      : 'Click Resume to continue, or Cancel to stop.'}
              </p>
            </div>
        )}

        {job.status === 'FAILED' && (
            <div className="rounded-2xl border border-[color:var(--color-accent-red)]/40 bg-[color:var(--color-accent-red)]/5 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-red)]">
              Failed{failedDuringStep ? ` during ${job.resumeFrom ? (RESUME_LABELS[job.resumeFrom] ?? job.resumeFrom) : (STEP_LABELS[failedDuringStep] ?? failedDuringStep)}` : ''}
              </p>
              {job.failureReason && <p className="mt-1 text-sm text-[color:var(--color-text-100)]">{job.failureReason}</p>}
              <p className="mt-2 text-xs text-[color:var(--color-text-400)]">
                {job.resumeFrom
                    ? `Retry continues from ${RESUME_LABELS[job.resumeFrom] ?? 'the failed step'}. Steps that already succeeded are skipped.`
                    : 'CodeHealer will not pick this ticket up again on its own. Retry it here.'}
              </p>
              <button
                  onClick={() => id && act('Retry', () => api.retryJob(id))}
                  disabled={!!acting}
                  className="mt-3 rounded-lg bg-[color:var(--color-accent-green)] px-4 py-2 text-sm font-semibold text-[color:var(--color-on-positive)] disabled:opacity-50"
              >
                {acting === 'Retry' ? 'Retrying…' : job.resumeFrom ? `Retry from ${RESUME_LABELS[job.resumeFrom] ?? 'the failed step'}` : 'Retry this job'}
              </button>
            </div>
        )}

        {job.status === 'AWAITING_APPROVAL' && job.pendingApproval === 'SECURITY' && (
            <div className="rounded-2xl border border-[color:var(--color-accent-amber)]/40 bg-[color:var(--color-accent-amber)]/5 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-amber)]">
                Security findings waiting for approval
              </p>
              <p className="mt-1 text-xs text-[color:var(--color-text-400)]">
                Approving applies these steps in the existing checkout, re-runs build and tests, then runs the security scan again. The pull request opens only if that scan is clean.
              </p>
              <pre className="mt-3 whitespace-pre-wrap font-mono-brand text-xs text-[color:var(--color-text-100)]">
                {job.securityRemediationPlan}
              </pre>
              {job.securityScanSummary && (
                  <pre className="mt-3 whitespace-pre-wrap font-mono-brand text-xs text-[color:var(--color-text-400)]">
                    {job.securityScanSummary}
                  </pre>
              )}
              <div className="mt-3 flex gap-2">
                <button
                    onClick={() => id && act('Approve', () => api.approveJob(id))}
                    disabled={!!acting}
                    className="rounded-lg bg-[color:var(--color-accent-green)] px-4 py-2 text-sm font-semibold text-[color:var(--color-on-positive)] disabled:opacity-50"
                >
                  {acting === 'Approve' ? 'Approving…' : 'Approve and rescan'}
                </button>
                <button
                    onClick={() => {
                      if (!id) return;
                      const reason = prompt('Reject reason') ?? undefined;
                      act('Reject', () => api.rejectJob(id, reason));
                    }}
                    disabled={!!acting}
                    className="rounded-lg border border-[color:var(--color-accent-red)]/40 px-4 py-2 text-sm text-[color:var(--color-accent-red)] disabled:opacity-50"
                >
                  {acting === 'Reject' ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </div>
        )}

        {job.status === 'AWAITING_APPROVAL' && job.pendingApproval === 'DIFF_SCOPE' && (
            <div className="rounded-2xl border border-[color:var(--color-accent-amber)]/40 bg-[color:var(--color-accent-amber)]/5 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-amber)]">
                Change set waiting for approval
              </p>
              <p className="mt-1 text-xs text-[color:var(--color-text-400)]">
                This diff is larger than usual or it touches workflow or credential files. Approving commits this exact list and opens a pull request. CodeHealer does not merge it.
              </p>
              <pre className="mt-3 whitespace-pre-wrap font-mono-brand text-xs text-[color:var(--color-text-100)]">
                {job.diffScopeSummary}
              </pre>
              <div className="mt-3 flex gap-2">
                <button
                    onClick={() => id && act('Approve', () => api.approveJob(id))}
                    disabled={!!acting}
                    className="rounded-lg bg-[color:var(--color-accent-green)] px-4 py-2 text-sm font-semibold text-[color:var(--color-on-positive)] disabled:opacity-50"
                >
                  {acting === 'Approve' ? 'Approving…' : 'Approve this file list'}
                </button>
                <button
                    onClick={() => {
                      if (!id) return;
                      const reason = prompt('Reject reason') ?? undefined;
                      act('Reject', () => api.rejectJob(id, reason));
                    }}
                    disabled={!!acting}
                    className="rounded-lg border border-[color:var(--color-accent-red)]/40 px-4 py-2 text-sm text-[color:var(--color-accent-red)] disabled:opacity-50"
                >
                  {acting === 'Reject' ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </div>
        )}

        {job.status === 'AWAITING_APPROVAL' && job.pendingApproval !== 'SECURITY' && job.pendingApproval !== 'DIFF_SCOPE' && (
            <div className="rounded-2xl border border-[color:var(--color-accent-violet)]/40 bg-[color:var(--color-accent-violet)]/5 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-violet)]">
                {job.missionType === 'L1_SUPPORT' ? 'L1 draft waiting for approval' : 'Change plan waiting for approval'}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--color-text-100)]">
                {job.missionType === 'L1_SUPPORT' ? job.l1DraftResponse : job.changePlan}
              </p>
              {job.l1Citations && job.l1Citations.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-[color:var(--color-text-400)]">
                    {job.l1Citations.map((c) => (
                        <li key={c.documentId}>
                          {c.title} v{c.version}: {c.excerpt}
                        </li>
                    ))}
                  </ul>
              )}
              <div className="mt-3 flex gap-2">
                <button
                    onClick={() => id && act('Approve', () => api.approveJob(id))}
                    disabled={!!acting}
                    className="rounded-lg bg-[color:var(--color-accent-green)] px-4 py-2 text-sm font-semibold text-[color:var(--color-on-positive)] disabled:opacity-50"
                >
                  {acting === 'Approve' ? 'Approving…' : 'Approve'}
                </button>
                <button
                    onClick={() => {
                      if (!id) return;
                      const reason = prompt('Reject / escalate reason') ?? undefined;
                      act('Reject', () => api.rejectJob(id, reason));
                    }}
                    disabled={!!acting}
                    className="rounded-lg border border-[color:var(--color-accent-red)]/40 px-4 py-2 text-sm text-[color:var(--color-accent-red)] disabled:opacity-50"
                >
                  {acting === 'Reject' ? 'Rejecting…' : job.missionType === 'L1_SUPPORT' ? 'Escalate' : 'Reject'}
                </button>
              </div>
            </div>
        )}

        {job.status === 'AWAITING_INPUT' && (
            <div className="rounded-2xl border border-[color:var(--color-accent-violet)]/40 bg-[color:var(--color-accent-violet)]/5 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-violet)]">Waiting on a clarifying answer</p>
              {job.pendingQuestion && (
                  <p className="mt-1 text-sm text-[color:var(--color-text-100)]">{job.pendingQuestion}</p>
              )}
              <p className="mt-2 text-xs text-[color:var(--color-text-400)]">
                Reply on the Jira/Zoho ticket, or paste the answer here and submit. CodeHealer only
                reads a new comment (not an in-app chat). If you quoted the question, include your
                own new text below it.
              </p>
              <textarea
                  value={clarification}
                  onChange={(e) => setClarification(e.target.value)}
                  rows={4}
                  placeholder="What should change, in which service/file, and expected vs actual behaviour…"
                  className="mt-3 w-full rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent-primary)]"
              />
              <button
                  onClick={() => id && act('Submit answer', () => api.answerJob(id, clarification.trim()))}
                  disabled={!!acting || !clarification.trim()}
                  className="mt-3 rounded-lg bg-[color:var(--color-accent-green)] px-4 py-2 text-sm font-semibold text-[color:var(--color-on-positive)] disabled:opacity-50"
              >
                {acting === 'Submit answer' ? 'Submitting…' : 'Submit answer and resume'}
              </button>
            </div>
        )}

        <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-text-400)]">What this job did</h2>
          <p className="text-sm text-[color:var(--color-text-100)]">
            Provider: {job.llmProvider || 'Not recorded yet'}
          </p>
          <p className="mt-2 text-xs text-[color:var(--color-text-400)]">
            {job.llmProvider === 'Claude'
                ? 'Claude Code reads the checkout through its own tools. CodeHealer does not receive a file-by-file list from Claude.'
                : 'Files the model read are listed when the fixer uses its file tools. Secret files such as .env and private keys are refused.'}
          </p>
          <EvidenceList label="Files read" values={job.filesRead} empty="None recorded" />
          <EvidenceList label="Files changed" values={job.filesChanged} empty="None recorded" />
          <EvidenceList label="Commands" values={job.commandsRun} empty="None recorded" />
          <p className="mt-3 text-sm text-[color:var(--color-text-100)]">
            Tests: {testsLabel(job)}
          </p>
          {(job.promptTokens || job.completionTokens) && (
              <p className="mt-2 text-xs text-[color:var(--color-text-400)]">
                Model tokens recorded for this job: {job.promptTokens ?? 0} prompt, {job.completionTokens ?? 0} completion. This is usage, not a time-saved estimate.
              </p>
          )}
          {job.prUrl && (
              <div className="mt-4 border-t border-[color:var(--color-border-800)] pt-3">
                <p className="text-sm text-[color:var(--color-text-100)]">Was the pull request accepted?</p>
                <p className="mt-1 text-xs text-[color:var(--color-text-400)]">
                  Record the outcome after a person reviews it. CodeHealer does not turn this into an hours-saved number.
                </p>
                {job.prDisposition ? (
                    <p className="mt-2 text-sm text-[color:var(--color-text-100)]">
                      Marked {job.prDisposition.toLowerCase()}{job.prDispositionBy ? ` by ${job.prDispositionBy}` : ''}.
                    </p>
                ) : (
                    <div className="mt-2 flex gap-2">
                      <button
                          onClick={() => id && act('Accept PR', () => api.recordDisposition(id, 'ACCEPTED'))}
                          disabled={!!acting}
                          className="rounded-lg border border-[color:var(--color-accent-green)]/40 px-3 py-1.5 text-xs text-[color:var(--color-accent-green)] disabled:opacity-50"
                      >
                        Mark accepted
                      </button>
                      <button
                          onClick={() => id && act('Reject PR', () => api.recordDisposition(id, 'REJECTED'))}
                          disabled={!!acting}
                          className="rounded-lg border border-[color:var(--color-border-800)] px-3 py-1.5 text-xs text-[color:var(--color-accent-red)] disabled:opacity-50"
                      >
                        Mark rejected
                      </button>
                    </div>
                )}
              </div>
          )}
        </div>

        <div className="glow-border grid grid-cols-2 gap-4 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6 sm:grid-cols-3">
          <InfoField label="Project" value={job.projectName ?? '—'} />
          <InfoField label="Mission" value={job.missionType === 'L1_SUPPORT' ? 'L1 support' : 'Coding'} />
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
                  className="max-w-none text-sm text-[color:var(--color-text-100)] [&_a]:text-[color:var(--color-accent-teal)] [&_strong]:font-semibold"
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
                        {STEP_LABELS[event.status] ?? event.status}
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

        {job.securityScanSummary && (
            <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
              <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-text-400)]">Security scan evidence</h2>
              <pre className="whitespace-pre-wrap font-mono-brand text-xs text-[color:var(--color-text-100)]">{job.securityScanSummary}</pre>
            </div>
        )}

        {job.changePlan && (job.status !== 'AWAITING_APPROVAL' || job.pendingApproval === 'SECURITY') && (
            <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
              <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-text-400)]">
                Change plan {job.approvedBy ? `(approved by ${job.approvedBy})` : ''}
              </h2>
              <pre className="whitespace-pre-wrap text-sm text-[color:var(--color-text-100)]">{job.changePlan}</pre>
            </div>
        )}

        {trace && trace.length > 0 && (
            <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
              <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-text-400)]">Trace</h2>
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto font-mono-brand text-xs">
                {trace.map((event, i) => (
                    <div key={event.id || i} className="flex gap-3 border-b border-[color:var(--color-border-800)] pb-2">
                      <span className="shrink-0 text-[color:var(--color-text-600)]">{formatDateTime(event.timestamp)}</span>
                      <span className="text-[color:var(--color-accent-teal)]">{event.kind}</span>
                      <span className="text-[color:var(--color-text-400)]">{event.actor}</span>
                      <span className="text-[color:var(--color-text-100)]">{event.action}</span>
                      {event.detail && <span className="text-[color:var(--color-text-400)]">{event.detail}</span>}
                    </div>
                ))}
              </div>
            </div>
        )}

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

function testsLabel(job: JobResponse) {
  if (job.testsNotRun == null) return 'Build and tests have not been recorded yet.';
  if (job.testsNotRun.trim() === '') {
    return 'A test command was configured and executed. A passing result does not prove the fix is correct.';
  }
  return `No test command is configured for ${job.testsNotRun}. Tests were not run for those services.`;
}

function EvidenceList({ label, values, empty }: { label: string; values: string[] | null; empty: string }) {
  const items = values ?? [];
  return (
      <div className="mt-3">
        <p className="text-xs font-medium text-[color:var(--color-text-400)]">{label}</p>
        {items.length === 0 ? (
            <p className="text-xs text-[color:var(--color-text-600)]">{empty}</p>
        ) : (
            <ul className="mt-1 max-h-40 overflow-y-auto font-mono-brand text-xs text-[color:var(--color-text-100)]">
              {items.map((item) => <li key={item}>{item}</li>)}
            </ul>
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
