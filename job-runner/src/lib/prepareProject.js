import { createGitAuth } from './gitAuth.js';
import * as git from './git.js';
import { basePathFor } from './workspace.js';
import { logger } from './logger.js';

/**
 * Eagerly warms every service's persistent base clone for a project (normally triggered right
 * after the project is created/saved in the backend), so the first real ticket doesn't pay the
 * full clone cost. Safe to call repeatedly - ensureBaseClone just fetches/resets an existing clone.
 */
export async function prepareProject({ projectId, services, githubSshPrivateKey, githubPat }) {
  let gitAuth;
  try {
    gitAuth = await createGitAuth({ githubSshPrivateKey, githubPat });
    const gitEnv = gitAuth.gitEnv;
    const fallbackGitEnv = gitAuth.fallbackGitEnv;
    for (const service of services) {
      const basePath = basePathFor(projectId, service.serviceId);
      try {
        await git.ensureBaseClone({
          basePath,
          repoUrl: gitAuth.resolveUrl(service.repoUrl),
          baseBranch: service.baseBranch,
          gitEnv,
          fallbackGitEnv,
        });
        logger.info(`Prepared base clone for project ${projectId} service "${service.name}"`);
      } catch (err) {
        logger.error(`Failed to prepare base clone for project ${projectId} service "${service.name}": ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`Failed to prepare project ${projectId}: ${err.message}`);
  } finally {
    if (gitAuth) {
      await gitAuth.cleanup();
    }
  }
}
