import { writeTempKey, cleanupKey, gitEnvForKey } from './ssh.js';

function looksLikeSshPrivateKey(pem) {
  const text = pem == null ? '' : String(pem);
  return /BEGIN (OPENSSH |RSA |EC |DSA )?PRIVATE KEY/.test(text);
}

/** git@github.com:org/repo.git or https://github.com/org/repo.git → https://github.com/org/repo.git */
export function toHttpsGithubUrl(repoUrl) {
  const raw = (repoUrl || '').trim();
  const ssh = raw.match(/^git@([^:]+):(.+)$/);
  if (ssh) {
    const pathPart = ssh[2].replace(/^\/*/, '');
    return `https://${ssh[1]}/${pathPart}`;
  }
  return raw;
}

/**
 * Clone/push auth: a real SSH private key if one was pasted, otherwise the GitHub PAT over HTTPS.
 * Token never goes on the clone URL (avoids leaking it in git stderr).
 */
export async function createGitAuth({ githubSshPrivateKey, githubPat }) {
  if (looksLikeSshPrivateKey(githubSshPrivateKey)) {
    const keyPath = await writeTempKey(githubSshPrivateKey);
    return {
      gitEnv: gitEnvForKey(keyPath),
      resolveUrl: (repoUrl) => repoUrl,
      cleanup: () => cleanupKey(keyPath),
    };
  }

  const pat = githubPat == null ? '' : String(githubPat).trim();
  if (!pat) {
    throw new Error(
        'Git clone needs a GitHub SSH private key (-----BEGIN OPENSSH PRIVATE KEY-----) or a personal access token'
    );
  }

  return {
    gitEnv: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
    resolveUrl: (repoUrl) => {
      const https = toHttpsGithubUrl(repoUrl);
      return https.replace(/^https:\/\//i, `https://x-access-token:${encodeURIComponent(pat)}@`);
    },
    cleanup: async () => {},
  };
}
