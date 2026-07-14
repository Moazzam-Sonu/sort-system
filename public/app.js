const trigger = document.querySelector('#collection-trigger');
const picker = document.querySelector('#collection-picker');
const search = document.querySelector('#collection-search');
const list = document.querySelector('#collection-list');
const collectionStatus = document.querySelector('#collection-status');
const selectAllCollectionsButton = document.querySelector('#select-all-collections');
const clearCollectionSelectionButton = document.querySelector('#clear-collection-selection');
const pickerSelectionCount = document.querySelector('#picker-selection-count');
const selectionSummary = document.querySelector('#selection-summary');
const ruleList = document.querySelector('#rule-list');
const addRuleButton = document.querySelector('#add-rule-button');
const openMetafieldButton = document.querySelector('#open-metafield-button');
const previewButton = document.querySelector('#preview-button');
const metafieldDialog = document.querySelector('#metafield-dialog');
const metafieldForm = document.querySelector('#metafield-form');
const metafieldLabelInput = document.querySelector('#metafield-label');
const metafieldNamespaceInput = document.querySelector('#metafield-namespace');
const metafieldKeyInput = document.querySelector('#metafield-key');
const metafieldTypeInput = document.querySelector('#metafield-type');
const metafieldFormError = document.querySelector('#metafield-form-error');
const nativeSortSelect = document.querySelector('#native-sort-select');
const applyNativeButton = document.querySelector('#apply-native-button');
const previewPanel = document.querySelector('#preview-panel');
const previewSummary = document.querySelector('#preview-summary');
const previewBadge = document.querySelector('#preview-badge');
const previewRules = document.querySelector('#preview-rules');
const previewWarnings = document.querySelector('#preview-warnings');
const previewProducts = document.querySelector('#preview-products');
const applyCustomButton = document.querySelector('#apply-custom-button');
const bulkProgressPanel = document.querySelector('#bulk-progress-panel');
const bulkProgressTitle = document.querySelector('#bulk-progress-title');
const bulkProgressSummary = document.querySelector('#bulk-progress-summary');
const bulkProgressStatus = document.querySelector('#bulk-progress-status');
const bulkProgressBar = document.querySelector('#bulk-progress-bar');
const bulkProgressErrors = document.querySelector('#bulk-progress-errors');
const resultPanel = document.querySelector('#result-panel');
const resultIcon = document.querySelector('#result-icon');
const resultKicker = document.querySelector('#result-kicker');
const resultTitle = document.querySelector('#result-title');
const resultSummary = document.querySelector('#result-summary');
const resultLog = document.querySelector('#result-log');

let collections = [];
let selectedCollectionIds = new Set();
let ruleFields = {};
let sortOptions = {};
let customMetafields = loadCustomMetafields();
let pendingMetafieldRuleIndex = null;
let rules = [
  { field: 'RANGE', direction: 'ASC' },
  { field: 'TITLE', direction: 'ASC' },
];
let previewKey = null;

const presets = {
  'range-title': [{ field: 'RANGE', direction: 'ASC' }, { field: 'TITLE', direction: 'ASC' }],
  title: [{ field: 'TITLE', direction: 'ASC' }],
  price: [{ field: 'PRICE', direction: 'ASC' }],
  newest: [{ field: 'CREATED_AT', direction: 'DESC' }],
};

function customMetafieldId(metafield) {
  return `METAFIELD/${metafield.namespace}/${metafield.key}`;
}

function isValidCustomMetafield(metafield) {
  return typeof metafield?.namespace === 'string'
    && /^[A-Za-z0-9_.$:-]{1,255}$/.test(metafield.namespace)
    && typeof metafield?.key === 'string'
    && /^[A-Za-z0-9_-]{1,64}$/.test(metafield.key)
    && ['text', 'number', 'date'].includes(metafield.type);
}

function loadCustomMetafields() {
  try {
    const saved = JSON.parse(localStorage.getItem('collection-sorter-custom-metafields') || '[]');
    return Array.isArray(saved) ? saved.filter(isValidCustomMetafield) : [];
  } catch {
    return [];
  }
}

function saveCustomMetafields() {
  localStorage.setItem('collection-sorter-custom-metafields', JSON.stringify(customMetafields));
}

function ruleLabel(rule) {
  return rule.field === 'METAFIELD' ? rule.metafield.label : ruleFields[rule.field].label;
}

function ruleType(rule) {
  return rule.field === 'METAFIELD' ? rule.metafield.type : ruleFields[rule.field].type;
}

function ruleId(rule) {
  return rule.field === 'METAFIELD' ? customMetafieldId(rule.metafield) : rule.field;
}

function initials(title) {
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';
}

function makeChevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chevron');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

function makeCollectionImage(collection, className = '') {
  if (collection.image?.url) {
    const image = document.createElement('img');
    image.className = className;
    image.src = collection.image.url;
    image.alt = collection.image.altText || collection.title;
    image.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = `collection-fallback ${className}`;
      fallback.textContent = initials(collection.title);
      image.replaceWith(fallback);
    }, { once: true });
    return image;
  }

  const fallback = document.createElement('span');
  fallback.className = `collection-fallback ${className}`;
  fallback.textContent = initials(collection.title);
  return fallback;
}

function collectionDetails(collection) {
  return `${collection.productCount.toLocaleString()} products${collection.handle ? `  /  ${collection.handle}` : ''}`;
}

function selectedCollections() {
  return collections.filter((collection) => selectedCollectionIds.has(collection.id));
}

function currentPreviewKey() {
  return JSON.stringify({ rules, collectionIds: [...selectedCollectionIds].sort() });
}

function renderCollectionTrigger() {
  const selected = selectedCollections();
  trigger.replaceChildren();
  if (selected.length === 0) {
    const placeholder = document.createElement('span');
    placeholder.className = 'trigger-placeholder';
    placeholder.textContent = 'Choose one or more collections...';
    trigger.append(placeholder, makeChevron());
    return;
  }

  if (selected.length === 1) {
    const [collection] = selected;
    const selectedElement = document.createElement('span');
    selectedElement.className = 'selected-collection';
    selectedElement.append(makeCollectionImage(collection));
    const text = document.createElement('span');
    text.className = 'selected-text';
    const title = document.createElement('strong');
    title.textContent = collection.title;
    const details = document.createElement('small');
    details.textContent = collectionDetails(collection);
    text.append(title, details);
    selectedElement.append(text);
    trigger.append(selectedElement, makeChevron());
    return;
  }

  const selectedElement = document.createElement('span');
  selectedElement.className = 'selected-collection';
  const count = document.createElement('span');
  count.className = 'collection-fallback';
  count.textContent = selected.length > 99 ? '99+' : selected.length;
  const text = document.createElement('span');
  text.className = 'selected-text';
  const title = document.createElement('strong');
  title.textContent = `${selected.length.toLocaleString()} collections selected`;
  const details = document.createElement('small');
  details.textContent = 'Ready for batch sorting';
  text.append(title, details);
  selectedElement.append(count, text);
  trigger.append(selectedElement, makeChevron());
}

function updateSelectionState() {
  const count = selectedCollectionIds.size;
  pickerSelectionCount.textContent = `${count.toLocaleString()} selected`;
  renderCollectionTrigger();
  previewButton.disabled = count === 0;
  applyNativeButton.disabled = count === 0 || !nativeSortSelect.value;
  selectionSummary.textContent = count === 0
    ? 'Select one or more collections to preview a custom order.'
    : count === 1
      ? '1 collection selected. Preview the new order before applying it.'
      : `${count.toLocaleString()} collections selected. The preview uses the first selected collection as a sample.`;
  invalidatePreview();
}

function renderCollectionList(filter = '') {
  const searchTerm = filter.trim().toLowerCase();
  const filtered = collections.filter((collection) => (
    collection.title.toLowerCase().includes(searchTerm)
    || collection.handle.toLowerCase().includes(searchTerm)
  ));
  list.replaceChildren();

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No collections match your search.';
    list.append(empty);
    return;
  }

  for (const collection of filtered) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'collection-option';
    option.role = 'option';
    option.setAttribute('aria-selected', String(selectedCollectionIds.has(collection.id)));
    const selectionBox = document.createElement('span');
    selectionBox.className = 'selection-box';
    selectionBox.textContent = selectedCollectionIds.has(collection.id) ? 'OK' : '';
    option.append(selectionBox);
    option.append(makeCollectionImage(collection));

    const text = document.createElement('span');
    text.className = 'option-text';
    const title = document.createElement('strong');
    title.textContent = collection.title;
    const details = document.createElement('small');
    details.textContent = collectionDetails(collection);
    text.append(title, details);
    option.append(text);

    option.addEventListener('click', () => toggleCollection(collection));
    list.append(option);
  }
}

function openPicker() {
  picker.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  renderCollectionList(search.value);
  search.focus();
}

function closePicker() {
  picker.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

function toggleCollection(collection) {
  if (selectedCollectionIds.has(collection.id)) selectedCollectionIds.delete(collection.id);
  else selectedCollectionIds.add(collection.id);
  updateSelectionState();
  renderCollectionList(search.value);
}

function getDirectionOptions(rule) {
  const type = ruleType(rule);
  if (type === 'date') return [{ value: 'ASC', label: 'Oldest first' }, { value: 'DESC', label: 'Newest first' }];
  if (type === 'number') return [{ value: 'ASC', label: 'Low to high' }, { value: 'DESC', label: 'High to low' }];
  return [{ value: 'ASC', label: 'A to Z' }, { value: 'DESC', label: 'Z to A' }];
}

function rulesKey() {
  return JSON.stringify(rules);
}

function invalidatePreview() {
  previewKey = null;
  previewPanel.hidden = true;
  applyCustomButton.disabled = true;
}

function updatePresetState() {
  const key = rulesKey();
  document.querySelectorAll('.preset-button').forEach((button) => {
    button.classList.toggle('is-active', key === JSON.stringify(presets[button.dataset.preset]));
  });
}

function renderRules() {
  ruleList.replaceChildren();
  rules.forEach((rule, index) => {
    const row = document.createElement('div');
    row.className = 'rule-row';

    const sequence = document.createElement('span');
    sequence.className = 'rule-sequence';
    sequence.textContent = index === 0 ? 'Sort by' : 'Then by';
    row.append(sequence);

    const fieldSelect = document.createElement('select');
    fieldSelect.className = 'rule-select';
    fieldSelect.setAttribute('aria-label', `Rule ${index + 1} field`);
    for (const [field, details] of Object.entries(ruleFields)) {
      if (field === 'METAFIELD') continue;
      const option = document.createElement('option');
      option.value = field;
      option.textContent = details.label;
      option.selected = field === rule.field;
      fieldSelect.append(option);
    }
    if (customMetafields.length > 0) {
      const customGroup = document.createElement('optgroup');
      customGroup.label = 'Your custom metafields';
      for (const metafield of customMetafields) {
        const option = document.createElement('option');
        option.value = customMetafieldId(metafield);
        option.textContent = metafield.label || `${metafield.namespace}.${metafield.key}`;
        option.selected = rule.field === 'METAFIELD' && customMetafieldId(rule.metafield) === option.value;
        customGroup.append(option);
      }
      fieldSelect.append(customGroup);
    }
    const addMetafieldOption = document.createElement('option');
    addMetafieldOption.value = '__ADD_METAFIELD__';
    addMetafieldOption.textContent = '+ Add custom metafield...';
    fieldSelect.append(addMetafieldOption);
    fieldSelect.addEventListener('change', () => {
      if (fieldSelect.value === '__ADD_METAFIELD__') {
        pendingMetafieldRuleIndex = index;
        openMetafieldDialog();
        fieldSelect.value = ruleId(rule);
        return;
      }
      const metafield = customMetafields.find((candidate) => customMetafieldId(candidate) === fieldSelect.value);
      rules[index] = metafield
        ? { field: 'METAFIELD', metafield: { ...metafield }, direction: 'ASC' }
        : { field: fieldSelect.value, direction: 'ASC' };
      invalidatePreview();
      renderRules();
    });
    row.append(fieldSelect);

    const directionSelect = document.createElement('select');
    directionSelect.className = 'rule-select rule-direction';
    directionSelect.setAttribute('aria-label', `Rule ${index + 1} direction`);
    for (const direction of getDirectionOptions(rule)) {
      const option = document.createElement('option');
      option.value = direction.value;
      option.textContent = direction.label;
      option.selected = direction.value === rule.direction;
      directionSelect.append(option);
    }
    directionSelect.addEventListener('change', () => {
      rules[index].direction = directionSelect.value;
      invalidatePreview();
      updatePresetState();
    });
    row.append(directionSelect);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-rule-button';
    remove.textContent = 'Remove';
    remove.disabled = rules.length === 1;
    remove.addEventListener('click', () => {
      rules.splice(index, 1);
      invalidatePreview();
      renderRules();
    });
    row.append(remove);
    ruleList.append(row);
  });

  addRuleButton.disabled = rules.length >= 4;
  openMetafieldButton.disabled = rules.length >= 4;
  updatePresetState();
}

function openMetafieldDialog() {
  metafieldForm.reset();
  metafieldFormError.hidden = true;
  metafieldFormError.textContent = '';
  metafieldDialog.showModal();
  metafieldLabelInput.focus();
}

function closeMetafieldDialog() {
  pendingMetafieldRuleIndex = null;
  metafieldDialog.close();
}

function showMetafieldFormError(message) {
  metafieldFormError.textContent = message;
  metafieldFormError.hidden = false;
}

function formatValue(rule, value) {
  if (value === null || value === undefined || value === '') return 'Empty';
  if (ruleType(rule) === 'date') return new Date(value).toLocaleDateString();
  if (ruleType(rule) === 'number') return Number(value).toLocaleString();
  return value;
}

function showPreview(preview) {
  previewPanel.hidden = false;
  previewKey = currentPreviewKey();
  const selectedCount = selectedCollectionIds.size;
  const orderSummary = preview.changed
    ? `${preview.movedCount.toLocaleString()} of ${preview.productCount.toLocaleString()} product positions will change.`
    : `All ${preview.productCount.toLocaleString()} products are already in this order.`;
  previewSummary.textContent = selectedCount > 1
    ? `Sample preview for ${preview.collectionTitle}. ${selectedCount.toLocaleString()} selected collections will use these rules. ${orderSummary}`
    : orderSummary;
  previewBadge.textContent = preview.changed ? 'Ready to apply' : 'No changes needed';
  previewBadge.classList.toggle('is-neutral', !preview.changed);
  previewRules.replaceChildren();
  for (const rule of preview.ruleSummary) {
    const chip = document.createElement('span');
    chip.textContent = rule;
    previewRules.append(chip);
  }

  previewWarnings.replaceChildren();
  for (const warning of preview.warnings) {
    const item = document.createElement('p');
    item.textContent = warning;
    previewWarnings.append(item);
  }
  previewWarnings.hidden = preview.warnings.length === 0;

  previewProducts.replaceChildren();
  for (const product of preview.products) {
    const row = document.createElement('tr');
    const next = document.createElement('td');
    next.className = 'position-cell';
    next.textContent = product.targetPosition;
    const details = document.createElement('td');
    const title = document.createElement('strong');
    title.textContent = product.title;
    const vendor = document.createElement('small');
    vendor.textContent = product.vendor || 'No vendor';
    details.append(title, vendor);
    const previous = document.createElement('td');
    previous.textContent = product.previousPosition;
    const values = document.createElement('td');
    values.className = 'value-cell';
    values.textContent = rules.map((rule) => `${ruleLabel(rule)}: ${formatValue(rule, product.values[ruleId(rule)])}`).join('  |  ');
    row.append(next, details, previous, values);
    previewProducts.append(row);
  }

  applyCustomButton.disabled = selectedCount === 1 && !preview.changed;
  applyCustomButton.querySelector('span').textContent = selectedCount > 1
    ? `Confirm and start batch (${selectedCount.toLocaleString()})`
    : 'Confirm and apply';
  previewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showResult({ failed = false, title, summary, logs = [] }) {
  resultPanel.hidden = false;
  resultPanel.classList.toggle('is-error', failed);
  resultIcon.textContent = failed ? '!' : 'OK';
  resultKicker.textContent = failed ? 'SORTING STOPPED' : 'SORTING COMPLETE';
  resultTitle.textContent = title;
  resultSummary.textContent = summary;
  resultLog.replaceChildren();
  for (const entry of logs) {
    const row = document.createElement('div');
    row.className = 'log-row';
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = entry.at ? new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Now';
    const message = document.createElement('span');
    message.textContent = entry.message;
    row.append(time, message);
    resultLog.append(row);
  }
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setButtonBusy(button, isBusy, busyText, defaultText) {
  button.disabled = isBusy;
  button.classList.toggle('is-busy', isBusy);
  const label = button.querySelector('span') || button;
  label.textContent = isBusy ? busyText : defaultText;
}

function renderBatchProgress(job, label) {
  bulkProgressPanel.hidden = false;
  const percent = job.total === 0 ? 0 : Math.round((job.processed / job.total) * 100);
  bulkProgressTitle.textContent = label;
  bulkProgressSummary.textContent = `${job.processed.toLocaleString()} of ${job.total.toLocaleString()} collections processed. ${job.changed.toLocaleString()} changed, ${job.unchanged.toLocaleString()} already in order, ${job.failed.toLocaleString()} failed.`;
  bulkProgressStatus.textContent = job.status.replaceAll('_', ' ');
  bulkProgressStatus.classList.toggle('is-neutral', job.status !== 'running' && job.status !== 'queued');
  bulkProgressBar.style.width = `${percent}%`;
  bulkProgressErrors.replaceChildren();
  for (const error of job.errors || []) {
    const line = document.createElement('p');
    line.textContent = `${error.collectionId || 'Batch'}: ${error.message}`;
    bulkProgressErrors.append(line);
  }
  bulkProgressErrors.hidden = !job.errors?.length;
}

async function pollBulkJob(jobId, label) {
  try {
    const response = await fetch(`/api/bulk-jobs/${jobId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Batch progress could not be loaded.');
    renderBatchProgress(data.job, label);
    if (data.job.status === 'queued' || data.job.status === 'running') {
      window.setTimeout(() => { void pollBulkJob(jobId, label); }, 1500);
      return;
    }
    showResult({
      failed: data.job.status === 'failed',
      title: data.job.status === 'completed' ? 'Batch sorting completed' : 'Batch sorting finished with issues',
      summary: `${data.job.changed.toLocaleString()} collections changed, ${data.job.unchanged.toLocaleString()} already in order, and ${data.job.failed.toLocaleString()} failed.`,
    });
  } catch (error) {
    showResult({ failed: true, title: 'Batch progress could not be loaded', summary: error.message });
  }
}

async function startBulkSort({ endpoint, payload, label }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Batch sorting could not be started.');
  renderBatchProgress(data.job, label);
  void pollBulkJob(data.job.id, label);
}

function renderNativeSortOptions() {
  nativeSortSelect.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a Shopify sort...';
  nativeSortSelect.append(placeholder);
  for (const [value, option] of Object.entries(sortOptions)) {
    if (value === 'RANGE') continue;
    const element = document.createElement('option');
    element.value = value;
    element.textContent = option.label;
    nativeSortSelect.append(element);
  }
}

async function loadRuleFields() {
  const response = await fetch('/api/sort-options');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sorting options could not be loaded.');
  ruleFields = data.ruleFields;
  sortOptions = data.options;
  renderRules();
  renderNativeSortOptions();
}

async function loadCollections() {
  const response = await fetch('/api/collections');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Collections could not be loaded.');
  collections = data.collections;
  trigger.disabled = false;
  collectionStatus.textContent = `${collections.length.toLocaleString()} collections available`;
  updateSelectionState();
  renderCollectionList();
}

async function loadApp() {
  try {
    await Promise.all([loadRuleFields(), loadCollections()]);
  } catch (error) {
    collectionStatus.textContent = 'The app could not finish loading';
    showResult({ failed: true, title: 'Shopify connection issue', summary: error.message });
  }
}

trigger.addEventListener('click', () => (picker.hidden ? openPicker() : closePicker()));
search.addEventListener('input', () => renderCollectionList(search.value));
selectAllCollectionsButton.addEventListener('click', () => {
  selectedCollectionIds = new Set(collections.map((collection) => collection.id));
  updateSelectionState();
  renderCollectionList(search.value);
});
clearCollectionSelectionButton.addEventListener('click', () => {
  selectedCollectionIds.clear();
  updateSelectionState();
  renderCollectionList(search.value);
});
document.addEventListener('click', (event) => {
  if (!picker.hidden && !event.target.closest('.picker-wrap')) closePicker();
});
document.querySelector('#close-result').addEventListener('click', () => { resultPanel.hidden = true; });
document.querySelector('#close-metafield-dialog').addEventListener('click', closeMetafieldDialog);
document.querySelector('#cancel-metafield-dialog').addEventListener('click', closeMetafieldDialog);

metafieldForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const metafield = {
    label: metafieldLabelInput.value.trim(),
    namespace: metafieldNamespaceInput.value.trim(),
    key: metafieldKeyInput.value.trim(),
    type: metafieldTypeInput.value,
  };
  if (!isValidCustomMetafield(metafield)) {
    showMetafieldFormError('Use a valid namespace, key, and value type. Keys may contain letters, numbers, hyphens, and underscores.');
    return;
  }
  if (!metafield.label) metafield.label = `${metafield.namespace}.${metafield.key}`;
  const duplicateIndex = customMetafields.findIndex((item) => customMetafieldId(item) === customMetafieldId(metafield));
  if (duplicateIndex >= 0) {
    customMetafields[duplicateIndex] = metafield;
  } else {
    customMetafields.push(metafield);
  }
  saveCustomMetafields();

  if (pendingMetafieldRuleIndex !== null) {
    rules[pendingMetafieldRuleIndex] = { field: 'METAFIELD', metafield: { ...metafield }, direction: 'ASC' };
  }
  closeMetafieldDialog();
  invalidatePreview();
  renderRules();
});

addRuleButton.addEventListener('click', () => {
  const nextField = Object.keys(ruleFields).find((field) => field !== 'METAFIELD' && !rules.some((rule) => rule.field === field));
  if (!nextField) return;
  rules.push({ field: nextField, direction: 'ASC' });
  invalidatePreview();
  renderRules();
});

openMetafieldButton.addEventListener('click', () => {
  if (rules.length >= 4) return;
  pendingMetafieldRuleIndex = rules.length;
  openMetafieldDialog();
});

document.querySelectorAll('.preset-button').forEach((button) => {
  button.addEventListener('click', () => {
    rules = presets[button.dataset.preset].map((rule) => ({ ...rule }));
    invalidatePreview();
    renderRules();
  });
});

nativeSortSelect.addEventListener('change', () => {
  applyNativeButton.disabled = selectedCollectionIds.size === 0 || !nativeSortSelect.value;
});

previewButton.addEventListener('click', async () => {
  const [collection] = selectedCollections();
  if (!collection) return;
  setButtonBusy(previewButton, true, 'Building preview...', 'Preview order');
  resultPanel.hidden = true;
  try {
    const response = await fetch('/api/rules/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionId: collection.id, rules }),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Preview could not be created.'), { logs: data.logs });
    showPreview(data.preview);
  } catch (error) {
    showResult({ failed: true, title: 'Preview could not be created', summary: error.message, logs: error.logs || [] });
  } finally {
    previewButton.disabled = selectedCollectionIds.size === 0;
    previewButton.classList.remove('is-busy');
    previewButton.querySelector('span').textContent = 'Preview order';
  }
});

applyCustomButton.addEventListener('click', async () => {
  const selected = selectedCollections();
  if (selected.length === 0 || previewKey !== currentPreviewKey()) return;
  const isBatch = selected.length > 1;
  const confirmed = window.confirm(isBatch
    ? `Start custom sorting for ${selected.length.toLocaleString()} collections? The batch will continue in the background.`
    : `Apply this custom order to ${selected[0].title}? Shopify will update the collection after you confirm.`);
  if (!confirmed) return;

  setButtonBusy(applyCustomButton, true, isBatch ? 'Starting batch...' : 'Applying order...', 'Confirm and apply');
  try {
    if (isBatch) {
      await startBulkSort({
        endpoint: '/api/rules/bulk-apply',
        payload: { collectionIds: selected.map((collection) => collection.id), rules, confirmed: true },
        label: 'Applying custom rules to selected collections',
      });
      showResult({ title: 'Batch sorting started', summary: `${selected.length.toLocaleString()} collections are being sorted in the background.` });
    } else {
      const response = await fetch('/api/rules/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId: selected[0].id, rules, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'Sorting could not be completed.'), { logs: data.logs });
      showResult({
        title: 'Custom order was applied successfully',
        summary: data.result.changed
          ? `${data.result.movedCount.toLocaleString()} product positions were updated in ${selected[0].title}.`
          : 'This collection was already in the requested order.',
        logs: data.logs,
      });
    }
    previewKey = null;
    applyCustomButton.disabled = true;
  } catch (error) {
    showResult({ failed: true, title: 'Sorting could not be completed', summary: error.message, logs: error.logs || [] });
  } finally {
    applyCustomButton.classList.remove('is-busy');
    applyCustomButton.querySelector('span').textContent = 'Confirm and apply';
    if (previewKey === currentPreviewKey()) {
      applyCustomButton.disabled = false;
    }
  }
});

applyNativeButton.addEventListener('click', async () => {
  const selected = selectedCollections();
  if (selected.length === 0 || !nativeSortSelect.value) return;
  const label = nativeSortSelect.options[nativeSortSelect.selectedIndex].text;
  const isBatch = selected.length > 1;
  const confirmed = window.confirm(isBatch
    ? `Start Shopify's ${label} sort for ${selected.length.toLocaleString()} collections? The batch will continue in the background.`
    : `Apply Shopify's ${label} sort to ${selected[0].title}?`);
  if (!confirmed) return;

  setButtonBusy(applyNativeButton, true, 'Applying...', 'Apply native sort');
  try {
    if (isBatch) {
      await startBulkSort({
        endpoint: '/api/sort/bulk-apply',
        payload: { collectionIds: selected.map((collection) => collection.id), sortOrder: nativeSortSelect.value, confirmed: true },
        label: `Applying ${label} to selected collections`,
      });
      showResult({ title: 'Batch sorting started', summary: `${selected.length.toLocaleString()} collections are being sorted in the background.` });
    } else {
      const response = await fetch('/api/sort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId: selected[0].id, sortOrder: nativeSortSelect.value }),
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'Native sorting could not be completed.'), { logs: data.logs });
      invalidatePreview();
      showResult({ title: 'Shopify native sort was applied', summary: `${selected[0].title} is now sorted by ${label}.`, logs: data.logs });
    }
  } catch (error) {
    showResult({ failed: true, title: 'Native sorting could not be completed', summary: error.message, logs: error.logs || [] });
  } finally {
    applyNativeButton.disabled = selectedCollectionIds.size === 0 || !nativeSortSelect.value;
    applyNativeButton.classList.remove('is-busy');
    applyNativeButton.textContent = 'Apply native sort';
  }
});

loadApp();
