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

  const client = createShopifyClient();
  log(`Applying ${SORT_OPTIONS[sortOrder].label}...`);
  await updateSortOrder(client, collectionId, sortOrder);
  log('Shopify sort order was updated successfully.');
  return { mode: sortOrder, label: SORT_OPTIONS[sortOrder].label, changed: true };
}
