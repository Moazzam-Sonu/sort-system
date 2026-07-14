import crypto from 'node:crypto';

import { getDatabase } from '../database/client.js';
import { applyCustomRules, applySort } from './collection-sorter.js';

const JOB_LEASE_MS = 20 * 60 * 1000;
const RETRY_DELAY_MS = 5_000;
const scheduledJobs = new Map();

function leaseExpiry() {
  return new Date(Date.now() + JOB_LEASE_MS).toISOString();
}

function parseAction(action) {
  return typeof action === 'string' ? JSON.parse(action) : action;
}

function toJobStatus(job, errors = []) {
  return {
    id: job.id,
    status: job.status,
    total: Number(job.total),
    processed: Number(job.processed),
    changed: Number(job.changed),
    unchanged: Number(job.unchanged),
    failed: Number(job.failed),
    currentIndex: job.current_index === null ? null : Number(job.current_index),
    errors: errors.map((error) => ({ collectionId: error.collection_id, message: error.error_message })),
  };
}

function scheduleJob(jobId, delayMs = 0) {
  if (scheduledJobs.has(jobId)) return;
  const timer = setTimeout(() => {
    scheduledJobs.delete(jobId);
    void processJob(jobId).catch((error) => {
      console.error(`Bulk job ${jobId} worker failed: ${error.message}`);
      scheduleJob(jobId, RETRY_DELAY_MS);
    });
  }, Math.max(0, delayMs));
  scheduledJobs.set(jobId, timer);
}

async function scheduleClaimRetry(jobId) {
  const sql = getDatabase();
  const [job] = await sql`
    SELECT status, lease_expires_at
    FROM sort_jobs
    WHERE id = ${jobId}
  `;
  if (!job || !['queued', 'running'].includes(job.status)) return;
  const expiry = job.lease_expires_at ? new Date(job.lease_expires_at).getTime() : Date.now();
  scheduleJob(jobId, job.status === 'queued' ? 0 : Math.max(RETRY_DELAY_MS, expiry - Date.now() + 250));
}

async function claimJob(jobId, workerId) {
  const sql = getDatabase();
  const [job] = await sql`
    UPDATE sort_jobs
    SET status = 'running',
        worker_id = ${workerId},
        lease_expires_at = ${leaseExpiry()},
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id = ${jobId}
      AND (
        status = 'queued'
        OR (status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at <= NOW()))
      )
    RETURNING id, status, action
  `;
  if (!job) return null;

  await sql`
    UPDATE sort_job_items
    SET status = 'queued', updated_at = NOW()
    WHERE job_id = ${jobId} AND status = 'running'
  `;
  return { ...job, action: parseAction(job.action) };
}

async function isWorkerActive(jobId, workerId) {
  const sql = getDatabase();
  const [job] = await sql`
    SELECT status
    FROM sort_jobs
    WHERE id = ${jobId} AND worker_id = ${workerId}
  `;
  return job?.status === 'running';
}

async function claimNextItem(jobId, workerId) {
  const sql = getDatabase();
  const [next] = await sql`
    SELECT id, collection_id, position
    FROM sort_job_items
    WHERE job_id = ${jobId} AND status = 'queued'
    ORDER BY position
    LIMIT 1
  `;
  if (!next) return null;

  const [item] = await sql`
    UPDATE sort_job_items
    SET status = 'running', attempts = attempts + 1, updated_at = NOW()
    WHERE id = ${next.id} AND status = 'queued'
    RETURNING id, collection_id, position
  `;
  if (!item) return null;

  await sql`
    UPDATE sort_jobs
    SET current_index = ${item.position}, lease_expires_at = ${leaseExpiry()}, updated_at = NOW()
    WHERE id = ${jobId} AND worker_id = ${workerId} AND status = 'running'
  `;
  return item;
}

async function finishItem({ jobId, workerId, itemId, changed, errorMessage }) {
  const sql = getDatabase();
  const itemStatus = errorMessage ? 'failed' : 'completed';
  const changedIncrement = changed ? 1 : 0;
  const unchangedIncrement = changed || errorMessage ? 0 : 1;
  const failedIncrement = errorMessage ? 1 : 0;
  await sql.transaction([
    sql`
      UPDATE sort_job_items
      SET status = ${itemStatus}, error_message = ${errorMessage ?? null}, updated_at = NOW()
      WHERE id = ${itemId} AND status = 'running'
    `,
    sql`
      UPDATE sort_jobs
      SET processed = processed + 1,
          changed = changed + ${changedIncrement},
          unchanged = unchanged + ${unchangedIncrement},
          failed = failed + ${failedIncrement},
          lease_expires_at = ${leaseExpiry()},
          updated_at = NOW()
      WHERE id = ${jobId} AND worker_id = ${workerId}
    `,
  ]);
}

async function completeJob(jobId, workerId) {
  const sql = getDatabase();
  const [job] = await sql`
    SELECT status, failed
    FROM sort_jobs
    WHERE id = ${jobId} AND worker_id = ${workerId}
  `;
  if (!job) return;

  if (job.status === 'cancelled') {
    await sql`
      UPDATE sort_jobs
      SET current_index = NULL, lease_expires_at = NULL, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId} AND worker_id = ${workerId}
    `;
    return;
  }

  await sql`
    UPDATE sort_jobs
    SET status = ${Number(job.failed) > 0 ? 'completed_with_errors' : 'completed'},
        current_index = NULL,
        lease_expires_at = NULL,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = ${jobId} AND worker_id = ${workerId} AND status = 'running'
  `;
}

async function releaseJob(jobId, workerId) {
  const sql = getDatabase();
  await sql`
    UPDATE sort_jobs
    SET status = 'queued', worker_id = NULL, lease_expires_at = NOW(), current_index = NULL, updated_at = NOW()
    WHERE id = ${jobId} AND worker_id = ${workerId} AND status = 'running'
  `;
}

async function processJob(jobId) {
  const workerId = crypto.randomUUID();
  const job = await claimJob(jobId, workerId);
  if (!job) {
    await scheduleClaimRetry(jobId);
    return;
  }

  try {
    while (await isWorkerActive(jobId, workerId)) {
      const item = await claimNextItem(jobId, workerId);
      if (!item) break;

      try {
        const result = job.action.type === 'custom'
          ? await applyCustomRules({ collectionId: item.collection_id, rules: job.action.rules })
          : await applySort({ collectionId: item.collection_id, sortOrder: job.action.sortOrder });
        await finishItem({ jobId, workerId, itemId: item.id, changed: result.changed !== false });
      } catch (error) {
        await finishItem({
          jobId,
          workerId,
          itemId: item.id,
          changed: false,
          errorMessage: error.message.slice(0, 1_000),
        });
      }
    }
    await completeJob(jobId, workerId);
  } catch (error) {
    await releaseJob(jobId, workerId);
    throw error;
  }
}

export async function getBulkJob(jobId) {
  const sql = getDatabase();
  const [job] = await sql`
    SELECT id, status, total, processed, changed, unchanged, failed, current_index
    FROM sort_jobs
    WHERE id = ${jobId}
  `;
  if (!job) return null;
  const errors = await sql`
    SELECT collection_id, error_message
    FROM sort_job_items
    WHERE job_id = ${jobId} AND status = 'failed'
    ORDER BY position
    LIMIT 20
  `;
  return toJobStatus(job, errors);
}

export async function startBulkJob({ collectionIds, action }) {
  const sql = getDatabase();
  const id = crypto.randomUUID();
  const actionJson = JSON.stringify(action);
  const statements = [
    sql`
      INSERT INTO sort_jobs (id, type, status, total, action)
      VALUES (${id}, ${action.type}, 'queued', ${collectionIds.length}, ${actionJson}::jsonb)
    `,
    ...collectionIds.map((collectionId, index) => sql`
      INSERT INTO sort_job_items (job_id, collection_id, position)
      VALUES (${id}, ${collectionId}, ${index + 1})
    `),
  ];
  await sql.transaction(statements);
  scheduleJob(id);
  return {
    id,
    status: 'queued',
    total: collectionIds.length,
    processed: 0,
    changed: 0,
    unchanged: 0,
    failed: 0,
    currentIndex: null,
    errors: [],
  };
}

export async function cancelBulkJob(jobId) {
  const sql = getDatabase();
  await sql`
    UPDATE sort_jobs
    SET status = 'cancelled', current_index = NULL, lease_expires_at = NULL, completed_at = NOW(), updated_at = NOW()
    WHERE id = ${jobId} AND status IN ('queued', 'running')
  `;
  return getBulkJob(jobId);
}

export async function resumePendingBulkJobs() {
  const sql = getDatabase();
  const jobs = await sql`
    SELECT id, status, lease_expires_at
    FROM sort_jobs
    WHERE status IN ('queued', 'running')
  `;
  for (const job of jobs) {
    const expiry = job.lease_expires_at ? new Date(job.lease_expires_at).getTime() : Date.now();
    scheduleJob(job.id, job.status === 'queued' ? 0 : Math.max(RETRY_DELAY_MS, expiry - Date.now() + 250));
  }
  return jobs.length;
}

export function isActiveBulkJobConflict(error) {
  return error?.code === '23505' || error?.message?.includes('sort_jobs_one_active_idx');
}
