import crypto from 'node:crypto';

import { applyCustomRules, applySort } from './collection-sorter.js';

const jobs = new Map();

function toJobStatus(job) {
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

export function hasActiveBulkJob() {
  return [...jobs.values()].some((job) => job.status === 'queued' || job.status === 'running');
}

export function getBulkJob(jobId) {
  const job = jobs.get(jobId);
  return job ? toJobStatus(job) : null;
}

export function startBulkJob({ collectionIds, action }) {
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
  jobs.set(job.id, job);

  void processJob(job).catch((error) => {
    job.failed += 1;
    job.errors.push({ collectionId: null, message: error.message });
    job.status = 'failed';
  });

  return toJobStatus(job);
}

async function processJob(job) {
  job.status = 'running';
  for (const [index, collectionId] of job.collectionIds.entries()) {
    job.currentIndex = index + 1;
    try {
      const result = job.action.type === 'custom'
        ? await applyCustomRules({ collectionId, rules: job.action.rules })
        : await applySort({ collectionId, sortOrder: job.action.sortOrder });
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
}
