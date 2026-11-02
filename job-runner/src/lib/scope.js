export const MAX_CHANGED_FILES = 25;

export function parsePorcelain(stdout) {
  const files = [];
  for (const line of String(stdout || '').split('\n')) {
    if (line.length < 4) continue;
    let name = line.slice(3).trim();
    const arrow = name.lastIndexOf(' -> ');
    if (arrow !== -1) name = name.slice(arrow + 4).trim();
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1);
    }
    if (name) files.push(name);
  }
  return files;
}

export function isSensitiveChange(file) {
  const n = String(file || '').replaceAll('\\', '/');
  return (
    /(^|\/)\.github\/workflows\//i.test(n)
    || /(^|\/)\.env(\.|$)/.test(n)
    || /(^|\/).+\.(pem|key|p12|pfx)$/i.test(n)
    || /(^|\/)id_(rsa|dsa|ed25519|ecdsa)$/i.test(n)
    || /(^|\/)credentials(\.json)?$/i.test(n)
  );
}

/** True when a human should approve this exact file list before it is committed. */
export function needsApproval(files) {
  const list = files || [];
  return list.some(isSensitiveChange) || list.length > MAX_CHANGED_FILES;
}

/** Every current file must be one the human already approved. A shorter list is allowed. */
export function sameScope(files, approvedText) {
  const approved = new Set(
      String(approvedText || '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
  );
  if (approved.size === 0) return false;
  return (files || []).every((file) => approved.has(file));
}

export function scopeSummary(serviceName, files) {
  const denied = files.filter(isSensitiveChange);
  const lines = [
    `The change set for ${serviceName} needs approval before it is committed.`,
  ];
  if (files.length > MAX_CHANGED_FILES) {
    lines.push(`It touches ${files.length} files. The usual limit is ${MAX_CHANGED_FILES}.`);
  }
  if (denied.length) {
    lines.push('It touches workflow or credential paths:');
    for (const file of denied) lines.push(`- ${file}`);
  }
  lines.push('');
  lines.push('Files:');
  for (const file of files) lines.push(`- ${serviceName}:${file}`);
  lines.push('');
  lines.push('Approve only if this exact list should be committed. CodeHealer does not merge it.');
  return lines.join('\n');
}
