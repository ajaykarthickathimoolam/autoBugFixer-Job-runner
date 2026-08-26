import express from 'express';
import { runTask } from './taskRunner.js';
import { prepareProject } from './lib/prepareProject.js';
import { requestAbort } from './lib/abort.js';
import { logger } from './lib/logger.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 4100;
const SHARED_SECRET = process.env.JOB_RUNNER_SHARED_SECRET || 'dev-shared-secret';

function requireInternalSecret(req, res, next) {
  const provided = req.header('X-Internal-Secret');
  if (!provided || provided !== SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/projects/prepare', requireInternalSecret, (req, res) => {
  const { projectId, services } = req.body || {};
  if (!projectId || !Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ error: 'invalid prepare payload' });
  }

  res.status(202).json({ accepted: true });

  prepareProject(req.body).catch((err) => {
    logger.error(`Unhandled error preparing project ${projectId}: ${err.stack || err.message}`);
  });
});

app.post('/tasks', requireInternalSecret, (req, res) => {
  const task = req.body;
  if (!task || !task.jobId || !Array.isArray(task.services) || task.services.length === 0) {
    return res.status(400).json({ error: 'invalid task payload' });
  }

  res.status(202).json({ accepted: true });

  runTask(task).catch((err) => {
    logger.error(`Unhandled error running task ${task.jobId}: ${err.stack || err.message}`);
  });
});

app.post('/tasks/:jobId/abort', requireInternalSecret, (req, res) => {
  const { jobId } = req.params;
  if (!jobId) {
    return res.status(400).json({ error: 'missing jobId' });
  }
  requestAbort(jobId);
  res.json({ aborted: true, jobId });
});

app.listen(PORT, () => logger.info(`job-runner listening on ${PORT}`));
