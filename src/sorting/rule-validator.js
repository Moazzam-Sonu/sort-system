import { RULE_FIELDS } from '../constants/sorting.js';
import { customMetafieldId } from '../utils/metafields.js';

export function validateCollectionId(collectionId) {
  if (!collectionId?.startsWith('gid://shopify/Collection/')) {
    throw new Error('Please select a collection first.');
  }
}

export function normalizeCustomMetafield(metafield, index) {
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

export function normalizeRules(rules) {
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
