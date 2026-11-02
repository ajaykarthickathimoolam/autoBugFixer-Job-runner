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
  // Header plus key material. A placeholder or regex source with only the BEGIN line is not a secret.
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{64,}/ },
  { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/ },
  { id: 'generic-secret', re: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{12,}['"]/i },
  { id: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

export function secretPatternIds(text) {
  return SECRET_PATTERNS.filter((pat) => pat.re.test(String(text || ''))).map((pat) => pat.id);
}

const SAST_PATTERNS = [
  { id: 'eval', re: /\beval\s*\(/ },
  { id: 'innerHTML', re: /\.innerHTML\s*=/ },
  { id: 'pickle', re: /pickle\.loads?\s*\(/ },
  { id: 'shell-true', re: /subprocess\.[A-Za-z]+\([^)]*shell\s*=\s*True/ },
  { id: 'exec', re: /\bRuntime\.getRuntime\(\)\.exec\s*\(/ },
];

const FIXER_ONLY = 'The fixer will do only that.';

export function isBlockingFinding(finding) {
  return finding.kind === 'secret' || finding.severity === 'high' || finding.severity === 'critical';
}

export function auditFixLine(serviceName) {
  return `Run \`npm audit fix --omit=dev\` in ${serviceName}.`;
}

export function planAllowsNpmAuditFix(plan, serviceName) {
  return String(plan || '').includes(auditFixLine(serviceName));
}

export function planNeedsFixer(plan) {
  return String(plan || '').includes(FIXER_ONLY);
}

/**
 * Human resolve steps for the blocking findings of one or more services.
 * results: [{ serviceName, findings }]
 */
export function buildSecurityRemediationPlan(results) {
  const lines = [
    'Security scan found issues that must be fixed before a pull request is opened.',
    '',
    'Resolve:',
  ];
  for (const { serviceName, findings } of results || []) {
    const blocking = (findings || []).filter(isBlockingFinding);
    const patchable = blocking.filter(isPatchableDependency);
    const manual = blocking.filter((finding) => !isPatchableDependency(finding));
    if (patchable.length) {
      lines.push(`- ${auditFixLine(serviceName)}`);
      for (const finding of patchable) {
        lines.push(`  - ${formatDependency(finding)}`);
      }
    }
    for (const finding of manual) {
      lines.push(`- ${formatManual(serviceName, finding)} ${FIXER_ONLY}`);
    }
  }
  lines.push('');
  lines.push('After approval, CodeHealer applies these steps, re-runs build and tests, then runs the security scan again.');
  return lines.join('\n');
}

export function isPatchableDependency(finding) {
  return finding.kind === 'dependency' && finding.fixAvailable === true && finding.semverMajor !== true;
}

export function patchablePackageNames(findings) {
  return [...new Set((findings || []).filter(isPatchableDependency).map((finding) => finding.packageName).filter(Boolean))];
}

function formatDependency(finding) {
  const title = finding.advisory ? `, ${finding.advisory}` : '';
  const fix = finding.fixVersion ? `, fix ${finding.fixVersion}` : '';
  return `${finding.packageName || 'package'} (${finding.severity}${title}${fix})`;
}

function formatManual(serviceName, finding) {
  if (finding.kind === 'dependency') {
    const why = finding.semverMajor ? 'only a major upgrade is available' : 'no automatic fix is available';
    const title = finding.advisory ? ` (${finding.advisory})` : '';
    return `In ${serviceName}, upgrade or replace ${finding.packageName || 'the vulnerable package'}${title}; ${why}.`;
  }
  if (finding.kind === 'secret') {
    return `In ${serviceName}, ${finding.file} matches ${finding.detail}. Remove or replace it. Do not copy the secret value.`;
  }
  return `In ${serviceName}, ${finding.file} matches ${finding.detail}. Remove or replace it.`;
}

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
          findings.push(...findingsFromAudit(JSON.parse(audit.stdout)));
        } catch {
          findings.push({
            severity: 'medium',
            kind: 'dependency',
            file: 'package-lock.json',
            detail: 'npm audit reported issues',
            fixAvailable: false,
          });
        }
      }
    }
  } catch {
    // ignore audit failures — still report other scans
  }

  const blocking = findings.filter(isBlockingFinding);
  const summary = [
    `[${serviceName}] ${findings.length} finding(s); ${blocking.length} high/secret`,
    `Dependency: ${dependencyNote}`,
    'Medium SAST findings are recorded and do not by themselves block the pull request.',
    ...findings.slice(0, 20).map((f) => `- ${f.kind}/${f.severity} ${f.file}: ${f.detail}`),
  ].join('\n');

  return {
    ok: blocking.length === 0,
    summary,
    findings,
  };
}

export function findingsFromAudit(json) {
  const vulns = json?.vulnerabilities;
  if (!vulns || typeof vulns !== 'object') {
    const meta = json?.metadata?.vulnerabilities || {};
    const high = (meta.high || 0) + (meta.critical || 0);
    if (high > 0) {
      return [{
        severity: 'high',
        kind: 'dependency',
        file: 'package-lock.json',
        detail: `${high} high/critical npm advisories`,
        fixAvailable: false,
        semverMajor: false,
      }];
    }
    return [];
  }

  const findings = [];
  for (const [name, vuln] of Object.entries(vulns)) {
    const severity = String(vuln?.severity || '').toLowerCase();
    if (severity !== 'high' && severity !== 'critical') continue;
    const packageName = vuln?.name || name;
    const advisory = advisoryTitle(vuln);
    const fix = describeFix(vuln?.fixAvailable);
    findings.push({
      severity,
      kind: 'dependency',
      file: 'package-lock.json',
      packageName,
      advisory,
      fixAvailable: fix.available,
      fixVersion: fix.version,
      semverMajor: fix.semverMajor,
      detail: dependencyDetail(packageName, severity, advisory, fix),
    });
  }
  return findings;
}

function advisoryTitle(vuln) {
  const via = Array.isArray(vuln?.via) ? vuln.via : [];
  const titled = via.find((entry) => entry && typeof entry === 'object' && entry.title);
  return titled ? String(titled.title) : '';
}

function describeFix(fixAvailable) {
  if (fixAvailable === true) {
    return { available: true, version: '', semverMajor: false };
  }
  if (fixAvailable && typeof fixAvailable === 'object') {
    return {
      available: true,
      version: fixAvailable.version ? String(fixAvailable.version) : '',
      semverMajor: fixAvailable.isSemVerMajor === true,
    };
  }
  return { available: false, version: '', semverMajor: false };
}

function dependencyDetail(name, severity, advisory, fix) {
  const title = advisory ? `: ${advisory}` : '';
  if (!fix.available) return `${name} (${severity}${title}); no automatic fix`;
  if (fix.semverMajor) {
    return `${name} (${severity}${title}); only a major upgrade${fix.version ? ` to ${fix.version}` : ''}`;
  }
  return `${name} (${severity}${title}); fix ${fix.version || 'available'}`;
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
      if (inTests && (pat.id === 'generic-secret' || pat.id === 'jwt' || pat.id === 'private-key')) {
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
