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

test('preview/apply protocol accepts one matching token once and blocks its replay', async () => {
  const storedTokens = new Map();
  let mutationCount = 0;
  const rules = [{ id: 'vendor', field: 'VENDOR', label: 'Vendor', direction: 'ASC' }];
  const controller = createSortingController({
    previewCustom: async () => ({ collectionTitle: 'Kitchen', productCount: 1, rules, snapshotHash: 'c'.repeat(64) }),
    createPreview: async (input) => {
      storedTokens.set('token-1', input);
      return 'token-1';
    },
    consumePreview: async ({ previewToken, collectionId, rules: requestRules }) => {
      const preview = storedTokens.get(previewToken);
      if (!preview || preview.collectionId !== collectionId || JSON.stringify(preview.rules) !== JSON.stringify(requestRules)) {
        throw new Error('Preview is stale. Generate a fresh preview before applying.');
      }
      storedTokens.delete(previewToken);
      return preview.snapshotHash;
    },
    applyCustom: async () => {
      mutationCount += 1;
      return { moved: 1 };
    },
  });

  const previewResponse = createResponse();
  await controller.previewRules({ body: { collectionId: 'collection-1', rules } }, previewResponse);

  const applyResponse = createResponse();
  await controller.applyRules({
    body: { collectionId: 'collection-1', rules, confirmed: true, previewToken: previewResponse.body.previewToken },
  }, applyResponse);

  const replayResponse = createResponse();
  await controller.applyRules({
    body: { collectionId: 'collection-1', rules, confirmed: true, previewToken: 'token-1' },
  }, replayResponse);

  assert.equal(applyResponse.statusCode, 200);
  assert.equal(replayResponse.statusCode, 400);
  assert.equal(mutationCount, 1);
});
