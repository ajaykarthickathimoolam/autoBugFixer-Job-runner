import fs from 'fs/promises';
import path from 'path';

export function isDeniedRelative(rel) {
  const parts = String(rel || '').replaceAll('\\', '/').split('/').filter(Boolean);
  if (parts.includes('.git')) return true;
  const base = parts[parts.length - 1] || '';
  if (!base || base === '.') return false;
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (base === '.npmrc' || base === '.netrc' || base === '.pypirc') return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/i.test(base)) return true;
  if (/^credentials(\.json)?$/i.test(base)) return true;
  if (/\.(pem|key|p12|pfx)$/i.test(base)) return true;
  return false;
}

function escapes(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel.startsWith('..') || path.isAbsolute(rel);
}

/**
 * Resolves a model-supplied path and rejects escapes, symlinks that leave the checkout,
 * and files that commonly hold credentials.
 */
export async function resolveInside(cwd, rel) {
  const root = await fs.realpath(cwd);
  const requested = path.resolve(root, rel || '.');
  if (escapes(root, requested)) {
    throw new Error('path escapes workspace');
  }
  const portable = path.relative(root, requested).split(path.sep).join('/');
  if (isDeniedRelative(portable)) {
    throw new Error('path is not available to the model');
  }
  try {
    const real = await fs.realpath(requested);
    if (escapes(root, real)) {
      throw new Error('path escapes workspace via symlink');
    }
    if (isDeniedRelative(path.relative(root, real).split(path.sep).join('/'))) {
      throw new Error('path is not available to the model');
    }
    return real;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const parent = path.dirname(requested);
      const realParent = await fs.realpath(parent);
      if (escapes(root, realParent)) {
        throw new Error('path escapes workspace via symlink');
      }
      return path.join(realParent, path.basename(requested));
    }
    throw err;
  }
}
