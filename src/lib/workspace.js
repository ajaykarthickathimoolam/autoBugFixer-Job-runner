import path from 'path';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';

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
