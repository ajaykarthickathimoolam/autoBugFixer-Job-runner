import fs from 'fs/promises';
import { reportStatus, reportLog, checkGuard, lookupIdempotency, rememberIdempotency } from './lib/callback.js';
import { createGitAuth } from './lib/gitAuth.js';
import * as git from './lib/git.js';
import { runClaudeCli } from './lib/claudeCli.js';
import { runGptFixer } from './lib/gptFixer.js';
import { createPullRequest } from './lib/github.js';
import { runShell } from './lib/exec.js';
import { basePathFor, taskRootFor, serviceDirFor, sanitizeBranchSegment } from './lib/workspace.js';
import { buildFixPrompt, buildPlanPrompt, extractChangePlan, ticketTooVague, vagueTicketQuestion } from './lib/prompt.js';
import { runSecurityScans } from './lib/securityScan.js';
import { isToolchainFailure } from './lib/verify.js';
import { clearAbort, throwIfAborted, TaskAbortedError } from './lib/abort.js';
import { logger } from './lib/logger.js';

const LOG_TRUNCATE_LENGTH = 4000;
const STEP_ORDER = ['CLONE', 'FIX', 'VERIFY', 'SCAN', 'PUSH', 'PR'];

const RESUME_LABELS = {
  CLONE: 'clone',
  FIX: 'the fix',
  VERIFY: 'build and tests',
  SCAN: 'security scans',
  PUSH: 'the push',
  PR: 'the pull request',
};

function normalizeResume(value) {
  const step = String(value || 'CLONE').toUpperCase();
  return STEP_ORDER.includes(step) ? step : 'CLONE';
}

function stepReached(resume, step) {
  return STEP_ORDER.indexOf(resume) <= STEP_ORDER.indexOf(step);
}

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
  let failed = false;
  const phase = (task.phase || 'EXECUTE').toUpperCase();
  let resume = phase === 'PLAN' ? 'CLONE' : normalizeResume(task.resumeFrom);
  clearAbort(jobId);

  try {
    const clarificationLevel = (task.clarificationLevel || 'MEDIUM').toUpperCase();
    const skipAsk = clarificationLevel === 'NONE';
    const alreadyApproved = !!(task.approvedChangePlan && String(task.approvedChangePlan).trim());
    if (!skipAsk && !alreadyApproved && ticketTooVague(task)) {
      const question = vagueTicketQuestion(task);
      awaitingInput = true;
      await reportLog(jobId, `Ticket is too vague to plan or fix — asking on the ticket: ${question}`);
      await reportStatus(jobId, 'AWAITING_INPUT', { message: question });
      return;
    }

    gitAuth = await createGitAuth({
      githubSshPrivateKey: task.githubSshPrivateKey,
      githubPat: task.githubPat,
    });
    const gitEnv = gitAuth.gitEnv;

      if (resume !== 'CLONE') {
        await reportLog(jobId, `Resuming from ${RESUME_LABELS[resume] || resume}. Steps that already succeeded are skipped.`);
      }
      if (resume === 'PR') {
        const onRemote = await anyRemoteBranch(task, branchName, gitAuth, gitEnv);
        if (!onRemote) {
          await reportLog(jobId, 'The feature branch is no longer on GitHub, so the fix will be applied again.');
          resume = 'FIX';
        }
      } else if (resume === 'PUSH' && !(await workspaceReady(task, taskRoot))) {
        const onRemote = await anyRemoteBranch(task, branchName, gitAuth, gitEnv);
        if (onRemote) {
          await reportLog(jobId, 'The feature branch is already on GitHub, so this retry opens the pull request.');
          resume = 'PR';
        } else {
          await reportLog(jobId, 'The checkout from the failed run is gone, so the fix will be applied again.');
          resume = 'FIX';
        }
      } else if ((resume === 'VERIFY' || resume === 'SCAN') && !(await workspaceReady(task, taskRoot))) {
        await reportLog(jobId, 'The checkout from the failed run is gone, so the fix will be applied again.');
        resume = 'FIX';
      }

      if (resume === 'CLONE' || resume === 'FIX') {
        await fs.rm(taskRoot, { recursive: true, force: true }).catch(() => {});
      }

      let serviceDirs = await loadServiceDirs(task, taskRoot);
      if (resume === 'CLONE' || resume === 'FIX' || serviceDirs.length === 0 && resume !== 'PR') {
        await requireGuard(jobId, 'CLONE');
        await reportStatus(jobId, 'CLONING');
        await reportLog(jobId, `Checking out and pulling the base branch for ${task.services.length} service(s)...`);
        serviceDirs = [];
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

      let changed = [];
      if (stepReached(resume, 'FIX')) {
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

        for (const entry of serviceDirs) {
          if (await git.hasChanges(entry.dir)) {
            changed.push(entry);
          }
        }
        if (changed.length === 0) {
          throw new Error('Fixer made no changes in any service');
        }
        await reportLog(jobId, `Fixer changed ${changed.length} of ${serviceDirs.length} service(s): ${changed.map((c) => c.service.name).join(', ')}`);
      } else if (resume !== 'PR') {
        for (const entry of serviceDirs) {
          const branch = await git.currentBranch(entry.dir);
          if (branch === branchName || await git.hasChanges(entry.dir)) {
            changed.push(entry);
          }
        }
        if (changed.length === 0) {
          throw new Error('Nothing left to continue from the failed run');
        }
      }

      const testsMustPass = task.testsMustPass !== false;
      const verifyNotes = [];
      if (stepReached(resume, 'VERIFY') && changed.some((c) => c.service.buildCommand || c.service.testCommand)) {
        await requireGuard(jobId, 'VERIFY');
        await reportStatus(jobId, 'VERIFYING');
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
      }

      if (stepReached(resume, 'SCAN') && task.securityScansEnabled !== false) {
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

      const savedScan = task.securityScanSummary ? String(task.securityScanSummary).trim() : '';
      const scanText = scanSummaries.length ? scanSummaries.join('\n\n') : savedScan;
      const scanBody = scanText ? `\n\n## Security scans\n${scanText}` : '';
      const planBody = task.approvedChangePlan ? `\n\n## Approved change plan\n${task.approvedChangePlan}` : '';
      const verifyBody = verifyNotes.length
          ? `\n\n## Verification notes\n${verifyNotes.join('\n')}`
          : '';
      const prBody = `Automated fix by CodeHealer for ticket ${task.ticketId}. Does not merge.\n\n${task.ticketDescription || ''}${planBody}${scanBody}${verifyBody}`;

      const publish = resume === 'PR' ? await servicesOnRemote(task, branchName, gitAuth, gitEnv) : changed;
      if (publish.length === 0) {
        throw new Error(`No feature branch named ${branchName} is on GitHub to open a pull request from`);
      }

      for (const { service, dir } of publish) {
        throwIfAborted(jobId);
        if (resume !== 'PR') {
          await git.commitIfChanges(dir, `Fix ${task.ticketId}: ${task.ticketTitle || 'automated fix'}`);
          await git.pushBranch(dir, branchName, gitAuth.resolveUrl(service.repoUrl), gitEnv);
        }

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
            body: prBody,
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
        securityScanSummary: scanText,
      });
  } catch (err) {
    failed = true;
    logger.error(`Task ${jobId} failed: ${err.stack || err.message}`);
    if (err instanceof TaskAbortedError) {
      await reportStatus(jobId, 'CANCELLED', { message: err.message });
    } else if (err instanceof GuardDeniedError) {
      await reportStatus(jobId, err.haltStatus || 'FAILED', { message: err.message });
    } else {
      await reportStatus(jobId, 'FAILED', { message: err.message });
    }
  } finally {
    if (!awaitingInput && !awaitingApproval && !failed) {
      await fs.rm(taskRoot, { recursive: true, force: true }).catch(() => {});
    }
    if (gitAuth) {
      await gitAuth.cleanup();
    }
    clearAbort(jobId);
  }
}

async function workspaceReady(task, taskRoot) {
  const dirs = await loadServiceDirs(task, taskRoot);
  return dirs.length > 0;
}

async function loadServiceDirs(task, taskRoot) {
  const dirs = [];
  for (const service of task.services || []) {
    const dir = serviceDirFor(taskRoot, service.name);
    try {
      await fs.access(`${dir}/.git`);
      dirs.push({ service, dir });
    } catch {
      /* checkout was not kept */
    }
  }
  return dirs;
}

async function anyRemoteBranch(task, branchName, gitAuth, gitEnv) {
  for (const service of task.services || []) {
    const sha = await git.remoteHead(gitAuth.resolveUrl(service.repoUrl), branchName, gitEnv);
    if (sha) return true;
  }
  return false;
}

async function servicesOnRemote(task, branchName, gitAuth, gitEnv) {
  const found = [];
  for (const service of task.services || []) {
    const sha = await git.remoteHead(gitAuth.resolveUrl(service.repoUrl), branchName, gitEnv);
    if (sha) found.push({ service, dir: null });
  }
  return found;
}
