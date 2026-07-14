import { Router } from 'express';

import {
  applyNativeSort,
  applyRules,
  previewRules,
  queueCustomRules,
  queueNativeSort,
} from '../controllers/sorting-controller.js';

export const sortingRouter = Router();

sortingRouter.post('/rules/preview', previewRules);
sortingRouter.post('/rules/apply', applyRules);
sortingRouter.post('/rules/bulk-apply', queueCustomRules);
sortingRouter.post('/sort', applyNativeSort);
sortingRouter.post('/sort/bulk-apply', queueNativeSort);
