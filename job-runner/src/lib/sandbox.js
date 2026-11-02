import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { isAborted, killGroup, trackProcess, untrackProcess } from './abort.js';
import { currentJob, noteCommand } from './jobContext.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
let probeResult;

function exists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function isSymlink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Bubblewrap arguments that expose tools and the job directory, and nothing else on the volume. */
export function buildBwrapPrefix(cwd) {
  const args = [
    '--unshare-user',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
    '--die-with-parent',
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    '--tmpfs', '/run',
  ];
  if (exists('/usr')) args.push('--ro-bind', '/usr', '/usr');
  if (exists('/bin') && !isSymlink('/bin')) args.push('--ro-bind', '/bin', '/bin');
  else args.push('--symlink', 'usr/bin', '/bin');
  if (exists('/lib') && !isSymlink('/lib')) args.push('--ro-bind', '/lib', '/lib');
  else if (exists('/usr/lib')) args.push('--symlink', 'usr/lib', '/lib');
  if (exists('/lib64') && !isSymlink('/lib64')) args.push('--ro-bind', '/lib64', '/lib64');
  else if (exists('/usr/lib64')) args.push('--symlink', 'usr/lib64', '/lib64');
  if (exists('/opt')) args.push('--ro-bind', '/opt', '/opt');
  if (exists('/etc/ssl')) args.push('--ro-bind', '/etc/ssl', '/etc/ssl');
  if (exists('/etc/ca-certificates')) args.push('--ro-bind', '/etc/ca-certificates', '/etc/ca-certificates');
  if (exists('/etc/passwd')) args.push('--ro-bind', '/etc/passwd', '/etc/passwd');
  if (exists('/etc/group')) args.push('--ro-bind', '/etc/group', '/etc/group');
  if (exists('/etc/nsswitch.conf')) args.push('--ro-bind', '/etc/nsswitch.conf', '/etc/nsswitch.conf');
  args.push('--bind', cwd, cwd, '--chdir', cwd);
  return args;
}

function safeEnv(extra = {}) {
  const env = {
    PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    LANG: process.env.LANG || 'C.UTF-8',
    TMPDIR: '/tmp',
    GIT_TERMINAL_PROMPT: '0',
  };
  if (process.env.JAVA_HOME) env.JAVA_HOME = process.env.JAVA_HOME;
  for (const [key, value] of Object.entries(extra)) {
    if (value != null && value !== '') env[key] = String(value);
  }
  return env;
}

function envArgs(env, cwd) {
  const args = ['--clearenv'];
  const merged = { ...env, HOME: cwd };
  for (const [key, value] of Object.entries(merged)) {
    args.push('--setenv', key, value);
  }
  return args;
}

function spawnTracked(cmd, args, { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, track = true } = {}) {
  const jobId = track ? currentJob()?.jobId : null;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ stdout: '', stderr: err.message, code: 1, sandboxed: false });
      return;
    }
    if (jobId && child.pid) trackProcess(jobId, child.pid);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const cap = (current, chunk) => {
      const next = current + chunk.toString();
      return next.length > 1_000_000 ? next.slice(-1_000_000) : next;
    };
    child.stdout?.on('data', (chunk) => {
      stdout = cap(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = cap(stderr, chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);
    const finish = (code) => {
      clearTimeout(timer);
      if (jobId && child.pid) untrackProcess(jobId, child.pid);
      if (timedOut) stderr += '\ncommand exceeded the time limit and was killed';
      const aborted = !!(jobId && isAborted(jobId));
      resolve({ stdout, stderr, code: code ?? 1, aborted, sandboxed: cmd === 'bwrap' });
    };
    child.on('error', (err) => {
      stderr += err.message;
      finish(1);
    });
    child.on('close', (code) => finish(code));
  });
}

async function probeBwrap() {
  if (probeResult !== undefined) return probeResult;
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codehealer-sandbox-'));
  try {
    const result = await spawnTracked('bwrap', [...buildBwrapPrefix(dir), ...envArgs(safeEnv(), dir), '--', '/bin/true'], {
      timeoutMs: 8000,
      track: false,
    });
    probeResult = result.code === 0;
  } catch {
    probeResult = false;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  return probeResult;
}

export async function describeSandbox() {
  const ok = await probeBwrap();
  if (ok) {
    return 'Commands for this job run in a bubblewrap sandbox. The sandbox does not receive CodeHealer credentials or other jobs\' files. Outbound network stays available so builds can download dependencies.';
  }
  if (process.env.CODEHEALER_REQUIRE_SANDBOX === 'true') {
    throw new Error('bubblewrap sandbox is required but bwrap could not start a user namespace');
  }
  return 'bubblewrap is not available. Commands run with a scrubbed environment and a killable process group only. This is a weaker isolation mode.';
}

async function runInside(cwd, argv, { extraEnv, timeoutMs, shellCommand }) {
  const ok = await probeBwrap();
  if (!ok && process.env.CODEHEALER_REQUIRE_SANDBOX === 'true') {
    throw new Error('bubblewrap sandbox is required but bwrap could not start a user namespace');
  }
  const env = safeEnv({ ...extraEnv, HOME: cwd });
  let result;
  if (ok) {
    result = await spawnTracked('bwrap', [...buildBwrapPrefix(cwd), ...envArgs(env, cwd), '--', ...argv], { timeoutMs });
    result.sandboxed = true;
  } else {
    result = await spawnTracked(argv[0], argv.slice(1), { cwd, env, timeoutMs });
    result.sandboxed = false;
  }
  if (shellCommand) noteCommand(shellCommand, result.code);
  if (result.aborted) {
    const { TaskAbortedError, throwIfAborted } = await import('./abort.js');
    throwIfAborted();
    throw new TaskAbortedError(currentJob()?.jobId || '');
  }
  return result;
}

export function runSandboxedShell({ cwd, command, timeoutMs, extraEnv }) {
  return runInside(cwd, ['/bin/sh', '-c', command], { extraEnv, timeoutMs, shellCommand: command });
}

export function runSandboxedArgv({ cwd, argv, timeoutMs, extraEnv }) {
  const command = argv.map((part) => String(part).slice(0, 80)).join(' ');
  return runInside(cwd, argv, { extraEnv, timeoutMs, shellCommand: command });
}
