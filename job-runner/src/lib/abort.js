import { jobContext } from './jobContext.js';

const abortReasons = new Map();
const groups = new Map();

export function requestAbort(jobId, reason = 'CANCEL') {
  abortReasons.set(jobId, reason === 'TIMEOUT' ? 'TIMEOUT' : 'CANCEL');
  killTracked(jobId);
}

export function clearAbort(jobId) {
  abortReasons.delete(jobId);
  groups.delete(jobId);
}

export function isAborted(jobId) {
  return abortReasons.has(jobId);
}

export function abortHaltStatus(jobId) {
  return abortReasons.get(jobId) === 'TIMEOUT' ? 'FAILED' : 'CANCELLED';
}

export function trackProcess(jobId, pid) {
  if (!jobId || !pid) return;
  let pids = groups.get(jobId);
  if (!pids) {
    pids = new Set();
    groups.set(jobId, pids);
  }
  pids.add(pid);
}

export function untrackProcess(jobId, pid) {
  const pids = groups.get(jobId);
  if (pids) pids.delete(pid);
}

export function killTracked(jobId) {
  const pids = groups.get(jobId);
  if (!pids) return;
  for (const pid of pids) {
    killGroup(pid);
  }
}

export function killGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

export class TaskAbortedError extends Error {
  constructor(jobId) {
    super(`Task ${jobId} aborted`);
    this.name = 'TaskAbortedError';
    this.jobId = jobId;
    this.haltStatus = abortHaltStatus(jobId);
  }
}

export function throwIfAborted(jobId) {
  const id = jobId || jobContext.getStore()?.jobId;
  if (id && abortReasons.has(id)) {
    throw new TaskAbortedError(id);
  }
}
