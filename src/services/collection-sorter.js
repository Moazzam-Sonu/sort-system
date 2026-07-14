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
} from '../config.js';
import { ShopifyAdminClient } from '../lib/shopify-admin.js';
import { arraysEqual, buildMoveBatch } from '../lib/sort-utils.js';

const LIST_COLLECTIONS_QUERY = `
  query ListCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      nodes {
        id
        title
        handle
        image { url altText }
        productsCount { count }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function buildCollectionProductsQuery(customMetafields) {
  const customVariableDefinitions = customMetafields
    .map((_, index) => `$metafieldNamespace${index}: String!, $metafieldKey${index}: String!`)
    .join(', ');
  const customSelections = customMetafields
    .map((_, index) => `customMetafield${index}: metafield(namespace: $metafieldNamespace${index}, key: $metafieldKey${index}) { value }`)
    .join('\n');

  return `
    query GetCollectionProducts($id: ID!, $first: Int!, $after: String${customVariableDefinitions ? `, ${customVariableDefinitions}` : ''}) {
      collection(id: $id) {
        id
        title
        sortOrder
        products(first: $first, after: $after) {
          nodes {
            id
            title
            vendor
            productType
            tags
            createdAt
            totalInventory
            priceRangeV2 {
              minVariantPrice { amount currencyCode }
            }
            rangeMetafield: metafield(namespace: "custom", key: "range") { value }
            ${customSelections}
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;
}

const UPDATE_COLLECTION_SORT_ORDER_MUTATION = `
  mutation CollectionUpdateSortOrder($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id sortOrder }
      job { id done }
      userErrors { field message }
    }
  }
`;

const REORDER_COLLECTION_PRODUCTS_MUTATION = `
  mutation ReorderCollectionProducts($id: ID!, $moves: [MoveInput!]!, $idempotencyKey: String!) {
    collectionReorderProducts(id: $id, moves: $moves) @idempotent(key: $idempotencyKey) {
      job { id }
      userErrors { field message }
    }
  }
`;

const GET_JOB_STATUS_QUERY = `
  query GetJobStatus($id: ID!) {
    job(id: $id) { id done }
  }
`;

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export const RULE_FIELDS = {
  RANGE: { label: 'Custom Range', type: 'text', description: 'custom.range metafield' },
  TITLE: { label: 'Product Title', type: 'text', description: 'Product name' },
  VENDOR: { label: 'Vendor', type: 'text', description: 'Product vendor' },
  PRODUCT_TYPE: { label: 'Product Type', type: 'text', description: 'Shopify product type' },
  TAGS: { label: 'Tags', type: 'text', description: 'Product tags, alphabetically' },
  PRICE: { label: 'Price', type: 'number', description: 'Lowest variant price' },
  CREATED_AT: { label: 'Created Date', type: 'date', description: 'Product creation date' },
  INVENTORY: { label: 'Inventory', type: 'number', description: 'Total inventory quantity' },
  METAFIELD: { label: 'Custom metafield', type: 'text', description: 'A metafield you add by namespace and key' },
};

export const SORT_OPTIONS = {
  RANGE: { label: 'Custom Range', description: 'Custom Range, then Product Title' },
  BEST_SELLING: { label: 'Best Selling', description: 'Best-selling products first' },
  ALPHA_ASC: { label: 'Alphabetical: A to Z', description: 'Product title from A to Z' },
  ALPHA_DESC: { label: 'Alphabetical: Z to A', description: 'Product title from Z to A' },
  PRICE_ASC: { label: 'Price: Low to High', description: 'Lowest-priced products first' },
  PRICE_DESC: { label: 'Price: High to Low', description: 'Highest-priced products first' },
  CREATED_DESC: { label: 'Newest First', description: 'Most recently created products first' },
  CREATED: { label: 'Oldest First', description: 'Oldest products first' },
};

function createClient() {
  validateConfig();
  return new ShopifyAdminClient({
    store: SHOPIFY_STORE,
    accessToken: SHOPIFY_ACCESS_TOKEN,
    apiVersion: API_VERSION,
    maxRetries: MAX_RETRIES,
  });
}

function validateCollectionId(collectionId) {
  if (!collectionId?.startsWith('gid://shopify/Collection/')) {
    throw new Error('Please select a collection first.');
  }
}

function formatUserErrors(userErrors) {
  return userErrors.map((error) => {
    const fieldPath = Array.isArray(error.field) ? error.field.join('.') : error.field;
    return fieldPath ? `${fieldPath}: ${error.message}` : error.message;
  }).join('; ');
}

function customMetafieldId(metafield) {
  return `METAFIELD/${metafield.namespace}/${metafield.key}`;
}

function normalizeCustomMetafield(metafield, index) {
  const namespace = metafield?.namespace?.trim();
  const key = metafield?.key?.trim();
  const label = metafield?.label?.trim() || `${namespace}.${key}`;
  const type = metafield?.type;
  if (!namespace || !/^[A-Za-z0-9_.$:-]{1,255}$/.test(namespace)) {
    throw new Error(`Custom metafield ${index + 1} has an invalid namespace.`);
  }
  if (!key || !/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
    throw new Error(`Custom metafield ${index + 1} has an invalid key.`);
  }
  if (!['text', 'number', 'date'].includes(type)) {
    throw new Error(`Custom metafield ${index + 1} must use text, number, or date values.`);
  }
  if (label.length > 80) {
    throw new Error(`Custom metafield ${index + 1} has a label that is too long.`);
  }
  return { namespace, key, label, type };
}

function normalizeRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error('Add at least one sorting rule.');
  }
  if (rules.length > 4) {
    throw new Error('You can use up to four sorting rules.');
  }

  const usedFields = new Set();
  return rules.map((rule, index) => {
    if (!RULE_FIELDS[rule?.field]) {
      throw new Error(`Rule ${index + 1} has an unsupported field.`);
    }
    if (!['ASC', 'DESC'].includes(rule?.direction)) {
      throw new Error(`Rule ${index + 1} has an unsupported direction.`);
    }
    const metafield = rule.field === 'METAFIELD' ? normalizeCustomMetafield(rule.metafield, index) : null;
    const id = metafield ? customMetafieldId(metafield) : rule.field;
    if (usedFields.has(id)) {
      throw new Error('Use each field only once in the sorting rules.');
    }
    usedFields.add(id);
    return {
      field: rule.field,
      direction: rule.direction,
      id,
      label: metafield?.label || RULE_FIELDS[rule.field].label,
      metafield,
    };
  });
}

function getRuleValue(product, rule) {
  switch (rule.field) {
    case 'RANGE': return product.rangeMetafield?.value?.trim() || null;
    case 'TITLE': return product.title?.trim() || null;
    case 'VENDOR': return product.vendor?.trim() || null;
    case 'PRODUCT_TYPE': return product.productType?.trim() || null;
    case 'TAGS': return product.tags?.length ? [...product.tags].sort(collator.compare).join(', ') : null;
    case 'PRICE': {
      const value = Number(product.priceRangeV2?.minVariantPrice?.amount);
      return Number.isFinite(value) ? value : null;
    }
    case 'CREATED_AT': {
      const value = Date.parse(product.createdAt);
      return Number.isFinite(value) ? value : null;
    }
    case 'INVENTORY': return Number.isFinite(product.totalInventory) ? product.totalInventory : null;
    case 'METAFIELD': {
      const rawValue = product.customMetafields?.[rule.id];
      if (!rawValue?.trim()) return null;
      if (rule.metafield.type === 'number') {
        const value = Number(rawValue);
        return Number.isFinite(value) ? value : null;
      }
      if (rule.metafield.type === 'date') {
        const value = Date.parse(rawValue);
        return Number.isFinite(value) ? value : null;
      }
      return rawValue.trim();
    }
    default: return null;
  }
}

function getRuleType(rule) {
  return rule.field === 'METAFIELD' ? rule.metafield.type : RULE_FIELDS[rule.field].type;
}

function compareValues(left, right, rule) {
  const leftMissing = left === null || left === undefined || left === '';
  const rightMissing = right === null || right === undefined || right === '';
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }

  const comparison = getRuleType(rule) === 'text'
    ? collator.compare(left, right)
    : left - right;
  return rule.direction === 'DESC' ? -comparison : comparison;
}

function buildCustomOrder(products, rules) {
  const missingByField = new Map(rules.map((rule) => [rule.id, { rule, count: 0 }]));
  const decorated = products.map((product, originalPosition) => {
    const values = Object.fromEntries(rules.map((rule) => [rule.id, getRuleValue(product, rule)]));
    for (const rule of rules) {
      if (values[rule.id] === null || values[rule.id] === '') {
        missingByField.get(rule.id).count += 1;
      }
    }
    return { product, originalPosition, values };
  });

  decorated.sort((left, right) => {
    for (const rule of rules) {
      const comparison = compareValues(left.values[rule.id], right.values[rule.id], rule);
      if (comparison !== 0) return comparison;
    }
    return left.originalPosition - right.originalPosition;
  });

  return { sorted: decorated, missingByField };
}

function buildRuleSummary(rules) {
  return rules.map((rule) => `${rule.label} ${rule.direction === 'ASC' ? 'ascending' : 'descending'}`);
}

function previewProduct(item, targetPosition) {
  const { product, originalPosition, values } = item;
  return {
    id: product.id,
    title: product.title,
    vendor: product.vendor || null,
    previousPosition: originalPosition + 1,
    targetPosition: targetPosition + 1,
    values,
  };
}

async function waitForJob(client, jobId, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    const response = await client.request({ query: GET_JOB_STATUS_QUERY, variables: { id: jobId } });
    if (response.data?.job?.done) return;
    await sleep(JOB_POLL_INTERVAL_MS);
  }
  throw new Error(`${label} did not finish within ${JOB_TIMEOUT_MS / 1000} seconds.`);
}

async function updateSortOrder(client, collectionId, sortOrder) {
  const response = await client.request({
    query: UPDATE_COLLECTION_SORT_ORDER_MUTATION,
    variables: { collection: { id: collectionId, sortOrder } },
  });
  const payload = response.data?.collectionUpdate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) throw new Error(formatUserErrors(userErrors));
  if (payload?.job?.id) await waitForJob(client, payload.job.id, 'Sort order update');
}

async function fetchAllCollectionProducts(client, collectionId, rules, log = () => {}) {
  const products = [];
  const customMetafields = rules.filter((rule) => rule.field === 'METAFIELD').map((rule) => rule.metafield);
  const query = buildCollectionProductsQuery(customMetafields);
  let after = null;
  let collectionTitle = '';
  let sortOrder = '';

  log('Fetching products from Shopify...');
  while (true) {
    const response = await client.request({
      query,
      variables: {
        id: collectionId,
        first: PAGE_SIZE,
        after,
        ...Object.fromEntries(customMetafields.flatMap((metafield, index) => [
          [`metafieldNamespace${index}`, metafield.namespace],
          [`metafieldKey${index}`, metafield.key],
        ])),
      },
    });
    const collection = response.data?.collection;
    if (!collection) throw new Error('The selected collection could not be found. Refresh the page and try again.');

    collectionTitle = collection.title;
    sortOrder = collection.sortOrder;
    products.push(...collection.products.nodes.map((product) => ({
      ...product,
      customMetafields: Object.fromEntries(customMetafields.map((metafield, index) => [
        customMetafieldId(metafield),
        product[`customMetafield${index}`]?.value ?? null,
      ])),
    })));
    if (!collection.products.pageInfo.hasNextPage) return { collectionTitle, sortOrder, products };
    after = collection.products.pageInfo.endCursor;
  }
}

async function reorderCollectionInBatches(client, collectionId, currentOrder, targetOrder, log) {
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

async function prepareCustomSort(collectionId, rules, log) {
  validateCollectionId(collectionId);
  const normalizedRules = normalizeRules(rules);
  const client = createClient();
  const collection = await fetchAllCollectionProducts(client, collectionId, normalizedRules, log);
  const order = buildCustomOrder(collection.products, normalizedRules);
  return { client, collection, normalizedRules, ...order };
}

export async function listCollections() {
  const client = createClient();
  const collections = [];
  let after = null;
  while (true) {
    const response = await client.request({ query: LIST_COLLECTIONS_QUERY, variables: { first: PAGE_SIZE, after } });
    const connection = response.data?.collections;
    if (!connection) throw new Error('Collections could not be fetched from Shopify.');

    collections.push(...connection.nodes.map((collection) => ({
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      image: collection.image ? { url: collection.image.url, altText: collection.image.altText } : null,
      productCount: collection.productsCount?.count ?? 0,
    })));
    if (!connection.pageInfo.hasNextPage) return collections;
    after = connection.pageInfo.endCursor;
  }
}

export async function previewCustomRules({ collectionId, rules, log = () => {} }) {
  const { collection, normalizedRules, sorted, missingByField } = await prepareCustomSort(collectionId, rules, log);
  const movedCount = sorted.filter((item, index) => item.originalPosition !== index).length;
  const warnings = [...missingByField.values()]
    .filter(({ count }) => count > 0)
    .map(({ rule, count }) => `${count} product(s) have no ${rule.label} value and will be placed last.`);

  return {
    collectionTitle: collection.collectionTitle,
    productCount: collection.products.length,
    movedCount,
    changed: movedCount > 0,
    rules: normalizedRules,
    ruleSummary: buildRuleSummary(normalizedRules),
    warnings,
    products: sorted.slice(0, 30).map(previewProduct),
  };
}

export async function applyCustomRules({ collectionId, rules, log = () => {} }) {
  const { client, collection, normalizedRules, sorted } = await prepareCustomSort(collectionId, rules, log);
  const currentOrder = collection.products.map((product) => product.id);
  const targetOrder = sorted.map((item) => item.product.id);
  const movedCount = targetOrder.filter((id, index) => id !== currentOrder[index]).length;

  if (collection.sortOrder !== 'MANUAL') {
    log('Switching the collection to manual sorting...');
    await updateSortOrder(client, collectionId, 'MANUAL');
  }

  if (arraysEqual(currentOrder, targetOrder)) {
    log('The collection is already in the requested order.');
    return { collectionTitle: collection.collectionTitle, productCount: collection.products.length, movedCount: 0, changed: false, ruleSummary: buildRuleSummary(normalizedRules) };
  }

  log(`${movedCount} product position(s) will change.`);
  await reorderCollectionInBatches(client, collectionId, currentOrder, targetOrder, log);
  log('Custom sorting completed successfully.');
  return { collectionTitle: collection.collectionTitle, productCount: collection.products.length, movedCount, changed: true, ruleSummary: buildRuleSummary(normalizedRules) };
}

export async function applySort({ collectionId, sortOrder, log = () => {} }) {
  validateCollectionId(collectionId);
  if (!SORT_OPTIONS[sortOrder]) throw new Error('Invalid sorting option selected.');
  if (sortOrder === 'RANGE') {
    return applyCustomRules({ collectionId, rules: [{ field: 'RANGE', direction: 'ASC' }, { field: 'TITLE', direction: 'ASC' }], log });
  }

  const client = createClient();
  log(`Applying ${SORT_OPTIONS[sortOrder].label}...`);
  await updateSortOrder(client, collectionId, sortOrder);
  log('Shopify sort order was updated successfully.');
  return { mode: sortOrder, label: SORT_OPTIONS[sortOrder].label, changed: true };
}
