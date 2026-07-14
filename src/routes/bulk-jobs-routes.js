import { Router } from 'express';

import { getBulkJobStatus } from '../controllers/bulk-jobs-controller.js';

export const bulkJobsRouter = Router();

bulkJobsRouter.get('/bulk-jobs/:jobId', getBulkJobStatus);
