import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from './redact.js';
import { isDeniedRelative } from './pathPolicy.js';
import { needsApproval, parsePorcelain, sameScope } from './scope.js';

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
