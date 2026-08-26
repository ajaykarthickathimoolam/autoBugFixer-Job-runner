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
  await run('git', ['-C', taskPath, 'add', '-A']);
  const result = await run('git', ['-C', taskPath, 'commit', '-m', message]);
  if (result.code !== 0) {
    throw new Error(`commit failed: ${result.stderr}`);
  }
}

export async function pushBranch(taskPath, branchName, remoteUrl, gitEnv) {
  await run('git', ['-C', taskPath, 'remote', 'set-url', 'origin', remoteUrl]);
  const result = await run('git', ['-C', taskPath, 'push', '-u', 'origin', branchName], { env: gitEnv });
  if (result.code !== 0) {
    throw new Error(`push failed: ${result.stderr}`);
  }
}
