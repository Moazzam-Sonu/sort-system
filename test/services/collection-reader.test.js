import assert from 'node:assert/strict';
import test from 'node:test';
import { listCollections } from '../../src/services/collection-reader.js';

test('listCollections reads every Shopify page through the mocked admin client', async () => {
  const requests = [];
  const pages = [
    {
      data: {
        collections: {
          nodes: [{ id: 'collection-1', title: 'Kitchen', handle: 'kitchen', image: null, productsCount: { count: 4 } }],
          pageInfo: { hasNextPage: true, endCursor: 'page-2' },
        },
      },
    },
    {
      data: {
        collections: {
          nodes: [{ id: 'collection-2', title: 'Dining', handle: 'dining', image: { url: 'https://example.com/dining.jpg', altText: 'Dining' }, productsCount: { count: 2 } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  ];
  const shopifyClient = {
    async request(request) {
      requests.push(request);
      return pages.shift();
    },
  };

  const collections = await listCollections(shopifyClient);

  assert.deepEqual(collections, [
    { id: 'collection-1', title: 'Kitchen', handle: 'kitchen', image: null, productCount: 4 },
    { id: 'collection-2', title: 'Dining', handle: 'dining', image: { url: 'https://example.com/dining.jpg', altText: 'Dining' }, productCount: 2 },
  ]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].variables.after, null);
  assert.equal(requests[1].variables.after, 'page-2');
});
