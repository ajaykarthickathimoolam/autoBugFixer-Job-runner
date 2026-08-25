import { logger } from './logger.js';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://backend:8080';
const SHARED_SECRET = process.env.JOB_RUNNER_SHARED_SECRET || 'dev-shared-secret';

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
  return reportEvent(jobId, { logMessage: message, logLevel: level });
}

export function reportStatus(jobId, status, extra = {}) {
  return reportEvent(jobId, { status, ...extra });
}
