import { Router } from 'express';

import {
  cancelBulkJobStatus,
  getBulkJobStatus,
  restoreBulkJobStatus,
  resumeBulkJobStatus,
} from '../controllers/bulk-jobs-controller.js';

export const bulkJobsRouter = Router();

bulkJobsRouter.get('/bulk-jobs/:jobId', getBulkJobStatus);
bulkJobsRouter.post('/bulk-jobs/:jobId/cancel', cancelBulkJobStatus);
bulkJobsRouter.post('/bulk-jobs/:jobId/resume', resumeBulkJobStatus);
bulkJobsRouter.post('/bulk-jobs/:jobId/restore', restoreBulkJobStatus);
