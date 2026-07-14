import {
  createProductMetafieldDefinition,
  listCollections,
  listProductMetafieldDefinitions,
  RULE_FIELDS,
  SORT_OPTIONS,
} from '../services/collection-sorter.js';

export async function getCollections(request, response) {
  try {
    response.json({ collections: await listCollections() });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}

export async function getMetafieldDefinitions(request, response) {
  try {
    response.json({ definitions: await listProductMetafieldDefinitions() });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}

export async function createMetafieldDefinition(request, response) {
  try {
    response.status(201).json({ definition: await createProductMetafieldDefinition(request.body ?? {}) });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
}

export function getSortOptions(request, response) {
  response.json({ options: SORT_OPTIONS, ruleFields: RULE_FIELDS });
}
