import { logger } from './logger.js';
import { redactSecrets } from './redact.js';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://backend:8080';
const SHARED_SECRET = process.env.JOB_RUNNER_SHARED_SECRET || '';

export async function reportEvent(jobId, event) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/internal/jobs/${jobId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': SHARED_SECRET,
      },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      logger.error(`Backend rejected event for job ${jobId}: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    logger.error(`Failed to report event for job ${jobId}: ${err.message}`);
  }
}

export function reportLog(jobId, message, level = 'INFO') {
  return reportEvent(jobId, { logMessage: redactSecrets(message), logLevel: level });
}

export function reportStatus(jobId, status, extra = {}) {
  const payload = { status, ...extra };
  if (payload.message) payload.message = redactSecrets(payload.message);
  return reportEvent(jobId, payload);
}

/**
 * Fail-closed: any transport or non-OK response denies the action.
 */
export async function checkGuard(jobId, action) {
  try {
    const url = `${BACKEND_URL}/api/internal/jobs/guard?jobId=${encodeURIComponent(jobId)}&action=${encodeURIComponent(action)}`;
    const res = await fetch(url, {
      headers: { 'X-Internal-Secret': SHARED_SECRET },
    });
    if (!res.ok) {
      return { allowed: false, reason: `Guard unavailable (${res.status})`, haltStatus: 'FAILED' };
    }
    return await res.json();
  } catch (err) {
    return { allowed: false, reason: `Guard fail-closed: ${err.message}`, haltStatus: 'FAILED' };
  }
}

export async function lookupIdempotency(key) {
  try {
    const res = await fetch(
        `${BACKEND_URL}/api/internal/jobs/idempotency?key=${encodeURIComponent(key)}`,
        { headers: { 'X-Internal-Secret': SHARED_SECRET } }
    );
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    return body.exists ? body.result : null;
  } catch {
    return null;
  }
}

export async function rememberIdempotency(key, jobId, action, result) {
  try {
    await fetch(`${BACKEND_URL}/api/internal/jobs/idempotency`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': SHARED_SECRET,
      },
      body: JSON.stringify({ key, jobId, action, result }),
    });
  } catch (err) {
    logger.error(`Failed to persist idempotency key ${key}: ${err.message}`);
  }
}
