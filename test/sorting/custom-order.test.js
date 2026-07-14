import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCustomOrder, previewProduct } from '../../src/sorting/custom-order.js';

const rangeRule = {
  id: 'range',
  field: 'RANGE',
  label: 'Custom range',
  direction: 'ASC',
};

const titleRule = {
  id: 'title',
  field: 'TITLE',
  label: 'Product title',
  direction: 'DESC',
};

test('buildCustomOrder applies rules in sequence and keeps missing values last', () => {
  const products = [
    { id: 'one', title: 'Alpha', rangeMetafield: { value: '20' } },
    { id: 'two', title: 'Zulu', rangeMetafield: { value: '10' } },
    { id: 'three', title: 'Beta', rangeMetafield: { value: '10' } },
    { id: 'four', title: 'Missing range', rangeMetafield: null },
  ];

  const { sorted, missingByField } = buildCustomOrder(products, [rangeRule, titleRule]);

  assert.deepEqual(sorted.map((item) => item.product.id), ['two', 'three', 'one', 'four']);
  assert.equal(missingByField.get('range').count, 1);
  assert.equal(missingByField.get('title').count, 0);
});

test('previewProduct keeps the original and new collection positions', () => {
  const item = {
    product: { id: 'product-1', title: 'Kettle', vendor: 'Premier' },
    originalPosition: 3,
    values: { range: '10' },
  };

  assert.deepEqual(previewProduct(item, 1), {
    id: 'product-1',
    title: 'Kettle',
    vendor: 'Premier',
    previousPosition: 4,
    targetPosition: 2,
    values: { range: '10' },
  });
});
