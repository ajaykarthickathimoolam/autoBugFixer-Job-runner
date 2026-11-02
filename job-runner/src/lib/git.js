import fs from 'fs/promises';
import path from 'path';
import { run } from './exec.js';
import { redactSecrets } from './redact.js';
import { isAborted, TaskAbortedError } from './abort.js';
import { currentJob } from './jobContext.js';
import { parsePorcelain } from './scope.js';

function throwIfGitAborted(result) {
  const jobId = currentJob()?.jobId;
  if (result?.aborted || (jobId && isAborted(jobId))) {
    throw new TaskAbortedError(jobId || '');
  }
}

function fail(label, result) {
  throwIfGitAborted(result);
  throw new Error(`${label}: ${redactSecrets(result?.stderr || result?.stdout || '')}`);
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Refreshes the persistent per-service base clone. The remote URL is always the clean
 * https or ssh URL. Credentials stay in the git environment, not in .git/config.
 */
export async function ensureBaseClone({ basePath, repoUrl, baseBranch, gitEnv }) {
  if (await pathExists(path.join(basePath, '.git'))) {
    const setUrl = await run('git', ['-C', basePath, 'remote', 'set-url', 'origin', repoUrl], { env: gitEnv });
    if (setUrl.code !== 0) fail(`remote set-url failed`, setUrl);
    const fetched = await run('git', ['-C', basePath, 'fetch', 'origin', baseBranch], { env: gitEnv });
    if (fetched.code !== 0) fail(`fetch ${baseBranch} failed`, fetched);
    const checkout = await run('git', ['-C', basePath, 'checkout', baseBranch], { env: gitEnv });
    if (checkout.code !== 0) fail(`checkout ${baseBranch} failed`, checkout);
    const reset = await run('git', ['-C', basePath, 'reset', '--hard', `origin/${baseBranch}`], { env: gitEnv });
    if (reset.code !== 0) fail(`reset to origin/${baseBranch} failed`, reset);
    const cleaned = await run('git', ['-C', basePath, 'clean', '-fd'], { env: gitEnv });
    if (cleaned.code !== 0) fail(`clean failed`, cleaned);
  } else {
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(basePath, { recursive: true });
    const result = await run('git', ['clone', '--branch', baseBranch, repoUrl, basePath], { env: gitEnv });
    if (result.code !== 0) fail('git clone failed', result);
    const setUrl = await run('git', ['-C', basePath, 'remote', 'set-url', 'origin', repoUrl], { env: gitEnv });
    if (setUrl.code !== 0) fail('remote set-url failed', setUrl);
  }
}

export async function cloneLocalForTask(basePath, taskPath) {
  await fs.mkdir(path.dirname(taskPath), { recursive: true });
  const result = await run('git', ['clone', '--no-hardlinks', basePath, taskPath]);
  if (result.code !== 0) fail('local task clone failed', result);
}

export async function configureIdentity(taskPath) {
  const email = await run('git', ['-C', taskPath, 'config', 'user.email', 'codehealer-bot@encipherhealth.com']);
  if (email.code !== 0) fail('git identity failed', email);
  const name = await run('git', ['-C', taskPath, 'config', 'user.name', 'CodeHealer Bot']);
  if (name.code !== 0) fail('git identity failed', name);
}

export async function createBranch(taskPath, branchName) {
  const result = await run('git', ['-C', taskPath, 'checkout', '-b', branchName]);
  if (result.code !== 0) fail('branch creation failed', result);
}

export async function hasChanges(taskPath) {
  const status = await statusPorcelain(taskPath);
  return status.trim().length > 0;
}

export async function statusPorcelain(taskPath) {
  const result = await run('git', ['-C', taskPath, 'status', '--porcelain']);
  throwIfGitAborted(result);
  return result.stdout || '';
}

export async function changedFiles(taskPath) {
  return parsePorcelain(await statusPorcelain(taskPath));
}

/** Status plus diff text, so a content edit is visible even when the status letters stay the same. */
export async function worktreeFingerprint(taskPath) {
  const status = await statusPorcelain(taskPath);
  const diff = await run('git', ['-C', taskPath, 'diff', 'HEAD']);
  throwIfGitAborted(diff);
  const cached = await run('git', ['-C', taskPath, 'diff', '--cached']);
  throwIfGitAborted(cached);
  return `${status}\0${cached.stdout || ''}\0${diff.stdout || ''}`;
}

export async function commitAll(taskPath, message) {
  const committed = await commitIfChanges(taskPath, message);
  if (!committed) {
    throw new Error('commit failed: nothing to commit');
  }
}

/** Commits staged work. Returns false when the tree is already clean. */
export async function commitIfChanges(taskPath, message) {
  const added = await run('git', ['-C', taskPath, 'add', '-A']);
  if (added.code !== 0) fail('git add failed', added);
  const staged = await run('git', ['-C', taskPath, 'diff', '--cached', '--quiet']);
  throwIfGitAborted(staged);
  if (staged.code === 0) {
    return false;
  }
  const result = await run('git', ['-C', taskPath, 'commit', '-m', message]);
  if (result.code !== 0) fail('commit failed', result);
  return true;
}

export async function currentBranch(taskPath) {
  const result = await run('git', ['-C', taskPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
  if (result.code !== 0) fail('branch check failed', result);
  return result.stdout.trim();
}

/** SHA of the remote branch, or null when that branch does not exist. */
export async function remoteHead(repoUrl, branchName, gitEnv) {
  const result = await run('git', ['ls-remote', '--heads', repoUrl, `refs/heads/${branchName}`], { env: gitEnv });
  if (result.code !== 0) fail('could not read remote branch', result);
  const line = result.stdout.trim().split('\n').find((entry) => entry.endsWith(`refs/heads/${branchName}`));
  return line ? line.split(/\s+/)[0] : null;
}

export async function pushBranch(taskPath, branchName, remoteUrl, gitEnv) {
  const setUrl = await run('git', ['-C', taskPath, 'remote', 'set-url', 'origin', remoteUrl], { env: gitEnv });
  if (setUrl.code !== 0) fail('remote set-url failed', setUrl);
  const refspec = `HEAD:refs/heads/${branchName}`;
  const result = await run('git', ['-C', taskPath, 'push', '-u', 'origin', refspec], { env: gitEnv });
  if (result.code === 0) {
    return;
  }
  throwIfGitAborted(result);
  const detail = `${result.stderr}\n${result.stdout}`;
  if (!/\[rejected\]|non-fast-forward|fetch first/i.test(detail)) {
    fail('push failed', result);
  }
  const fetched = await run('git', ['-C', taskPath, 'fetch', 'origin', `refs/heads/${branchName}`], { env: gitEnv });
  if (fetched.code !== 0) fail('push failed', result);
  const expectedResult = await run('git', ['-C', taskPath, 'rev-parse', 'FETCH_HEAD']);
  if (expectedResult.code !== 0) fail('push failed', expectedResult);
  const expected = expectedResult.stdout.trim();
  const forced = await run(
      'git',
      ['-C', taskPath, 'push', '-u', `--force-with-lease=refs/heads/${branchName}:${expected}`, 'origin', refspec],
      { env: gitEnv }
  );
  if (forced.code !== 0) fail('push failed', forced.code ? forced : result);
}
