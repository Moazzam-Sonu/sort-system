import crypto from 'node:crypto';

import { getDatabase } from '../database/client.js';
import { applyCustomRules, applySort, restoreOriginalOrder } from './collection-sorter.js';

const JOB_LEASE_MS = 20 * 60 * 1000;
const RETRY_DELAY_MS = 5_000;
const scheduledJobs = new Map();

function leaseExpiry() {
  return new Date(Date.now() + JOB_LEASE_MS).toISOString();
}

function parseAction(action) {
  return typeof action === 'string' ? JSON.parse(action) : action;
}

function parseOrder(order) {
  return typeof order === 'string' ? JSON.parse(order) : order;
}

function toJobStatus(job, errors = [], recovery = {}) {
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
    canResume: Boolean(recovery.can_resume),
    canRestore: Boolean(recovery.can_restore),
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
    SELECT id, collection_id, position, original_order, target_order
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
    RETURNING id, collection_id, position, original_order, target_order
  `;
  if (!item) return null;

  await sql`
    UPDATE sort_jobs
    SET current_index = ${item.position}, lease_expires_at = ${leaseExpiry()}, updated_at = NOW()
    WHERE id = ${jobId} AND worker_id = ${workerId} AND status = 'running'
  `;
  return item;
}

async function persistItemPlan({ itemId, originalOrder, targetOrder }) {
  const sql = getDatabase();
  await sql`
    UPDATE sort_job_items
    SET original_order = COALESCE(original_order, ${JSON.stringify(originalOrder)}::jsonb),
        target_order = COALESCE(target_order, ${JSON.stringify(targetOrder)}::jsonb),
        verification_status = 'planned',
        updated_at = NOW()
    WHERE id = ${itemId}
  `;
}

async function finishItem({ jobId, workerId, itemId, changed, errorMessage, verificationStatus = null }) {
  const sql = getDatabase();
  const itemStatus = errorMessage ? 'failed' : 'completed';
  const changedIncrement = changed ? 1 : 0;
  const unchangedIncrement = changed || errorMessage ? 0 : 1;
  const failedIncrement = errorMessage ? 1 : 0;
  await sql.transaction([
    sql`
      UPDATE sort_job_items
      SET status = ${itemStatus},
          error_message = ${errorMessage ?? null},
          verification_status = ${verificationStatus ?? (errorMessage ? 'failed' : 'not_required')},
          updated_at = NOW()
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
        let result;
        let verificationStatus = 'not_required';
        if (job.action.type === 'custom') {
          const plan = item.target_order
            ? { originalOrder: parseOrder(item.original_order), targetOrder: parseOrder(item.target_order) }
            : undefined;
          result = await applyCustomRules({
            collectionId: item.collection_id,
            rules: job.action.rules,
            plan,
            onPlan: ({ originalOrder, targetOrder }) => persistItemPlan({ itemId: item.id, originalOrder, targetOrder }),
          });
          verificationStatus = 'verified';
        } else if (job.action.type === 'restore') {
          result = await restoreOriginalOrder({
            collectionId: item.collection_id,
            originalOrder: parseOrder(item.target_order),
          });
          verificationStatus = 'verified';
        } else {
          result = await applySort({ collectionId: item.collection_id, sortOrder: job.action.sortOrder });
        }
        await finishItem({ jobId, workerId, itemId: item.id, changed: result.changed !== false, verificationStatus });
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
  const [recovery] = await sql`
    SELECT
      EXISTS (
        SELECT 1
        FROM sort_job_items
        WHERE job_id = ${jobId} AND status IN ('failed', 'queued')
      ) AS can_resume,
      EXISTS (
        SELECT 1
        FROM sort_job_items
        WHERE job_id = ${jobId} AND original_order IS NOT NULL
      ) AS can_restore
  `;
  const canRecover = ['completed_with_errors', 'cancelled', 'failed'].includes(job.status);
  return toJobStatus(job, errors, {
    can_resume: canRecover && recovery.can_resume,
    can_restore: canRecover && recovery.can_restore,
  });
}

export async function startBulkJob({ collectionIds, action, itemPlans = new Map() }) {
  const sql = getDatabase();
  const id = crypto.randomUUID();
  const actionJson = JSON.stringify(action);
  const statements = [
    sql`
      INSERT INTO sort_jobs (id, type, status, total, action)
      VALUES (${id}, ${action.type}, 'queued', ${collectionIds.length}, ${actionJson}::jsonb)
    `,
    ...collectionIds.map((collectionId, index) => {
      const plan = itemPlans.get(collectionId);
      return sql`
        INSERT INTO sort_job_items (job_id, collection_id, position, original_order, target_order, verification_status)
        VALUES (
          ${id},
          ${collectionId},
          ${index + 1},
          ${plan?.originalOrder ? JSON.stringify(plan.originalOrder) : null}::jsonb,
          ${plan?.targetOrder ? JSON.stringify(plan.targetOrder) : null}::jsonb,
          ${plan ? 'planned' : null}
        )
      `;
    }),
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

export async function resumeBulkJob(jobId) {
  const sql = getDatabase();
  const [job] = await sql`
    SELECT status, failed
    FROM sort_jobs
    WHERE id = ${jobId}
  `;
  if (!job) return null;
  if (!['completed_with_errors', 'cancelled', 'failed'].includes(job.status)) {
    throw new Error('Only a failed or cancelled batch can be resumed.');
  }
  const [runningItem] = await sql`
    SELECT id
    FROM sort_job_items
    WHERE job_id = ${jobId} AND status = 'running'
    LIMIT 1
  `;
  if (runningItem) {
    throw new Error('The current collection update is still finishing. Wait a moment before resuming this batch.');
  }

  await sql.transaction([
    sql`
      UPDATE sort_job_items
      SET status = 'queued', error_message = NULL, verification_status = NULL, updated_at = NOW()
      WHERE job_id = ${jobId} AND status IN ('failed', 'queued')
    `,
    sql`
      UPDATE sort_jobs
      SET status = 'queued',
          processed = processed - failed,
          failed = 0,
          current_index = NULL,
          worker_id = NULL,
          lease_expires_at = NULL,
          completed_at = NULL,
          updated_at = NOW()
      WHERE id = ${jobId}
    `,
  ]);
  scheduleJob(jobId);
  return getBulkJob(jobId);
}

export async function restoreBulkJob(jobId) {
  const sql = getDatabase();
  const [sourceJob] = await sql`
    SELECT status
    FROM sort_jobs
    WHERE id = ${jobId}
  `;
  if (!sourceJob) return null;
  if (['queued', 'running'].includes(sourceJob.status)) {
    throw new Error('Cancel or wait for the active batch before restoring its original order.');
  }
  const [runningItem] = await sql`
    SELECT id
    FROM sort_job_items
    WHERE job_id = ${jobId} AND status = 'running'
    LIMIT 1
  `;
  if (runningItem) {
    throw new Error('The current collection update is still finishing. Wait a moment before restoring this batch.');
  }
  const sourceItems = await sql`
    SELECT collection_id, original_order
    FROM sort_job_items
    WHERE job_id = ${jobId} AND original_order IS NOT NULL
    ORDER BY position
  `;
  if (sourceItems.length === 0) {
    throw new Error('This batch does not have saved original orders to restore.');
  }
  const itemPlans = new Map(sourceItems.map((item) => [item.collection_id, {
    originalOrder: parseOrder(item.original_order),
    targetOrder: parseOrder(item.original_order),
  }]));
  return startBulkJob({
    collectionIds: sourceItems.map((item) => item.collection_id),
    action: { type: 'restore', sourceJobId: jobId },
    itemPlans,
  });
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
