import { Router } from 'express';

import { bulkJobsRouter } from './bulk-jobs-routes.js';
import { catalogRouter } from './catalog-routes.js';
import { sortingRouter } from './sorting-routes.js';

export const apiRouter = Router();

apiRouter.use(catalogRouter);
apiRouter.use(sortingRouter);
apiRouter.use(bulkJobsRouter);
