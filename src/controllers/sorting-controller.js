import { SORT_OPTIONS } from '../constants/sorting.js';
import { isActiveBulkJobConflict, startBulkJob } from '../services/bulk-job-manager.js';
import { applyCustomRules, applySort, previewCustomRules } from '../services/collection-sorter.js';
import { consumePreviewSnapshot, createPreviewSnapshot } from '../services/preview-snapshots.js';
import { createLogCollector } from '../utils/request-logs.js';
import { normalizeCollectionIds } from '../validators/collection-ids.js';

export function createSortingController(dependencies = {}) {
  const {
    sortOptions = SORT_OPTIONS,
    applyCustom = applyCustomRules,
    applyNative = applySort,
    previewCustom = previewCustomRules,
    consumePreview = consumePreviewSnapshot,
    createPreview = createPreviewSnapshot,
    createBulkJob = startBulkJob,
    isActiveConflict = isActiveBulkJobConflict,
    normalizeIds = normalizeCollectionIds,
    createLogs = createLogCollector,
  } = dependencies;

  function sendBusyResponse(response) {
    response.status(409).json({ error: 'Another collection batch is already running. Wait for it to finish first.' });
  }

  async function previewRules(request, response) {
    const { collectionId, rules } = request.body ?? {};
    const { logs, log } = createLogs();
    try {
      const generatedPreview = await previewCustom({ collectionId, rules, log });
      const { snapshotHash, ...preview } = generatedPreview;
      const previewToken = await createPreview({ collectionId, rules: preview.rules, snapshotHash });
      response.json({ preview, previewToken, logs });
    } catch (error) {
      response.status(400).json({ error: error.message, logs });
    }
  }

  async function applyRules(request, response) {
    const { collectionId, rules, confirmed, previewToken } = request.body ?? {};
    const { logs, log } = createLogs();
    if (confirmed !== true) {
      response.status(400).json({ error: 'Confirm the preview before applying a custom order.', logs });
      return;
    }
    try {
      const expectedSnapshotHash = await consumePreview({ previewToken, collectionId, rules });
      response.json({ result: await applyCustom({ collectionId, rules, log, expectedSnapshotHash }), logs });
    } catch (error) {
      response.status(400).json({ error: error.message, logs });
    }
  }

  async function queueCustomRules(request, response) {
    const { collectionIds, rules, confirmed } = request.body ?? {};
    if (confirmed !== true) {
      response.status(400).json({ error: 'Confirm the preview before applying a custom order.' });
      return;
    }
    try {
      const ids = normalizeIds(collectionIds);
      response.status(202).json({ job: await createBulkJob({ collectionIds: ids, action: { type: 'custom', rules } }) });
    } catch (error) {
      if (isActiveConflict(error)) return sendBusyResponse(response);
      response.status(400).json({ error: error.message });
    }
  }

  async function applyNativeSort(request, response) {
    const { collectionId, sortOrder } = request.body ?? {};
    const { logs, log } = createLogs();
    try {
      response.json({ result: await applyNative({ collectionId, sortOrder, log }), logs });
    } catch (error) {
      response.status(400).json({ error: error.message, logs });
    }
  }

  async function queueNativeSort(request, response) {
    const { collectionIds, sortOrder, confirmed } = request.body ?? {};
    if (confirmed !== true) {
      response.status(400).json({ error: 'Confirm the sort before applying it to multiple collections.' });
      return;
    }
    try {
      const ids = normalizeIds(collectionIds);
      if (!sortOptions[sortOrder]) throw new Error('Invalid sorting option selected.');
      response.status(202).json({ job: await createBulkJob({ collectionIds: ids, action: { type: 'native', sortOrder } }) });
    } catch (error) {
      if (isActiveConflict(error)) return sendBusyResponse(response);
      response.status(400).json({ error: error.message });
    }
  }

  return { applyNativeSort, applyRules, previewRules, queueCustomRules, queueNativeSort };
}

export const {
  applyNativeSort,
  applyRules,
  previewRules,
  queueCustomRules,
  queueNativeSort,
} = createSortingController();
