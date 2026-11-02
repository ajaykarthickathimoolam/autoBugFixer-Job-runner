import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LOCAL_WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../workspace');

function resolveWorkspaceRoot() {
  if (process.env.WORKSPACE_ROOT) {
    return process.env.WORKSPACE_ROOT;
  }
  try {
    fs.accessSync('/workspace', fs.constants.W_OK);
    return '/workspace';
  } catch {
    return LOCAL_WORKSPACE;
  }
}

const WORKSPACE_ROOT = resolveWorkspaceRoot();

export function workspaceRoot() {
  return WORKSPACE_ROOT;
}

/** IDs are Mongo-generated (ObjectId hex / UUID) but sanitized anyway before touching the filesystem. */
export function sanitizePathSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100);
}

export function basePathFor(projectId, serviceId) {
  return path.join(WORKSPACE_ROOT, sanitizePathSegment(projectId), sanitizePathSegment(serviceId));
}

/** One shared task folder per job, holding every service's checkout as a subfolder - so a single
 * Claude Code invocation can see and edit any of them, rather than one repo at a time. */
export function taskRootFor(projectId, jobId) {
  return path.join(WORKSPACE_ROOT, sanitizePathSegment(projectId), 'tasks', sanitizePathSegment(jobId));
}

export function serviceDirFor(taskRoot, serviceName) {
  return path.join(taskRoot, sanitizePathSegment(serviceName));
}

export function sanitizeBranchSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100);
}
