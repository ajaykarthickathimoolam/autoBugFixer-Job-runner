import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isAborted, killGroup, trackProcess, untrackProcess } from './abort.js';
import { currentJob } from './jobContext.js';

const execP = promisify(exec);
const MAX_BUFFER = 1024 * 1024 * 20;

function spawnCollected(cmd, args, opts = {}) {
  const jobId = opts.jobId || currentJob()?.jobId;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (jobId && child.pid) trackProcess(jobId, child.pid);
    let stdout = '';
    let stderr = '';
    const cap = (current, chunk) => {
      const next = current + chunk.toString();
      return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
    };
    child.stdout.on('data', (chunk) => {
      stdout = cap(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = cap(stderr, chunk);
    });
    const timer = opts.timeoutMs
      ? setTimeout(() => killGroup(child.pid), opts.timeoutMs)
      : null;
    const finish = (code) => {
      if (timer) clearTimeout(timer);
      if (jobId && child.pid) untrackProcess(jobId, child.pid);
      resolve({
        stdout,
        stderr,
        code: code ?? 1,
        aborted: !!(jobId && isAborted(jobId)),
      });
    };
    child.on('error', (err) => {
      stderr += err.message;
      finish(1);
    });
    child.on('close', (code) => finish(code));
  });
}

/**
 * Runs a command with an argv array (no shell). Git operations use this so ticket text
 * cannot change the command. The process group is killed when the job is cancelled.
 */
export function run(cmd, args, opts = {}) {
  return spawnCollected(cmd, args, opts);
}

/**
 * Admin-configured build/test commands and npm audit. Inside a job these run in the sandbox.
 */
export async function runShell(command, opts = {}) {
  if (currentJob()?.jobId) {
    const { runSandboxedShell } = await import('./sandbox.js');
    return runSandboxedShell({
      cwd: opts.cwd,
      command,
      timeoutMs: opts.timeoutMs,
    });
  }
  try {
    const { stdout, stderr } = await execP(command, { maxBuffer: MAX_BUFFER, ...opts });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || err.message, code: err.code ?? 1 };
  }
}
