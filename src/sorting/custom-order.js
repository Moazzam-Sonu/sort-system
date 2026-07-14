import { RULE_FIELDS } from '../constants/sorting.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

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
    case 'BEST_SELLING': return Number.isFinite(product.bestSellingRank) ? product.bestSellingRank : null;
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

export function buildCustomOrder(products, rules) {
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

export function buildRuleSummary(rules) {
  return rules.map((rule) => `${rule.label} ${rule.direction === 'ASC' ? 'ascending' : 'descending'}`);
}

export function previewProduct(item, targetPosition) {
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
