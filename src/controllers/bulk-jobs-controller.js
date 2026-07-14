import { cancelBulkJob, getBulkJob } from '../services/bulk-job-manager.js';

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
