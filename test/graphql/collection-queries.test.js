import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCollectionProductsQuery,
  buildDraftCollectionProductsQuery,
  GET_BEST_SELLING_RANKS_QUERY,
} from '../../src/graphql/collection-queries.js';

test('collection product queries use only arguments supported by Collection.products', () => {
  const productsQuery = buildCollectionProductsQuery([]);

  assert.match(productsQuery, /products\(first: \$first, after: \$after\)/);
  assert.match(GET_BEST_SELLING_RANKS_QUERY, /sortKey: BEST_SELLING/);
  assert.doesNotMatch(productsQuery, /products\([^)]*query:/);
  assert.doesNotMatch(GET_BEST_SELLING_RANKS_QUERY, /products\([^)]*query:/);
});

test('draft collection product query uses the root products search connection', () => {
  const draftQuery = buildDraftCollectionProductsQuery([]);

  assert.match(draftQuery, /products\(first: \$first, after: \$after, query: \$query\)/);
  assert.match(draftQuery, /GetDraftCollectionProducts/);
});
