import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from './redact.js';
import { isDeniedRelative } from './pathPolicy.js';
import { needsApproval, parsePorcelain, sameScope } from './scope.js';
import { createGitAuth, toHttpsGithubUrl } from './gitAuth.js';
import { secretPatternIds } from './securityScan.js';

test('redacts tokens that must not reach logs or tickets', () => {
  const raw = [
    'https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz123456@github.com/org/repo.git',
    'Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz123456',
    'api_key = "super-secret-value"',
  ].join('\n');
  const cleaned = redactSecrets(raw);
  assert.equal(cleaned.includes('ghp_abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(cleaned.includes('super-secret-value'), false);
  assert.match(cleaned, /github.com\/org\/repo.git/);
});

test('hides credential files from the model', () => {
  assert.equal(isDeniedRelative('.env'), true);
  assert.equal(isDeniedRelative('config/.env.production'), true);
  assert.equal(isDeniedRelative('.git/config'), true);
  assert.equal(isDeniedRelative('src/App.java'), false);
});

test('asks for approval on workflow files and large change sets', () => {
  assert.equal(needsApproval(['src/A.java']), false);
  assert.equal(needsApproval(['.github/workflows/ci.yml']), true);
  assert.equal(needsApproval(Array.from({ length: 26 }, (_, i) => `f${i}.java`)), true);
});

test('approved scope must cover every current file', () => {
  assert.equal(sameScope(['api:src/A.java'], 'api:src/A.java\napi:src/B.java'), true);
  assert.equal(sameScope(['api:src/C.java'], 'api:src/A.java'), false);
  assert.equal(sameScope(['api:src/A.java'], ''), false);
});

test('parses porcelain paths including renames', () => {
  const files = parsePorcelain(' M src/A.java\nR  old.java -> new.java\n');
  assert.deepEqual(files, ['src/A.java', 'new.java']);
});

test('converts SSH clone URLs to HTTPS without userinfo', () => {
  assert.equal(
    toHttpsGithubUrl('git@github.com:org/repo.git'),
    'https://github.com/org/repo.git'
  );
  assert.equal(
    toHttpsGithubUrl('ssh://git@github.com/org/repo.git'),
    'https://github.com/org/repo.git'
  );
  assert.equal(
    toHttpsGithubUrl('https://x-access-token:secret@github.com/org/repo.git'),
    'https://github.com/org/repo.git'
  );
});

test('prefers a token over an SSH key so git@ URLs clone over HTTPS', async () => {
  const ssh = '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n';
  const auth = await createGitAuth({ githubSshPrivateKey: ssh, githubPat: 'ghs_installationtoken' });
  try {
    assert.equal(auth.resolveUrl('git@github.com:org/repo.git'), 'https://github.com/org/repo.git');
    assert.equal(auth.gitEnv.CODEHEALER_GIT_TOKEN, 'ghs_installationtoken');
    assert.equal(auth.gitEnv.GIT_SSH_COMMAND, undefined);
    assert.equal(auth.fallbackGitEnv, null);
  } finally {
    await auth.cleanup();
  }
});

test('SSH-only auth retries with the machine agent when sandbox is not required', async () => {
  const ssh = '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n';
  const previous = process.env.CODEHEALER_REQUIRE_SANDBOX;
  delete process.env.CODEHEALER_REQUIRE_SANDBOX;
  const auth = await createGitAuth({ githubSshPrivateKey: ssh, githubPat: '' });
  try {
    assert.equal(auth.resolveUrl('git@github.com:org/repo.git'), 'git@github.com:org/repo.git');
    assert.match(auth.gitEnv.GIT_SSH_COMMAND, /IdentitiesOnly=yes/);
    assert.equal(auth.fallbackGitEnv.GIT_SSH_COMMAND, undefined);
  } finally {
    await auth.cleanup();
    if (previous === undefined) delete process.env.CODEHEALER_REQUIRE_SANDBOX;
    else process.env.CODEHEALER_REQUIRE_SANDBOX = previous;
  }
});

test('secret scan ignores PEM placeholders and regex sources', () => {
  assert.deepEqual(secretPatternIds('placeholder="-----BEGIN RSA PRIVATE KEY-----"'), []);
  assert.deepEqual(secretPatternIds('/-----BEGIN OPENSSH PRIVATE KEY-----/'), []);
  const leaked = [
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
    'QyNTUxOQAAACDi3mJ8examplekeymaterialthatislongenoughtoflagasasecretxxx',
    '-----END OPENSSH PRIVATE KEY-----',
  ].join('\n');
  assert.deepEqual(secretPatternIds(leaked), ['private-key']);
});
