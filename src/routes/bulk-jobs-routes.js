import { Router } from 'express';

import { cancelBulkJobStatus, getBulkJobStatus } from '../controllers/bulk-jobs-controller.js';

export const bulkJobsRouter = Router();

bulkJobsRouter.get('/bulk-jobs/:jobId', getBulkJobStatus);
bulkJobsRouter.post('/bulk-jobs/:jobId/cancel', cancelBulkJobStatus);
