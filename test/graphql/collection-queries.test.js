import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCollectionProductsQuery,
  GET_BEST_SELLING_RANKS_QUERY,
} from '../../src/graphql/collection-queries.js';

test('collection product queries explicitly include active and draft products', () => {
  const productsQuery = buildCollectionProductsQuery([]);

  assert.match(productsQuery, /products\(first: \$first, after: \$after, query: "status:active,draft"\)/);
  assert.match(GET_BEST_SELLING_RANKS_QUERY, /sortKey: BEST_SELLING, query: "status:active,draft"/);
});
