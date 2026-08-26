import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export async function writeTempKey(pemContents) {
  if (!pemContents) {
    throw new Error('No GitHub SSH private key configured for this project');
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codehealer-key-'));
  const keyPath = path.join(dir, 'id_key');
  const normalized = pemContents.endsWith('\n') ? pemContents : `${pemContents}\n`;
  await fs.writeFile(keyPath, normalized, { mode: 0o600 });
  return keyPath;
}

export async function cleanupKey(keyPath) {
  try {
    await fs.rm(path.dirname(keyPath), { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
}

/**
 * GitHub's host key is pinned into /etc/ssh/ssh_known_hosts at image build time (see Dockerfile),
 * so this deliberately does NOT disable host key checking.
 */
export function gitEnvForKey(keyPath) {
  return {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes`,
  };
}
