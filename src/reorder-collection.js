import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  API_VERSION,
  JOB_POLL_INTERVAL_MS,
  JOB_TIMEOUT_MS,
  MAX_MOVES_PER_REQUEST,
  MAX_RETRIES,
  PAGE_SIZE,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_STORE,
  validateConfig,
} from './config.js';
import { ShopifyAdminClient } from './lib/shopify-admin.js';
import {
  arraysEqual,
  buildMoveBatch,
  buildSortedProducts,
} from './lib/sort-utils.js';

// Change only this value when you want to sort a different collection.
const COLLECTION_ID = "gid://shopify/Collection/648798634328";

const GET_COLLECTION_PRODUCTS_QUERY = `
  query GetCollectionProducts($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      id
      title
      sortOrder
      products(first: $first, after: $after) {
        nodes {
          id
          title
          metafield(namespace: "custom", key: "range") {
            value
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

const UPDATE_COLLECTION_SORT_ORDER_MUTATION = `
  mutation CollectionUpdateSortOrder($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection {
        id
        sortOrder
      }
      job {
        id
        done
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const REORDER_COLLECTION_PRODUCTS_MUTATION = `
  mutation ReorderCollectionProducts(
    $id: ID!,
    $moves: [MoveInput!]!,
    $idempotencyKey: String!
  ) {
    collectionReorderProducts(id: $id, moves: $moves) @idempotent(key: $idempotencyKey) {
      job {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_JOB_STATUS_QUERY = `
  query GetJobStatus($id: ID!) {
    job(id: $id) {
      id
      done
    }
  }
`;

function assertCollectionId() {
  if (
    !COLLECTION_ID
    || COLLECTION_ID.includes('REPLACE_WITH_YOUR_COLLECTION_ID')
    || !COLLECTION_ID.startsWith('gid://shopify/Collection/')
  ) {
    throw new Error('Set COLLECTION_ID in src/reorder-collection.js before running the script.');
  }
}

function formatUserErrors(userErrors) {
  return userErrors
    .map((error) => {
      const fieldPath = Array.isArray(error.field) ? error.field.join('.') : error.field;
      return fieldPath ? `${fieldPath}: ${error.message}` : error.message;
    })
    .join('; ');
}

async function fetchAllCollectionProducts(client, collectionId) {
  const products = [];
  let after = null;
  let collectionTitle = '';
  let sortOrder = '';

  console.log('Fetching products...');

  while (true) {
    const response = await client.request({
      query: GET_COLLECTION_PRODUCTS_QUERY,
      variables: {
        id: collectionId,
        first: PAGE_SIZE,
        after,
      },
    });

    const collection = response.data?.collection;
    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    collectionTitle = collection.title;
    sortOrder = collection.sortOrder;

    products.push(...collection.products.nodes);

    if (!collection.products.pageInfo.hasNextPage) {
      break;
    }

    after = collection.products.pageInfo.endCursor;
  }

  return {
    collectionTitle,
    sortOrder,
    products,
  };
}

async function waitForJob(client, jobId, label) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    const response = await client.request({
      query: GET_JOB_STATUS_QUERY,
      variables: { id: jobId },
    });

    if (response.data?.job?.done) {
      return;
    }

    await sleep(JOB_POLL_INTERVAL_MS);
  }

  throw new Error(`${label} did not complete within ${JOB_TIMEOUT_MS / 1000} seconds.`);
}

async function ensureManualSortOrder(client, collectionId, currentSortOrder) {
  if (currentSortOrder === 'MANUAL') {
    return;
  }

  const response = await client.request({
    query: UPDATE_COLLECTION_SORT_ORDER_MUTATION,
    variables: {
      collection: {
        id: collectionId,
        sortOrder: 'MANUAL',
      },
    },
  });

  const payload = response.data?.collectionUpdate;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(`Unable to set collection sort order to MANUAL: ${formatUserErrors(userErrors)}`);
  }

  if (payload?.job?.id) {
    await waitForJob(client, payload.job.id, 'Collection sort order update');
  }
}

async function reorderCollectionInBatches(client, collectionId, currentOrder, targetOrder) {
  let workingOrder = [...currentOrder];
  let batchNumber = 0;

  while (!arraysEqual(workingOrder, targetOrder)) {
    const { moves, nextOrder } = buildMoveBatch(workingOrder, targetOrder, MAX_MOVES_PER_REQUEST);

    if (moves.length === 0) {
      throw new Error('Unable to build reorder moves even though the target order differs from the current order.');
    }

    batchNumber += 1;
    const idempotencyKey = crypto.randomUUID();

    console.log(`Updating collection... batch ${batchNumber} (${moves.length} move(s))`);

    const response = await client.request({
      query: REORDER_COLLECTION_PRODUCTS_MUTATION,
      variables: {
        id: collectionId,
        moves,
        idempotencyKey,
      },
    });

    const payload = response.data?.collectionReorderProducts;
    const userErrors = payload?.userErrors ?? [];

    if (userErrors.length > 0) {
      throw new Error(`Collection reorder failed: ${formatUserErrors(userErrors)}`);
    }

    const jobId = payload?.job?.id;
    if (!jobId) {
      throw new Error('Collection reorder mutation did not return a job ID.');
    }

    await waitForJob(client, jobId, `Collection reorder batch ${batchNumber}`);
    workingOrder = nextOrder;
  }
}

async function verifyFinalOrder(client, collectionId, expectedOrder) {
  const { products } = await fetchAllCollectionProducts(client, collectionId);
  const actualOrder = products.map((product) => product.id);

  if (!arraysEqual(actualOrder, expectedOrder)) {
    throw new Error('Final collection order verification failed.');
  }
}

async function main() {
  validateConfig();
  assertCollectionId();

  const client = new ShopifyAdminClient({
    store: SHOPIFY_STORE,
    accessToken: SHOPIFY_ACCESS_TOKEN,
    apiVersion: API_VERSION,
    maxRetries: MAX_RETRIES,
  });

  const {
    collectionTitle,
    sortOrder,
    products,
  } = await fetchAllCollectionProducts(client, COLLECTION_ID);

  console.log(`Collection: ${collectionTitle}`);
  console.log(`Products fetched: ${products.length}`);

  await ensureManualSortOrder(client, COLLECTION_ID, sortOrder);

  console.log('Sorting...');

  const sortedProducts = buildSortedProducts(products);
  const currentOrder = products.map((product) => product.id);
  const targetOrder = sortedProducts.map((product) => product.id);

  if (arraysEqual(currentOrder, targetOrder)) {
    console.log('Updating collection...');
    console.log('Collection order is already correct.');
    console.log('Completed.');
    return;
  }

  await reorderCollectionInBatches(client, COLLECTION_ID, currentOrder, targetOrder);
  await verifyFinalOrder(client, COLLECTION_ID, targetOrder);

  console.log('Completed.');
}

main().catch((error) => {
  console.error('Script failed.');
  console.error(error.message);
  process.exitCode = 1;
});
