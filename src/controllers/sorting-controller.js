import { SORT_OPTIONS } from '../constants/sorting.js';
import { applyCustomRules, applySort, previewCustomRules } from '../services/collection-sorter.js';
import { isActiveBulkJobConflict, startBulkJob } from '../services/bulk-job-manager.js';
import { createLogCollector } from '../utils/request-logs.js';
import { normalizeCollectionIds } from '../validators/collection-ids.js';

function sendBusyResponse(response) {
  response.status(409).json({ error: 'Another collection batch is already running. Wait for it to finish first.' });
}

export async function previewRules(request, response) {
  const { collectionId, rules } = request.body ?? {};
  const { logs, log } = createLogCollector();
  try {
    response.json({ preview: await previewCustomRules({ collectionId, rules, log }), logs });
  } catch (error) {
    response.status(400).json({ error: error.message, logs });
  }
}

export async function applyRules(request, response) {
  const { collectionId, rules, confirmed } = request.body ?? {};
  const { logs, log } = createLogCollector();
  if (confirmed !== true) {
    response.status(400).json({ error: 'Confirm the preview before applying a custom order.', logs });
    return;
  }
  try {
    response.json({ result: await applyCustomRules({ collectionId, rules, log }), logs });
  } catch (error) {
    response.status(400).json({ error: error.message, logs });
  }
}

export async function queueCustomRules(request, response) {
  const { collectionIds, rules, confirmed } = request.body ?? {};
  if (confirmed !== true) {
    response.status(400).json({ error: 'Confirm the preview before applying a custom order.' });
    return;
  }
  try {
    const ids = normalizeCollectionIds(collectionIds);
    response.status(202).json({ job: await startBulkJob({ collectionIds: ids, action: { type: 'custom', rules } }) });
  } catch (error) {
    if (isActiveBulkJobConflict(error)) return sendBusyResponse(response);
    response.status(400).json({ error: error.message });
  }
}

export async function applyNativeSort(request, response) {
  const { collectionId, sortOrder } = request.body ?? {};
  const { logs, log } = createLogCollector();
  try {
    response.json({ result: await applySort({ collectionId, sortOrder, log }), logs });
  } catch (error) {
    response.status(400).json({ error: error.message, logs });
  }
}

export async function queueNativeSort(request, response) {
  const { collectionIds, sortOrder, confirmed } = request.body ?? {};
  if (confirmed !== true) {
    response.status(400).json({ error: 'Confirm the sort before applying it to multiple collections.' });
    return;
  }
  try {
    const ids = normalizeCollectionIds(collectionIds);
    if (!SORT_OPTIONS[sortOrder]) throw new Error('Invalid sorting option selected.');
    response.status(202).json({ job: await startBulkJob({ collectionIds: ids, action: { type: 'native', sortOrder } }) });
  } catch (error) {
    if (isActiveBulkJobConflict(error)) return sendBusyResponse(response);
    response.status(400).json({ error: error.message });
  }
}
