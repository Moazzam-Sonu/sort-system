import assert from 'node:assert/strict';
import test from 'node:test';
import { createSortingController } from '../../src/controllers/sorting-controller.js';

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const rules = [{ id: 'title', field: 'TITLE', label: 'Product title', direction: 'ASC' }];

test('previewRules stores a server preview token without exposing its hash', async () => {
  let snapshotInput;
  const controller = createSortingController({
    previewCustom: async () => ({
      collectionTitle: 'Summer',
      productCount: 2,
      rules,
      snapshotHash: 'a'.repeat(64),
    }),
    createPreview: async (input) => {
      snapshotInput = input;
      return 'preview-token';
    },
  });
  const response = createResponse();

  await controller.previewRules({ body: { collectionId: 'gid://shopify/Collection/1', rules } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.previewToken, 'preview-token');
  assert.equal(response.body.preview.snapshotHash, undefined);
  assert.equal(snapshotInput.snapshotHash, 'a'.repeat(64));
  assert.deepEqual(snapshotInput.rules, rules);
});

test('applyRules only sends the consumed preview hash to the Shopify sorting service', async () => {
  let applyInput;
  const controller = createSortingController({
    consumePreview: async ({ previewToken }) => {
      assert.equal(previewToken, 'one-time-token');
      return 'b'.repeat(64);
    },
    applyCustom: async (input) => {
      applyInput = input;
      return { moved: 2 };
    },
  });
  const response = createResponse();

  await controller.applyRules({
    body: { collectionId: 'gid://shopify/Collection/1', rules, confirmed: true, previewToken: 'one-time-token' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.moved, 2);
  assert.equal(applyInput.expectedSnapshotHash, 'b'.repeat(64));
});

test('applyRules rejects expired or replayed preview tokens before a Shopify mutation', async () => {
  let mutationCalled = false;
  const controller = createSortingController({
    consumePreview: async () => {
      throw new Error('Preview has expired. Generate a fresh preview before applying.');
    },
    applyCustom: async () => {
      mutationCalled = true;
    },
  });
  const response = createResponse();

  await controller.applyRules({
    body: { collectionId: 'gid://shopify/Collection/1', rules, confirmed: true, previewToken: 'replayed-token' },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /Preview has expired/);
  assert.equal(mutationCalled, false);
});
