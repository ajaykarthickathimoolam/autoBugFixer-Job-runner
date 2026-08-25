import fs from 'fs/promises';
import { reportStatus, reportLog } from './lib/callback.js';
import { createGitAuth } from './lib/gitAuth.js';
import * as git from './lib/git.js';
import { runClaudeCli } from './lib/claudeCli.js';
import { runGptFixer } from './lib/gptFixer.js';
import { createPullRequest } from './lib/github.js';
import { runShell } from './lib/exec.js';
import { basePathFor, taskRootFor, serviceDirFor, sanitizeBranchSegment } from './lib/workspace.js';
import { buildFixPrompt } from './lib/prompt.js';
import { logger } from './lib/logger.js';

const LOG_TRUNCATE_LENGTH = 4000;

function truncate(text) {
  if (!text) return '';
  return text.length > LOG_TRUNCATE_LENGTH ? `...${text.slice(-LOG_TRUNCATE_LENGTH)}` : text;
}

/**
 * Drives one job end to end. Every service is checked out as a sibling subfolder under one task
 * root, and Claude Code runs ONCE with that root as its cwd - it decides for itself which
 * service(s) are actually relevant and edits only those, rather than being pre-told by a separate
 * classification call. Any service left unchanged after that run is skipped; every service that
 * was changed gets its own commit/build-verify/push/PR, so one ticket can produce more than one PR.
 */
export async function runTask(task) {
  const jobId = task.jobId;
  const branchName = `feature/${sanitizeBranchSegment(task.ticketId)}`;
  const taskRoot = taskRootFor(task.projectId, jobId);
  const prUrls = [];
  let gitAuth;
  let awaitingInput = false;

  try {
    gitAuth = await createGitAuth({
      githubSshPrivateKey: task.githubSshPrivateKey,
      githubPat: task.githubPat,
    });
    const gitEnv = gitAuth.gitEnv;

    try {
      // A resumed job (after AWAITING_INPUT) reuses the same jobId, so taskRoot is the same
      // directory a paused run deliberately left behind uncleaned - clear it before cloning.
      await fs.rm(taskRoot, { recursive: true, force: true }).catch(() => {});

      await reportStatus(jobId, 'CLONING');
      await reportLog(jobId, `Checking out and pulling the base branch for ${task.services.length} service(s)...`);

      const serviceDirs = [];
      for (const service of task.services) {
        const basePath = basePathFor(task.projectId, service.serviceId);
        const repoUrl = gitAuth.resolveUrl(service.repoUrl);
        await git.ensureBaseClone({ basePath, repoUrl, baseBranch: service.baseBranch, gitEnv });

        const dir = serviceDirFor(taskRoot, service.name);
        await git.cloneLocalForTask(basePath, dir);
        await git.configureIdentity(dir);
        await git.createBranch(dir, branchName);
        serviceDirs.push({ service, dir });
      }

      await reportStatus(jobId, 'FIXING');
      const provider = (task.llmProvider || 'GPT').toUpperCase();
      await reportLog(jobId, `Invoking ${provider === 'GPT' ? 'GPT (Azure OpenAI)' : 'Claude Code'} across ${serviceDirs.length} service(s) to implement the fix...`);

      const prompt = buildFixPrompt(task, serviceDirs, task.clarificationLevel);
      let fixerOutput;
      try {
        if (provider === 'GPT') {
          fixerOutput = await runGptFixer({
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
        } else {
          fixerOutput = await runClaudeCli({
            cwd: taskRoot,
            prompt,
            apiKey: task.claudeApiToken,
            onLog: (chunk) => {
              reportLog(jobId, truncate(chunk.trim())).catch(() => {});
            },
          });
        }
      } catch (err) {
        throw new Error(`${provider === 'GPT' ? 'GPT fixer' : 'Claude Code CLI'} failed: ${err.message}`);
      }

      const needsInputMatch = fixerOutput.match(/^NEEDS_INPUT:\s*(.+)$/mi);
      if (needsInputMatch) {
        awaitingInput = true;
        await reportLog(jobId, `Fixer paused - needs clarification: ${needsInputMatch[1].trim()}`);
        await reportStatus(jobId, 'AWAITING_INPUT', { message: needsInputMatch[1].trim() });
        // Pause the whole task here - once a human replies on the Zoho ticket, the poller
        // starts a brand new task (fresh clone) with the answer folded into the ticket
        // description, rather than resuming this in-process run.
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

      if (changed.some((c) => c.service.buildCommand || c.service.testCommand)) {
        await reportStatus(jobId, 'VERIFYING');
      }
      for (const { service, dir } of changed) {
        if (service.buildCommand) {
          const buildResult = await runShell(service.buildCommand, { cwd: dir });
          await reportLog(
              jobId,
              `[${service.name}] Build command exited ${buildResult.code}\n${truncate(buildResult.stdout + buildResult.stderr)}`,
              buildResult.code === 0 ? 'INFO' : 'WARN'
          );
        }
        if (service.testCommand) {
          const testResult = await runShell(service.testCommand, { cwd: dir });
          await reportLog(
              jobId,
              `[${service.name}] Test command exited ${testResult.code}\n${truncate(testResult.stdout + testResult.stderr)}`,
              testResult.code === 0 ? 'INFO' : 'WARN'
          );
        }
      }

      for (const { service, dir } of changed) {
        await git.commitAll(dir, `Fix ${task.ticketId}: ${task.ticketTitle || 'automated fix'}`);
        await git.pushBranch(dir, branchName, gitAuth.resolveUrl(service.repoUrl), gitEnv);

        const prUrl = await createPullRequest({
          repoUrl: service.repoUrl,
          head: branchName,
          base: service.baseBranch,
          title: `Fix ${task.ticketId}: ${task.ticketTitle || 'automated fix'}`,
          body: `Automated fix by CodeHealer for ticket ${task.ticketId}.\n\n${task.ticketDescription || ''}`,
          pat: task.githubPat,
        });
        prUrls.push(prUrl);
        await reportLog(jobId, `Opened PR for service "${service.name}": ${prUrl}`);
      }

      await reportStatus(jobId, 'PR_CREATED', { prUrl: prUrls.join(', ') });
    } finally {
      if (!awaitingInput) {
        await fs.rm(taskRoot, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error(`Task ${jobId} failed: ${err.stack || err.message}`);
    await reportStatus(jobId, 'FAILED', { message: err.message });
  } finally {
    if (gitAuth) {
      await gitAuth.cleanup();
    }
  }
}
