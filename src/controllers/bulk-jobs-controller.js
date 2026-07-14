import { getBulkJob } from '../services/bulk-job-manager.js';

export function getBulkJobStatus(request, response) {
  const job = getBulkJob(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: 'Batch job not found.' });
    return;
  }
  response.json({ job });
}
