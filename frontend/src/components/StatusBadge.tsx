import type { JobStatus } from '../lib/types';

const STYLES: Record<JobStatus, string> = {
  RECEIVED: 'bg-[color:var(--color-accent-primary)]/10 text-[color:var(--color-accent-primary)] border-[color:var(--color-accent-primary)]/30',
  ANALYZING: 'bg-[color:var(--color-accent-teal)]/10 text-[color:var(--color-accent-teal)] border-[color:var(--color-accent-teal)]/30',
  CLONING: 'bg-[color:var(--color-accent-amber)]/10 text-[color:var(--color-accent-amber)] border-[color:var(--color-accent-amber)]/30',
  FIXING: 'bg-[color:var(--color-accent-amber)]/10 text-[color:var(--color-accent-amber)] border-[color:var(--color-accent-amber)]/30',
  VERIFYING: 'bg-[color:var(--color-accent-amber)]/10 text-[color:var(--color-accent-amber)] border-[color:var(--color-accent-amber)]/30',
  AWAITING_INPUT: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  PR_CREATED: 'bg-[color:var(--color-accent-green)]/10 text-[color:var(--color-accent-green)] border-[color:var(--color-accent-green)]/30',
  NOTIFIED: 'bg-[color:var(--color-accent-green)]/10 text-[color:var(--color-accent-green)] border-[color:var(--color-accent-green)]/30',
  FAILED: 'bg-[color:var(--color-accent-red)]/10 text-[color:var(--color-accent-red)] border-[color:var(--color-accent-red)]/30',
};

const IN_PROGRESS: JobStatus[] = ['RECEIVED', 'ANALYZING', 'CLONING', 'FIXING', 'VERIFYING'];

export function StatusBadge({ status }: { status: JobStatus }) {
  const isActive = IN_PROGRESS.includes(status);
  return (
      <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide ${STYLES[status]}`}
      >
      {isActive && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
        {status.replace('_', ' ')}
    </span>
  );
}
