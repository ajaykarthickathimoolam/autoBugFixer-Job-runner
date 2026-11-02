import fs from 'fs/promises';
import path from 'path';
import { run } from './exec.js';

function redactGitOutput(text) {
  return String(text || '')
      .replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@')
      .replace(/Bearer\s+\S+/gi, 'Bearer ***');
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
 * Refreshes the persistent per-service base clone: fetch + hard reset + clean if it already
 * exists, otherwise a fresh clone. Guards against the base copy being left dirty/broken by a
 * prior run.
 */
export async function ensureBaseClone({ basePath, repoUrl, baseBranch, gitEnv }) {
  if (await pathExists(path.join(basePath, '.git'))) {
    await run('git', ['-C', basePath, 'fetch', 'origin', baseBranch], { env: gitEnv });
    const checkout = await run('git', ['-C', basePath, 'checkout', baseBranch], { env: gitEnv });
    if (checkout.code !== 0) {
      throw new Error(`checkout ${baseBranch} failed: ${checkout.stderr}`);
    }
    const reset = await run('git', ['-C', basePath, 'reset', '--hard', `origin/${baseBranch}`], { env: gitEnv });
    if (reset.code !== 0) {
      throw new Error(`reset to origin/${baseBranch} failed: ${reset.stderr}`);
    }
    await run('git', ['-C', basePath, 'clean', '-fd'], { env: gitEnv });
  } else {
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(basePath, { recursive: true });
    const result = await run('git', ['clone', '--branch', baseBranch, repoUrl, basePath], { env: gitEnv });
    if (result.code !== 0) {
      throw new Error(`git clone failed: ${redactGitOutput(result.stderr)}`);
    }
  }
}

export async function cloneLocalForTask(basePath, taskPath) {
  await fs.mkdir(path.dirname(taskPath), { recursive: true });
  const result = await run('git', ['clone', basePath, taskPath]);
  if (result.code !== 0) {
    throw new Error(`local task clone failed: ${result.stderr}`);
  }
}

export async function configureIdentity(taskPath) {
  await run('git', ['-C', taskPath, 'config', 'user.email', 'codehealer-bot@encipherhealth.com']);
  await run('git', ['-C', taskPath, 'config', 'user.name', 'CodeHealer Bot']);
}

export async function createBranch(taskPath, branchName) {
  const result = await run('git', ['-C', taskPath, 'checkout', '-b', branchName]);
  if (result.code !== 0) {
    throw new Error(`branch creation failed: ${result.stderr}`);
  }
}

export async function hasChanges(taskPath) {
  const result = await run('git', ['-C', taskPath, 'status', '--porcelain']);
  return result.stdout.trim().length > 0;
}

export async function commitAll(taskPath, message) {
  const committed = await commitIfChanges(taskPath, message);
  if (!committed) {
    throw new Error('commit failed: nothing to commit');
  }
}

/** Commits staged work. Returns false when the tree is already clean. */
export async function commitIfChanges(taskPath, message) {
  await run('git', ['-C', taskPath, 'add', '-A']);
  const staged = await run('git', ['-C', taskPath, 'diff', '--cached', '--quiet']);
  if (staged.code === 0) {
    return false;
  }
  const result = await run('git', ['-C', taskPath, 'commit', '-m', message]);
  if (result.code !== 0) {
    throw new Error(`commit failed: ${redactGitOutput(result.stderr)}`);
  }
  return true;
}

export async function currentBranch(taskPath) {
  const result = await run('git', ['-C', taskPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
  if (result.code !== 0) {
    throw new Error(`branch check failed: ${redactGitOutput(result.stderr)}`);
  }
  return result.stdout.trim();
}

/** SHA of the remote branch, or null when that branch does not exist. */
export async function remoteHead(repoUrl, branchName, gitEnv) {
  const result = await run('git', ['ls-remote', '--heads', repoUrl, `refs/heads/${branchName}`], { env: gitEnv });
  if (result.code !== 0) {
    throw new Error(`could not read remote branch: ${redactGitOutput(result.stderr)}`);
  }
  const line = result.stdout.trim().split('\n').find((entry) => entry.endsWith(`refs/heads/${branchName}`));
  return line ? line.split(/\s+/)[0] : null;
}

export async function pushBranch(taskPath, branchName, remoteUrl, gitEnv) {
  await run('git', ['-C', taskPath, 'remote', 'set-url', 'origin', remoteUrl]);
  const refspec = `HEAD:refs/heads/${branchName}`;
  const result = await run('git', ['-C', taskPath, 'push', '-u', 'origin', refspec], { env: gitEnv });
  if (result.code === 0) {
    return;
  }
  const detail = `${result.stderr}\n${result.stdout}`;
  if (!/\[rejected\]|non-fast-forward|fetch first/i.test(detail)) {
    throw new Error(`push failed: ${redactGitOutput(result.stderr)}`);
  }
  const fetched = await run('git', ['-C', taskPath, 'fetch', 'origin', `refs/heads/${branchName}`], { env: gitEnv });
  if (fetched.code !== 0) {
    throw new Error(`push failed: ${redactGitOutput(result.stderr)}`);
  }
  const expected = (await run('git', ['-C', taskPath, 'rev-parse', 'FETCH_HEAD'])).stdout.trim();
  const forced = await run(
      'git',
      ['-C', taskPath, 'push', '-u', `--force-with-lease=refs/heads/${branchName}:${expected}`, 'origin', refspec],
      { env: gitEnv }
  );
  if (forced.code !== 0) {
    throw new Error(`push failed: ${redactGitOutput(forced.stderr || result.stderr)}`);
  }
}
