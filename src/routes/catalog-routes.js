import { Router } from 'express';

import {
  createMetafieldDefinition,
  getCollections,
  getMetafieldDefinitions,
  getSortOptions,
} from '../controllers/catalog-controller.js';

export const catalogRouter = Router();

catalogRouter.get('/collections', getCollections);
catalogRouter.route('/metafield-definitions')
  .get(getMetafieldDefinitions)
  .post(createMetafieldDefinition);
catalogRouter.get('/sort-options', getSortOptions);
