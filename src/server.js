import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyCustomRules,
  applySort,
  listCollections,
  previewCustomRules,
  RULE_FIELDS,
  SORT_OPTIONS,
} from './services/collection-sorter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3000;
const bulkJobs = new Map();

app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/collections', async (request, response) => {
  try {
    const collections = await listCollections();
    response.json({ collections });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get('/api/sort-options', (request, response) => {
  response.json({ options: SORT_OPTIONS, ruleFields: RULE_FIELDS });
});

function createLogCollector() {
  const logs = [];
  return {
    logs,
    log(message) {
      logs.push({ message, at: new Date().toISOString() });
    },
  };
}

function normalizeCollectionIds(collectionIds) {
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
    throw new Error('Select at least one collection.');
  }
  const ids = [...new Set(collectionIds)];
  if (ids.length > 5_000) {
    throw new Error('A batch can contain up to 5,000 collections.');
  }
  if (ids.some((id) => !id?.startsWith('gid://shopify/Collection/'))) {
    throw new Error('One or more selected collections are invalid.');
  }
  return ids;
}

function hasActiveBulkJob() {
  return [...bulkJobs.values()].some((job) => job.status === 'queued' || job.status === 'running');
}

function getBulkJobStatus(job) {
  return {
    id: job.id,
    status: job.status,
    total: job.collectionIds.length,
    processed: job.processed,
    changed: job.changed,
    unchanged: job.unchanged,
    failed: job.failed,
    currentIndex: job.currentIndex,
    errors: job.errors,
  };
}

function startBulkJob({ collectionIds, action }) {
  const job = {
    id: crypto.randomUUID(),
    collectionIds,
    action,
    status: 'queued',
    processed: 0,
    changed: 0,
    unchanged: 0,
    failed: 0,
    currentIndex: null,
    errors: [],
  };
  bulkJobs.set(job.id, job);

  void (async () => {
    job.status = 'running';
    for (const [index, collectionId] of collectionIds.entries()) {
      job.currentIndex = index + 1;
      try {
        const result = action.type === 'custom'
          ? await applyCustomRules({ collectionId, rules: action.rules })
          : await applySort({ collectionId, sortOrder: action.sortOrder });
        if (result.changed === false) job.unchanged += 1;
        else job.changed += 1;
      } catch (error) {
        job.failed += 1;
        if (job.errors.length < 20) {
          job.errors.push({ collectionId, message: error.message });
        }
      } finally {
        job.processed += 1;
      }
    }
    job.currentIndex = null;
    job.status = job.failed > 0 ? 'completed_with_errors' : 'completed';
  })().catch((error) => {
    job.failed += 1;
    job.errors.push({ collectionId: null, message: error.message });
    job.status = 'failed';
  });

  return job;
}

app.post('/api/rules/preview', async (request, response) => {
  const { collectionId, rules } = request.body ?? {};
  const { logs, log } = createLogCollector();
  try {
    const preview = await previewCustomRules({ collectionId, rules, log });
    response.json({ preview, logs });
  } catch (error) {
    response.status(400).json({ error: error.message, logs });
  }
});

app.post('/api/rules/apply', async (request, response) => {
  const { collectionId, rules, confirmed } = request.body ?? {};
  const { logs, log } = createLogCollector();
  if (confirmed !== true) {
    response.status(400).json({ error: 'Confirm the preview before applying a custom order.', logs });
    return;
  }
  try {
    const result = await applyCustomRules({ collectionId, rules, log });
    response.json({ result, logs });
  } catch (error) {
    response.status(400).json({ error: error.message, logs });
  }
});

app.post('/api/rules/bulk-apply', (request, response) => {
  const { collectionIds, rules, confirmed } = request.body ?? {};
  if (confirmed !== true) {
    response.status(400).json({ error: 'Confirm the preview before applying a custom order.' });
    return;
  }
  try {
    const ids = normalizeCollectionIds(collectionIds);
    if (hasActiveBulkJob()) {
      response.status(409).json({ error: 'Another collection batch is already running. Wait for it to finish first.' });
      return;
    }
    const job = startBulkJob({ collectionIds: ids, action: { type: 'custom', rules } });
    response.status(202).json({ job: getBulkJobStatus(job) });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post('/api/sort/bulk-apply', (request, response) => {
  const { collectionIds, sortOrder, confirmed } = request.body ?? {};
  if (confirmed !== true) {
    response.status(400).json({ error: 'Confirm the sort before applying it to multiple collections.' });
    return;
  }
  try {
    const ids = normalizeCollectionIds(collectionIds);
    if (!SORT_OPTIONS[sortOrder]) throw new Error('Invalid sorting option selected.');
    if (hasActiveBulkJob()) {
      response.status(409).json({ error: 'Another collection batch is already running. Wait for it to finish first.' });
      return;
    }
    const job = startBulkJob({ collectionIds: ids, action: { type: 'native', sortOrder } });
    response.status(202).json({ job: getBulkJobStatus(job) });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.get('/api/bulk-jobs/:jobId', (request, response) => {
  const job = bulkJobs.get(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: 'Batch job not found.' });
    return;
  }
  response.json({ job: getBulkJobStatus(job) });
});

app.post('/api/sort', async (request, response) => {
  const { collectionId, sortOrder } = request.body ?? {};
  const { logs, log } = createLogCollector();

  try {
    const result = await applySort({ collectionId, sortOrder, log });
    response.json({ result, logs });
  } catch (error) {
    response.status(400).json({ error: error.message, logs });
  }
});

app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'Request data is invalid.' });
    return;
  }
  next(error);
});

app.listen(port, () => {
  console.log(`Shopify Collection Sorter is running at http://localhost:${port}`);
});
