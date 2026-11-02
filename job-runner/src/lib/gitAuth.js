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
  const ssh = raw.match(/^git@([^:]+):(.+)$/);
  if (ssh) {
    const pathPart = ssh[2].replace(/^\/*/, '');
    return `https://${ssh[1]}/${pathPart}`;
  }
  return raw.replace(/\/\/[^/\s]*@/, '//');
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

/**
 * Clone/push auth. A real SSH key is preferred. Otherwise the PAT is handed to git through
 * GIT_ASKPASS and is never written into the remote URL or .git/config.
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
    resolveUrl: (repoUrl) => toHttpsGithubUrl(repoUrl),
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}
