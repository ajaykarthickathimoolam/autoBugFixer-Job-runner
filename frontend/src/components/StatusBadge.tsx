import type { JobStatus } from '../lib/types';

const STYLES: Record<JobStatus, string> = {
  RECEIVED: 'bg-[color:var(--color-text-600)]/15 text-[color:var(--color-text-400)] border-[color:var(--color-border-800)]',
  ANALYZING: 'bg-[color:var(--color-accent-violet)]/10 text-[color:var(--color-accent-violet)] border-[color:var(--color-accent-violet)]/30',
  CLONING: 'bg-[color:var(--color-accent-amber)]/10 text-[color:var(--color-accent-amber)] border-[color:var(--color-accent-amber)]/30',
  FIXING: 'bg-[color:var(--color-accent-amber)]/10 text-[color:var(--color-accent-amber)] border-[color:var(--color-accent-amber)]/30',
  VERIFYING: 'bg-[color:var(--color-accent-amber)]/10 text-[color:var(--color-accent-amber)] border-[color:var(--color-accent-amber)]/30',
  SCANNING: 'bg-[color:var(--color-accent-amber)]/10 text-[color:var(--color-accent-amber)] border-[color:var(--color-accent-amber)]/30',
  AWAITING_INPUT: 'bg-[color:var(--color-accent-violet)]/10 text-[color:var(--color-accent-violet)] border-[color:var(--color-accent-violet)]/30',
  AWAITING_APPROVAL: 'bg-[color:var(--color-accent-violet)]/10 text-[color:var(--color-accent-violet)] border-[color:var(--color-accent-violet)]/30',
  PAUSED: 'bg-[color:var(--color-text-600)]/15 text-[color:var(--color-text-400)] border-[color:var(--color-border-800)]',
  PR_CREATED: 'bg-[color:var(--color-accent-green)]/10 text-[color:var(--color-accent-green)] border-[color:var(--color-accent-green)]/30',
  NOTIFIED: 'bg-[color:var(--color-accent-green)]/10 text-[color:var(--color-accent-green)] border-[color:var(--color-accent-green)]/30',
  CLOSED: 'bg-[color:var(--color-accent-green)]/10 text-[color:var(--color-accent-green)] border-[color:var(--color-accent-green)]/30',
  ESCALATED: 'bg-[color:var(--color-accent-amber)]/10 text-[color:var(--color-accent-amber)] border-[color:var(--color-accent-amber)]/30',
  CANCELLED: 'bg-[color:var(--color-text-600)]/15 text-[color:var(--color-text-400)] border-[color:var(--color-border-800)]',
  FAILED: 'bg-[color:var(--color-accent-red)]/10 text-[color:var(--color-accent-red)] border-[color:var(--color-accent-red)]/30',
};

const IN_PROGRESS: JobStatus[] = ['RECEIVED', 'ANALYZING', 'CLONING', 'FIXING', 'VERIFYING', 'SCANNING'];

export function StatusBadge({ status }: { status: JobStatus }) {
  const isActive = IN_PROGRESS.includes(status);
  return (
      <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${STYLES[status] ?? STYLES.RECEIVED}`}
      >
      {isActive && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
        {status.replace(/_/g, ' ')}
    </span>
  );
}
