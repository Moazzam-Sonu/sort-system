import {
  cancelBulkJob,
  getBulkJob,
  isActiveBulkJobConflict,
  restoreBulkJob,
  resumeBulkJob,
} from '../services/bulk-job-manager.js';

export async function getBulkJobStatus(request, response) {
  const job = await getBulkJob(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: 'Batch job not found.' });
    return;
  }
  response.json({ job });
}

export async function cancelBulkJobStatus(request, response) {
  const job = await cancelBulkJob(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: 'Batch job not found.' });
    return;
  }
  response.json({ job });
}

export async function resumeBulkJobStatus(request, response) {
  try {
    const job = await resumeBulkJob(request.params.jobId);
    if (!job) {
      response.status(404).json({ error: 'Batch job not found.' });
      return;
    }
    response.json({ job });
  } catch (error) {
    response.status(isActiveBulkJobConflict(error) ? 409 : 400).json({ error: error.message });
  }
}

export async function restoreBulkJobStatus(request, response) {
  try {
    const job = await restoreBulkJob(request.params.jobId);
    if (!job) {
      response.status(404).json({ error: 'Batch job not found.' });
      return;
    }
    response.status(202).json({ job });
  } catch (error) {
    response.status(isActiveBulkJobConflict(error) ? 409 : 400).json({ error: error.message });
  }
}
