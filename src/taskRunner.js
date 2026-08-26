import fs from 'fs/promises';
import { reportStatus, reportLog, checkGuard, lookupIdempotency, rememberIdempotency } from './lib/callback.js';
import { createGitAuth } from './lib/gitAuth.js';
import * as git from './lib/git.js';
import { runClaudeCli } from './lib/claudeCli.js';
import { runGptFixer } from './lib/gptFixer.js';
import { createPullRequest } from './lib/github.js';
import { runShell } from './lib/exec.js';
import { basePathFor, taskRootFor, serviceDirFor, sanitizeBranchSegment } from './lib/workspace.js';
import { buildFixPrompt, buildPlanPrompt, extractChangePlan } from './lib/prompt.js';
import { runSecurityScans } from './lib/securityScan.js';
import { isToolchainFailure } from './lib/verify.js';
import { clearAbort, throwIfAborted, TaskAbortedError } from './lib/abort.js';
import { logger } from './lib/logger.js';

const LOG_TRUNCATE_LENGTH = 4000;

function truncate(text) {
  if (!text) return '';
  return text.length > LOG_TRUNCATE_LENGTH ? `...${text.slice(-LOG_TRUNCATE_LENGTH)}` : text;
}

class GuardDeniedError extends Error {
  constructor(decision) {
    super(decision.reason || 'Guard denied this action');
    this.name = 'GuardDeniedError';
    this.haltStatus = decision.haltStatus || 'FAILED';
  }
}

async function requireGuard(jobId, action) {
  throwIfAborted(jobId);
  const decision = await checkGuard(jobId, action);
  if (!decision.allowed) {
    throw new GuardDeniedError(decision);
  }
}

async function runFixer(task, taskRoot, prompt, jobId) {
  const provider = (task.llmProvider || 'GPT').toUpperCase();
  await reportLog(jobId, `Invoking ${provider === 'GPT' ? 'GPT (Azure OpenAI)' : 'Claude Code'}...`);
  try {
    if (provider === 'GPT') {
      return await runGptFixer({
        cwd: taskRoot,
        prompt,
        azure: {
          endpoint: task.azureOpenAiEndpoint,
          apiKey: task.azureOpenAiApiKey,
          apiVersion: task.azureOpenAiApiVersion,
          deployment: task.azureOpenAiDeployment,
        },
        onLog: (chunk) => {
          reportLog(jobId, truncate(String(chunk).trim())).catch(() => {});
        },
      });
    }
    return await runClaudeCli({
      cwd: taskRoot,
      prompt,
      apiKey: task.claudeApiToken,
      onLog: (chunk) => {
        reportLog(jobId, truncate(chunk.trim())).catch(() => {});
      },
    });
  } catch (err) {
    throw new Error(`${provider === 'GPT' ? 'GPT fixer' : 'Claude Code CLI'} failed: ${err.message}`);
  }
}

/**
 * Drives one job end to end. PLAN phase produces a reviewable change plan and stops.
 * EXECUTE phase applies the approved plan, fails on test/scan errors, then opens PRs.
 */
export async function runTask(task) {
  const jobId = task.jobId;
  const branchName = `feature/${sanitizeBranchSegment(task.ticketId)}`;
  const taskRoot = taskRootFor(task.projectId, jobId);
  const prUrls = [];
  const scanSummaries = [];
  let gitAuth;
  let awaitingInput = false;
  let awaitingApproval = false;
  const phase = (task.phase || 'EXECUTE').toUpperCase();
  clearAbort(jobId);

  try {
    gitAuth = await createGitAuth({
      githubSshPrivateKey: task.githubSshPrivateKey,
      githubPat: task.githubPat,
    });
    const gitEnv = gitAuth.gitEnv;

    try {
      await fs.rm(taskRoot, { recursive: true, force: true }).catch(() => {});

      await requireGuard(jobId, 'CLONE');
      await reportStatus(jobId, 'CLONING');
      await reportLog(jobId, `Checking out and pulling the base branch for ${task.services.length} service(s)...`);

      const serviceDirs = [];
      for (const service of task.services) {
        throwIfAborted(jobId);
        const basePath = basePathFor(task.projectId, service.serviceId);
        const repoUrl = gitAuth.resolveUrl(service.repoUrl);
        await git.ensureBaseClone({ basePath, repoUrl, baseBranch: service.baseBranch, gitEnv });

        const dir = serviceDirFor(taskRoot, service.name);
        await git.cloneLocalForTask(basePath, dir);
        await git.configureIdentity(dir);
        await git.createBranch(dir, branchName);
        serviceDirs.push({ service, dir });
      }

      if (phase === 'PLAN') {
        await requireGuard(jobId, 'ANALYZE');
        await reportStatus(jobId, 'ANALYZING');
        const prompt = buildPlanPrompt(task, serviceDirs, task.clarificationLevel);
        const output = await runFixer(task, taskRoot, prompt, jobId);
        const needsInputMatch = output.match(/^NEEDS_INPUT:\s*(.+)$/mi);
        if (needsInputMatch) {
          awaitingInput = true;
          await reportLog(jobId, `Fixer paused - needs clarification: ${needsInputMatch[1].trim()}`);
          await reportStatus(jobId, 'AWAITING_INPUT', { message: needsInputMatch[1].trim() });
          return;
        }
        const plan = extractChangePlan(output);
        awaitingApproval = true;
        await reportLog(jobId, 'Change plan ready for human approval.');
        await reportStatus(jobId, 'AWAITING_APPROVAL', { message: plan, changePlan: plan });
        return;
      }

      await requireGuard(jobId, 'FIX');
      await reportStatus(jobId, 'FIXING');
      const prompt = buildFixPrompt(task, serviceDirs, task.clarificationLevel);
      const fixerOutput = await runFixer(task, taskRoot, prompt, jobId);

      const needsInputMatch = fixerOutput.match(/^NEEDS_INPUT:\s*(.+)$/mi);
      if (needsInputMatch) {
        awaitingInput = true;
        await reportLog(jobId, `Fixer paused - needs clarification: ${needsInputMatch[1].trim()}`);
        await reportStatus(jobId, 'AWAITING_INPUT', { message: needsInputMatch[1].trim() });
        return;
      }

      const changed = [];
      for (const entry of serviceDirs) {
        if (await git.hasChanges(entry.dir)) {
          changed.push(entry);
        }
      }
      if (changed.length === 0) {
        throw new Error('Fixer made no changes in any service');
      }
      await reportLog(jobId, `Fixer changed ${changed.length} of ${serviceDirs.length} service(s): ${changed.map((c) => c.service.name).join(', ')}`);

      const testsMustPass = task.testsMustPass !== false;
      const verifyNotes = [];
      if (changed.some((c) => c.service.buildCommand || c.service.testCommand)) {
        await requireGuard(jobId, 'VERIFY');
        await reportStatus(jobId, 'VERIFYING');
      }
      for (const { service, dir } of changed) {
        throwIfAborted(jobId);
        if (service.buildCommand) {
          const buildResult = await runShell(service.buildCommand, { cwd: dir });
          const output = `${buildResult.stdout}${buildResult.stderr}`;
          const toolchain = buildResult.code !== 0 && isToolchainFailure(output);
          await reportLog(
              jobId,
              `[${service.name}] Build command exited ${buildResult.code}\n${truncate(output)}`,
              buildResult.code === 0 ? 'INFO' : toolchain ? 'WARN' : 'ERROR'
          );
          if (toolchain) {
            const note = `[${service.name}] Build skipped as a runner toolchain issue (not a regression of this change).`;
            verifyNotes.push(note);
            await reportLog(jobId, note, 'WARN');
          } else if (testsMustPass && buildResult.code !== 0) {
            throw new Error(`[${service.name}] Build failed (exit ${buildResult.code})`);
          }
        }
        if (service.testCommand) {
          const testResult = await runShell(service.testCommand, { cwd: dir });
          const output = `${testResult.stdout}${testResult.stderr}`;
          const toolchain = testResult.code !== 0 && isToolchainFailure(output);
          await reportLog(
              jobId,
              `[${service.name}] Test command exited ${testResult.code}\n${truncate(output)}`,
              testResult.code === 0 ? 'INFO' : toolchain ? 'WARN' : 'ERROR'
          );
          if (toolchain) {
            const note = `[${service.name}] Tests skipped as a runner toolchain issue (not a regression of this change).`;
            verifyNotes.push(note);
            await reportLog(jobId, note, 'WARN');
          } else if (testsMustPass && testResult.code !== 0) {
            throw new Error(`[${service.name}] Tests failed (exit ${testResult.code})`);
          }
        }
      }

      if (task.securityScansEnabled !== false) {
        await requireGuard(jobId, 'SCAN');
        await reportStatus(jobId, 'SCANNING');
        for (const { service, dir } of changed) {
          throwIfAborted(jobId);
          const scan = await runSecurityScans(dir, service.name);
          scanSummaries.push(scan.summary);
          await reportLog(jobId, scan.summary, scan.ok ? 'INFO' : 'ERROR');
          if (!scan.ok) {
            throw new Error(`[${service.name}] Security scan failed:\n${scan.summary}`);
          }
        }
      }

      const scanBody = scanSummaries.length ? `\n\n## Security scans\n${scanSummaries.join('\n\n')}` : '';
      const planBody = task.approvedChangePlan ? `\n\n## Approved change plan\n${task.approvedChangePlan}` : '';
      const verifyBody = verifyNotes.length
          ? `\n\n## Verification notes\n${verifyNotes.join('\n')}`
          : '';

      for (const { service, dir } of changed) {
        throwIfAborted(jobId);
        await git.commitAll(dir, `Fix ${task.ticketId}: ${task.ticketTitle || 'automated fix'}`);
        await git.pushBranch(dir, branchName, gitAuth.resolveUrl(service.repoUrl), gitEnv);

        await requireGuard(jobId, 'CREATE_PR');
        const idemKey = `pr:${jobId}:${service.serviceId || service.name}`;
        const existing = await lookupIdempotency(idemKey);
        let prUrl = existing;
        if (!prUrl) {
          prUrl = await createPullRequest({
            repoUrl: service.repoUrl,
            head: branchName,
            base: service.baseBranch,
            title: `Fix ${task.ticketId}: ${task.ticketTitle || 'automated fix'}`,
            body: `Automated fix by CodeHealer for ticket ${task.ticketId}. Does not merge.\n\n${task.ticketDescription || ''}${planBody}${scanBody}${verifyBody}`,
            pat: task.githubPat,
          });
          await rememberIdempotency(idemKey, jobId, 'CREATE_PR', prUrl);
        } else {
          await reportLog(jobId, `Reused existing PR for "${service.name}" (idempotent): ${prUrl}`);
        }
        prUrls.push(prUrl);
        await reportLog(jobId, `Opened PR for service "${service.name}": ${prUrl}`);
      }

      await reportStatus(jobId, 'PR_CREATED', {
        prUrl: prUrls.join(', '),
        securityScanSummary: scanSummaries.join('\n\n'),
      });
    } finally {
      if (!awaitingInput && !awaitingApproval) {
        await fs.rm(taskRoot, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error(`Task ${jobId} failed: ${err.stack || err.message}`);
    if (err instanceof TaskAbortedError) {
      await reportStatus(jobId, 'CANCELLED', { message: err.message });
    } else if (err instanceof GuardDeniedError) {
      await reportStatus(jobId, err.haltStatus || 'FAILED', { message: err.message });
    } else {
      await reportStatus(jobId, 'FAILED', { message: err.message });
    }
  } finally {
    if (gitAuth) {
      await gitAuth.cleanup();
    }
    clearAbort(jobId);
  }
}
