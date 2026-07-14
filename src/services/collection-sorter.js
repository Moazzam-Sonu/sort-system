import crypto from 'node:crypto';

import { RULE_FIELDS, SORT_OPTIONS } from '../constants/sorting.js';
import { arraysEqual } from '../lib/sort-utils.js';
import { buildCustomOrder, buildRuleSummary, previewProduct } from '../sorting/custom-order.js';
import { normalizeRules, validateCollectionId } from '../sorting/rule-validator.js';
import { reorderCollectionInBatches, updateSortOrder } from './collection-order.js';
import { fetchAllCollectionProducts, listCollections as readCollections } from './collection-reader.js';
import {
  createProductMetafieldDefinition as createDefinition,
  listProductMetafieldDefinitions as readMetafieldDefinitions,
} from './metafield-definitions.js';
import { createShopifyClient } from './shopify-client.js';

export { RULE_FIELDS, SORT_OPTIONS };

async function prepareCustomSort(collectionId, rules, log) {
  validateCollectionId(collectionId);
  const normalizedRules = normalizeRules(rules);
  const client = createShopifyClient();
  const collection = await fetchAllCollectionProducts(client, collectionId, normalizedRules, log);
  const order = buildCustomOrder(collection.products, normalizedRules);
  return { client, collection, normalizedRules, ...order };
}

function createSortSnapshotHash(collectionId, rules, sorted) {
  const snapshot = {
    collectionId,
    rules: rules.map((rule) => ({ id: rule.id, direction: rule.direction })),
    products: sorted.map((item) => ({
      id: item.product.id,
      originalPosition: item.originalPosition,
      values: item.values,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function ensureSameProducts(currentOrder, targetOrder) {
  if (currentOrder.length !== targetOrder.length) {
    throw new Error('The collection product list changed after this batch started. Resume or restore cannot safely continue.');
  }
  const currentIds = new Set(currentOrder);
  if (currentIds.size !== currentOrder.length || targetOrder.some((id) => !currentIds.has(id))) {
    throw new Error('The collection product list changed after this batch started. Resume or restore cannot safely continue.');
  }
}

async function verifyCollectionOrder(client, collectionId, targetOrder, log) {
  const latest = await fetchAllCollectionProducts(client, collectionId, [], log);
  const actualOrder = latest.products.map((product) => product.id);
  if (!arraysEqual(actualOrder, targetOrder)) {
    throw new Error('Shopify did not confirm the final collection order. The original and target orders are saved for recovery.');
  }
  return latest;
}

async function applyManualOrder({ client, collection, collectionId, currentOrder, targetOrder, log }) {
  ensureSameProducts(currentOrder, targetOrder);
  const movedCount = targetOrder.filter((id, index) => id !== currentOrder[index]).length;

  if (collection.sortOrder !== 'MANUAL') {
    log('Switching the collection to manual sorting...');
    await updateSortOrder(client, collectionId, 'MANUAL');
  }

  if (movedCount > 0) {
    log(`${movedCount} product position(s) will change.`);
    await reorderCollectionInBatches(client, collectionId, currentOrder, targetOrder, log);
  } else {
    log('The collection is already in the requested order.');
  }

  await verifyCollectionOrder(client, collectionId, targetOrder, log);
  log('Shopify confirmed the final collection order.');
  return movedCount;
}

export async function listCollections() {
  return readCollections(createShopifyClient());
}

export async function listProductMetafieldDefinitions() {
  return readMetafieldDefinitions(createShopifyClient());
}

export async function createProductMetafieldDefinition(metafield) {
  return createDefinition(createShopifyClient(), metafield);
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
    snapshotHash: createSortSnapshotHash(collectionId, normalizedRules, sorted),
  };
}

export async function applyCustomRules({ collectionId, rules, log = () => {}, plan, onPlan, expectedSnapshotHash }) {
  const { client, collection, normalizedRules, sorted } = await prepareCustomSort(collectionId, rules, log);
  if (expectedSnapshotHash && createSortSnapshotHash(collectionId, normalizedRules, sorted) !== expectedSnapshotHash) {
    throw new Error('The collection changed since the preview. Create a fresh preview before applying this order.');
  }
  const currentOrder = collection.products.map((product) => product.id);
  const targetOrder = plan?.targetOrder ?? sorted.map((item) => item.product.id);
  const originalOrder = plan?.originalOrder ?? currentOrder;
  ensureSameProducts(currentOrder, targetOrder);
  await onPlan?.({ originalOrder, targetOrder, collectionTitle: collection.collectionTitle });
  const movedCount = await applyManualOrder({ client, collection, collectionId, currentOrder, targetOrder, log });
  return { collectionTitle: collection.collectionTitle, productCount: collection.products.length, movedCount, changed: movedCount > 0, ruleSummary: buildRuleSummary(normalizedRules) };
}

export async function restoreOriginalOrder({ collectionId, originalOrder, log = () => {} }) {
  validateCollectionId(collectionId);
  if (!Array.isArray(originalOrder) || originalOrder.length === 0) {
    throw new Error('The original order was not saved for this collection.');
  }
  const client = createShopifyClient();
  const collection = await fetchAllCollectionProducts(client, collectionId, [], log);
  const currentOrder = collection.products.map((product) => product.id);
  const movedCount = await applyManualOrder({
    client,
    collection,
    collectionId,
    currentOrder,
    targetOrder: originalOrder,
    log,
  });
  return { collectionTitle: collection.collectionTitle, productCount: collection.products.length, movedCount, changed: movedCount > 0 };
}

export async function applySort({ collectionId, sortOrder, log = () => {} }) {
  validateCollectionId(collectionId);
  if (!SORT_OPTIONS[sortOrder]) throw new Error('Invalid sorting option selected.');
  if (sortOrder === 'RANGE') {
    return applyCustomRules({ collectionId, rules: [{ field: 'RANGE', direction: 'ASC' }, { field: 'TITLE', direction: 'ASC' }], log });
  }

  const client = createShopifyClient();
  log(`Applying ${SORT_OPTIONS[sortOrder].label}...`);
  await updateSortOrder(client, collectionId, sortOrder);
  log('Shopify sort order was updated successfully.');
  return { mode: sortOrder, label: SORT_OPTIONS[sortOrder].label, changed: true };
}
