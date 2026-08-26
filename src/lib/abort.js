const abortedJobs = new Set();

export function requestAbort(jobId) {
  abortedJobs.add(jobId);
}

export function clearAbort(jobId) {
  abortedJobs.delete(jobId);
}

export function isAborted(jobId) {
  return abortedJobs.has(jobId);
}

export class TaskAbortedError extends Error {
  constructor(jobId) {
    super(`Task ${jobId} aborted`);
    this.name = 'TaskAbortedError';
    this.haltStatus = 'CANCELLED';
  }
}

export function throwIfAborted(jobId) {
  if (abortedJobs.has(jobId)) {
    throw new TaskAbortedError(jobId);
  }
}
