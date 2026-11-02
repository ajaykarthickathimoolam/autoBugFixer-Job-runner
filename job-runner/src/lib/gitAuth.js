import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { gitEnvForKey, writeTempKey, cleanupKey } from './ssh.js';

function looksLikeSshPrivateKey(pem) {
  const text = pem == null ? '' : String(pem);
  return /BEGIN (OPENSSH |RSA |EC |DSA )?PRIVATE KEY/.test(text);
}

/** git@github.com:org/repo.git or https://github.com/org/repo.git → https://github.com/org/repo.git */
export function toHttpsGithubUrl(repoUrl) {
  const raw = (repoUrl || '').trim();
  const scp = raw.match(/^git@([^:]+):(.+)$/);
  if (scp) {
    return `https://${scp[1]}/${scp[2].replace(/^\/*/, '')}`;
  }
  const sshUri = raw.match(/^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/i);
  if (sshUri) {
    return `https://${sshUri[1]}/${sshUri[2]}`;
  }
  return raw.replace(/^(https?:\/\/)[^/\s]*@/i, '$1');
}

function minimalGitEnv(extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG || 'C.UTF-8',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    ...extra,
  };
}

/** Local runner only: retry with the machine agent if the stored deploy key is rejected. */
export function hostSshFallbackEnv() {
  if (process.env.CODEHEALER_REQUIRE_SANDBOX === 'true') {
    return null;
  }
  const extra = {};
  if (process.env.USER) extra.USER = process.env.USER;
  if (process.env.SSH_AUTH_SOCK) extra.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;
  return minimalGitEnv(extra);
}

/**
 * Clone/push auth. A GitHub App installation token or PAT is preferred: git uses HTTPS
 * and GIT_ASKPASS, so the token never lands in the remote URL or .git/config.
 * An SSH deploy key is used only when no token is present.
 */
export async function createGitAuth({ githubSshPrivateKey, githubPat }) {
  const pat = githubPat == null ? '' : String(githubPat).trim();
  if (pat) {
    return createAskpassAuth(pat);
  }

  if (looksLikeSshPrivateKey(githubSshPrivateKey)) {
    const keyPath = await writeTempKey(githubSshPrivateKey);
    return {
      gitEnv: gitEnvForKey(keyPath),
      fallbackGitEnv: hostSshFallbackEnv(),
      resolveUrl: (repoUrl) => repoUrl,
      cleanup: () => cleanupKey(keyPath),
    };
  }

  throw new Error(
      'Git clone needs a GitHub App, a personal access token, or an OPENSSH deploy key. git@ URLs cannot clone with no credential.'
  );
}

async function createAskpassAuth(pat) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codehealer-askpass-'));
  const scriptPath = path.join(dir, 'askpass.sh');
  const script = `#!/bin/sh
case "$1" in
  *[Uu]sername*) printf '%s\\n' 'x-access-token' ;;
  *) printf '%s\\n' "$CODEHEALER_GIT_TOKEN" ;;
esac
`;
  await fs.writeFile(scriptPath, script, { mode: 0o700 });
  return {
    gitEnv: minimalGitEnv({
      GIT_ASKPASS: scriptPath,
      SSH_ASKPASS: scriptPath,
      SSH_ASKPASS_REQUIRE: 'force',
      CODEHEALER_GIT_TOKEN: pat,
    }),
    fallbackGitEnv: null,
    resolveUrl: (repoUrl) => toHttpsGithubUrl(repoUrl),
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}
