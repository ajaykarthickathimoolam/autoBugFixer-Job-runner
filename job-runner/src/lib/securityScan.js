import fs from 'fs/promises';
import path from 'path';
import { runShell } from './exec.js';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'build', '.idea', '.gradle']);

const TEST_DIR = /(^|\/)(tests?|e2e|__tests__|spec|cypress|playwright)(\/|$)/i;
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/i;

function isTestPath(rel) {
  const n = String(rel || '').replaceAll('\\', '/');
  return TEST_DIR.test(n) || TEST_FILE.test(n);
}

const SECRET_PATTERNS = [
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/ },
  { id: 'generic-secret', re: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{12,}['"]/i },
  { id: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

const SAST_PATTERNS = [
  { id: 'eval', re: /\beval\s*\(/ },
  { id: 'innerHTML', re: /\.innerHTML\s*=/ },
  { id: 'pickle', re: /pickle\.loads?\s*\(/ },
  { id: 'shell-true', re: /subprocess\.[A-Za-z]+\([^)]*shell\s*=\s*True/ },
  { id: 'exec', re: /\bRuntime\.getRuntime\(\)\.exec\s*\(/ },
];

/**
 * Lightweight SAST / secret / dependency scan for the changed workspace.
 * Returns { ok, summary, findings }.
 */
export async function runSecurityScans(dir, serviceName) {
  const findings = [];
  await walk(dir, dir, findings);

  let dependencyNote = 'skipped (no lockfile or audit tool)';
  try {
    const entries = await fs.readdir(dir);
    if (entries.includes('package-lock.json')) {
      const audit = await runShell('npm audit --json --omit=dev', { cwd: dir });
      dependencyNote = `npm audit exit ${audit.code}`;
      if (audit.code !== 0 && audit.stdout) {
        try {
          const json = JSON.parse(audit.stdout);
          const vulns = json.metadata?.vulnerabilities || {};
          const high = (vulns.high || 0) + (vulns.critical || 0);
          if (high > 0) {
            findings.push({
              severity: 'high',
              kind: 'dependency',
              file: 'package-lock.json',
              detail: `${high} high/critical npm advisories`,
            });
          }
        } catch {
          if (audit.code !== 0) {
            findings.push({
              severity: 'medium',
              kind: 'dependency',
              file: 'package-lock.json',
              detail: 'npm audit reported issues',
            });
          }
        }
      }
    }
  } catch {
    // ignore audit failures — still report other scans
  }

  const high = findings.filter((f) => f.severity === 'high' || f.kind === 'secret');
  const summary = [
    `[${serviceName}] ${findings.length} finding(s); ${high.length} high/secret`,
    `Dependency: ${dependencyNote}`,
    ...findings.slice(0, 20).map((f) => `- ${f.kind}/${f.severity} ${f.file}: ${f.detail}`),
  ].join('\n');

  return {
    ok: high.length === 0,
    summary,
    findings,
  };
}

async function walk(root, current, findings) {
  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, findings);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.length > 120) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!['.js', '.ts', '.tsx', '.jsx', '.java', '.py', '.go', '.rb', '.yml', '.yaml', '.env', '.properties', '.xml', '.json', '.md', '.txt'].includes(ext)
        && entry.name !== '.env') {
      continue;
    }
    let text;
    try {
      const buf = await fs.readFile(full);
      if (buf.length > 400_000) continue;
      text = buf.toString('utf8');
    } catch {
      continue;
    }
    const rel = path.relative(root, full);
    const inTests = isTestPath(rel);
    for (const pat of SECRET_PATTERNS) {
      if (inTests && (pat.id === 'generic-secret' || pat.id === 'jwt')) {
        continue;
      }
      if (pat.re.test(text)) {
        findings.push({ severity: 'high', kind: 'secret', file: rel, detail: pat.id });
      }
    }
    if (!inTests) {
      for (const pat of SAST_PATTERNS) {
        if (pat.re.test(text)) {
          findings.push({ severity: 'medium', kind: 'sast', file: rel, detail: pat.id });
        }
      }
    }
  }
}
