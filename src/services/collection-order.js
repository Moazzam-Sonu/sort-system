import crypto from 'node:crypto';

import { MAX_MOVES_PER_REQUEST } from '../config.js';
import {
  REORDER_COLLECTION_PRODUCTS_MUTATION,
  UPDATE_COLLECTION_SORT_ORDER_MUTATION,
} from '../graphql/collection-mutations.js';
import { arraysEqual, buildMoveBatch } from '../lib/sort-utils.js';
import { formatUserErrors } from '../utils/shopify-errors.js';
import { waitForJob } from './shopify-jobs.js';

export async function updateSortOrder(client, collectionId, sortOrder) {
  const response = await client.request({
    query: UPDATE_COLLECTION_SORT_ORDER_MUTATION,
    variables: { collection: { id: collectionId, sortOrder } },
  });
  const payload = response.data?.collectionUpdate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) throw new Error(formatUserErrors(userErrors));
  if (payload?.job?.id) await waitForJob(client, payload.job.id, 'Sort order update');
}

export async function reorderCollectionInBatches(client, collectionId, currentOrder, targetOrder, log) {
  let workingOrder = [...currentOrder];
  let batchNumber = 0;
  while (!arraysEqual(workingOrder, targetOrder)) {
    const { moves, nextOrder } = buildMoveBatch(workingOrder, targetOrder, MAX_MOVES_PER_REQUEST);
    if (moves.length === 0) throw new Error('Unable to create product moves for this collection.');

    batchNumber += 1;
    log(`Updating collection: batch ${batchNumber} (${moves.length} moves)`);
    const response = await client.request({
      query: REORDER_COLLECTION_PRODUCTS_MUTATION,
      variables: { id: collectionId, moves, idempotencyKey: crypto.randomUUID() },
    });
    const payload = response.data?.collectionReorderProducts;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) throw new Error(formatUserErrors(userErrors));
    if (!payload?.job?.id) throw new Error('Shopify did not return a reorder job.');

    await waitForJob(client, payload.job.id, `Reorder batch ${batchNumber}`);
    workingOrder = nextOrder;
  }
}
