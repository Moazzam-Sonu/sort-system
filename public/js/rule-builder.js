import { api } from './api.js';
import { customMetafieldId, isValidCustomMetafield } from './helpers.js';

const STORAGE_KEY = 'collection-sorter-custom-metafields';
const PRESETS = {
  'range-title': [{ field: 'RANGE', direction: 'ASC' }, { field: 'TITLE', direction: 'ASC' }],
  'range-best-selling': [{ field: 'RANGE', direction: 'ASC' }, { field: 'BEST_SELLING', direction: 'ASC' }],
  title: [{ field: 'TITLE', direction: 'ASC' }],
  price: [{ field: 'PRICE', direction: 'ASC' }],
  newest: [{ field: 'CREATED_AT', direction: 'DESC' }],
};

function loadCustomMetafields() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(isValidCustomMetafield) : [];
  } catch {
    return [];
  }
}

export function createRuleBuilder({ onRulesChange }) {
  const ruleList = document.querySelector('#rule-list');
  const addRuleButton = document.querySelector('#add-rule-button');
  const openMetafieldButton = document.querySelector('#open-metafield-button');
  const dialog = document.querySelector('#metafield-dialog');
  const library = document.querySelector('#metafield-library');
  const definitionSearch = document.querySelector('#metafield-definition-search');
  const definitionStatus = document.querySelector('#metafield-definition-status');
  const definitionList = document.querySelector('#metafield-definition-list');
  const addSelectedButton = document.querySelector('#add-selected-metafields');
  const manualForm = document.querySelector('#metafield-form');
  const labelInput = document.querySelector('#metafield-label');
  const namespaceInput = document.querySelector('#metafield-namespace');
  const keyInput = document.querySelector('#metafield-key');
  const typeInput = document.querySelector('#metafield-type');
  const formError = document.querySelector('#metafield-form-error');

  let ruleFields = {};
  let customMetafields = loadCustomMetafields();
  let definitions = [];
  let definitionsLoaded = false;
  let definitionsLoading = false;
  let pendingIndex = null;
  let selectedDefinitionIds = new Set();
  let rules = [
    { field: 'RANGE', direction: 'ASC' },
    { field: 'TITLE', direction: 'ASC' },
  ];

  function getRules() {
    return rules.map((rule) => ({
      ...rule,
      metafield: rule.metafield ? { ...rule.metafield } : undefined,
    }));
  }

  function ruleId(rule) {
    return rule.field === 'METAFIELD' ? customMetafieldId(rule.metafield) : rule.field;
  }

  function ruleLabel(rule) {
    return rule.field === 'METAFIELD' ? rule.metafield.label : ruleFields[rule.field].label;
  }

  function ruleType(rule) {
    return rule.field === 'METAFIELD' ? rule.metafield.type : ruleFields[rule.field].type;
  }

  function formatValue(rule, value) {
    if (value === null || value === undefined || value === '') return 'Empty';
    if (rule.field === 'BEST_SELLING') return `Rank #${Number(value).toLocaleString()}`;
    if (ruleType(rule) === 'date') return new Date(value).toLocaleDateString();
    if (ruleType(rule) === 'number') return Number(value).toLocaleString();
    return value;
  }

  function directionOptions(rule) {
    if (rule.field === 'BEST_SELLING') return [{ value: 'ASC', label: 'Best selling first' }, { value: 'DESC', label: 'Best selling last' }];
    if (ruleType(rule) === 'date') return [{ value: 'ASC', label: 'Oldest first' }, { value: 'DESC', label: 'Newest first' }];
    if (ruleType(rule) === 'number') return [{ value: 'ASC', label: 'Low to high' }, { value: 'DESC', label: 'High to low' }];
    return [{ value: 'ASC', label: 'A to Z' }, { value: 'DESC', label: 'Z to A' }];
  }

  function notify() {
    onRulesChange(getRules());
  }

  function saveCustomMetafields() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customMetafields));
  }

  function addCustomMetafields(fields) {
    for (const field of fields) {
      const index = customMetafields.findIndex((item) => customMetafieldId(item) === customMetafieldId(field));
      if (index >= 0) customMetafields[index] = field;
      else customMetafields.push(field);
    }
    saveCustomMetafields();
  }

  function updatePresetState() {
    const key = JSON.stringify(rules);
    document.querySelectorAll('.preset-button').forEach((button) => {
      button.classList.toggle('is-active', key === JSON.stringify(PRESETS[button.dataset.preset]));
    });
  }

  function appendFieldGroups(select, rule) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = 'Custom metafields';
    const range = document.createElement('option');
    range.value = 'RANGE';
    range.textContent = ruleFields.RANGE.label;
    range.selected = rule.field === 'RANGE';
    customGroup.append(range);
    for (const metafield of customMetafields) {
      const option = document.createElement('option');
      option.value = customMetafieldId(metafield);
      option.textContent = metafield.label || `${metafield.namespace}.${metafield.key}`;
      option.selected = rule.field === 'METAFIELD' && customMetafieldId(rule.metafield) === option.value;
      customGroup.append(option);
    }
    select.append(customGroup);

    const rankingGroup = document.createElement('optgroup');
    rankingGroup.label = 'Shopify rankings';
    const bestSelling = document.createElement('option');
    bestSelling.value = 'BEST_SELLING';
    bestSelling.textContent = ruleFields.BEST_SELLING.label;
    bestSelling.selected = rule.field === 'BEST_SELLING';
    rankingGroup.append(bestSelling);
    select.append(rankingGroup);

    const productGroup = document.createElement('optgroup');
    productGroup.label = 'Product details';
    for (const [field, details] of Object.entries(ruleFields)) {
      if (['METAFIELD', 'RANGE', 'BEST_SELLING'].includes(field)) continue;
      const option = document.createElement('option');
      option.value = field;
      option.textContent = details.label;
      option.selected = rule.field === field;
      productGroup.append(option);
    }
    select.append(productGroup);

    const addOption = document.createElement('option');
    addOption.value = '__ADD_METAFIELD__';
    addOption.textContent = '+ Add custom data fields...';
    select.append(addOption);
  }

  function render() {
    if (!ruleFields.RANGE) return;
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
      appendFieldGroups(fieldSelect, rule);
      fieldSelect.addEventListener('change', () => {
        if (fieldSelect.value === '__ADD_METAFIELD__') {
          pendingIndex = index;
          openDialog();
          fieldSelect.value = ruleId(rule);
          return;
        }
        const metafield = customMetafields.find((item) => customMetafieldId(item) === fieldSelect.value);
        rules[index] = metafield
          ? { field: 'METAFIELD', metafield: { ...metafield }, direction: 'ASC' }
          : { field: fieldSelect.value, direction: 'ASC' };
        render();
        notify();
      });
      row.append(fieldSelect);

      const directionSelect = document.createElement('select');
      directionSelect.className = 'rule-select rule-direction';
      directionSelect.setAttribute('aria-label', `Rule ${index + 1} direction`);
      for (const direction of directionOptions(rule)) {
        const option = document.createElement('option');
        option.value = direction.value;
        option.textContent = direction.label;
        option.selected = rule.direction === direction.value;
        directionSelect.append(option);
      }
      directionSelect.addEventListener('change', () => {
        rules[index].direction = directionSelect.value;
        updatePresetState();
        notify();
      });
      row.append(directionSelect);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-rule-button';
      remove.textContent = 'Remove';
      remove.disabled = rules.length === 1;
      remove.addEventListener('click', () => {
        rules.splice(index, 1);
        render();
        notify();
      });
      row.append(remove);
      ruleList.append(row);
    });
    addRuleButton.disabled = rules.length >= 4;
    openMetafieldButton.disabled = rules.length >= 4;
    updatePresetState();
  }

  function definitionId(definition) {
    return `METAFIELD/${definition.namespace}/${definition.key}`;
  }

  function updateAddSelectedButton() {
    addSelectedButton.disabled = selectedDefinitionIds.size === 0;
    addSelectedButton.querySelector('span').textContent = `Add selected (${selectedDefinitionIds.size})`;
  }

  function renderDefinitions() {
    const query = definitionSearch.value.trim().toLowerCase();
    const visibleDefinitions = definitions.filter((definition) => {
      const searchable = `${definition.label} ${definition.namespace}.${definition.key} ${definition.shopifyType}`.toLowerCase();
      return searchable.includes(query);
    });
    definitionList.replaceChildren();
    if (!definitionsLoaded || definitionsLoading) return;
    if (visibleDefinitions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'metafield-definition-empty';
      empty.textContent = query ? 'No metafields match your search.' : 'No product metafield definitions were found.';
      definitionList.append(empty);
      return;
    }

    for (const definition of visibleDefinitions) {
      const row = document.createElement('label');
      row.className = 'metafield-definition';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedDefinitionIds.has(definitionId(definition));
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedDefinitionIds.add(definitionId(definition));
        else selectedDefinitionIds.delete(definitionId(definition));
        updateAddSelectedButton();
      });
      const details = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = definition.label;
      const meta = document.createElement('span');
      meta.textContent = `${definition.namespace}.${definition.key}  /  ${definition.shopifyType.replaceAll('_', ' ')}`;
      details.append(name, meta);
      row.append(checkbox, details);
      definitionList.append(row);
    }
  }

  async function loadDefinitions() {
    if (definitionsLoaded || definitionsLoading) return;
    definitionsLoading = true;
    definitionStatus.textContent = 'Loading product metafields from Shopify...';
    renderDefinitions();
    try {
      const response = await api.metafieldDefinitions();
      definitions = response.definitions || [];
      definitionsLoaded = true;
      definitionStatus.textContent = definitions.length
        ? `${definitions.length} product metafield${definitions.length === 1 ? '' : 's'} available.`
        : 'No product metafield definitions found. Create one below.';
    } catch (error) {
      definitionStatus.textContent = error.message;
      definitionsLoaded = true;
    } finally {
      definitionsLoading = false;
      renderDefinitions();
    }
  }

  function showLibrary() {
    manualForm.hidden = true;
    library.hidden = false;
    formError.hidden = true;
    renderDefinitions();
    updateAddSelectedButton();
    definitionSearch.focus();
  }

  function showManualForm() {
    library.hidden = true;
    manualForm.hidden = false;
    manualForm.reset();
    formError.hidden = true;
    formError.textContent = '';
    labelInput.focus();
  }

  function openDialog() {
    selectedDefinitionIds = new Set();
    definitionSearch.value = '';
    dialog.showModal();
    showLibrary();
    void loadDefinitions();
  }

  function closeDialog() {
    pendingIndex = null;
    if (dialog.open) dialog.close();
  }

  function addSelectedDefinitions() {
    const selected = definitions
      .filter((definition) => selectedDefinitionIds.has(definitionId(definition)))
      .map((definition) => ({
        label: definition.label.slice(0, 80),
        namespace: definition.namespace,
        key: definition.key,
        type: definition.type,
      }));
    if (selected.length === 0) return;
    addCustomMetafields(selected);
    if (pendingIndex !== null) {
      rules[pendingIndex] = { field: 'METAFIELD', metafield: { ...selected[0] }, direction: 'ASC' };
    }
    closeDialog();
    render();
    notify();
  }

  document.querySelector('#close-metafield-dialog').addEventListener('click', closeDialog);
  document.querySelector('#cancel-metafield-dialog').addEventListener('click', closeDialog);
  document.querySelector('#create-more-metafield').addEventListener('click', showManualForm);
  document.querySelector('#back-to-metafield-library').addEventListener('click', showLibrary);
  definitionSearch.addEventListener('input', renderDefinitions);
  addSelectedButton.addEventListener('click', addSelectedDefinitions);
  manualForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const metafield = {
      label: labelInput.value.trim(),
      namespace: namespaceInput.value.trim(),
      key: keyInput.value.trim(),
      type: typeInput.value,
    };
    if (!isValidCustomMetafield(metafield)) {
      formError.textContent = 'Use a valid namespace, key, and value type. Keys may contain letters, numbers, hyphens, and underscores.';
      formError.hidden = false;
      return;
    }
    if (!metafield.label) metafield.label = `${metafield.namespace}.${metafield.key}`;
    const submitButton = manualForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.querySelector('span').textContent = 'Creating...';
    try {
      const response = await api.createMetafieldDefinition(metafield);
      const created = response.definition;
      const sortingField = {
        label: created.label.slice(0, 80),
        namespace: created.namespace,
        key: created.key,
        type: created.type,
      };
      addCustomMetafields([sortingField]);
      definitions = [...definitions.filter((definition) => definitionId(definition) !== definitionId(created)), created]
        .sort((left, right) => left.label.localeCompare(right.label));
      definitionsLoaded = true;
      if (pendingIndex !== null) {
        rules[pendingIndex] = { field: 'METAFIELD', metafield: { ...sortingField }, direction: 'ASC' };
      }
      closeDialog();
      render();
      notify();
    } catch (error) {
      formError.textContent = error.message;
      formError.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.querySelector('span').textContent = 'Create sorting field';
    }
  });
  addRuleButton.addEventListener('click', () => {
    const nextField = Object.keys(ruleFields).find((field) => field !== 'METAFIELD' && !rules.some((rule) => rule.field === field));
    if (!nextField) return;
    rules.push({ field: nextField, direction: 'ASC' });
    render();
    notify();
  });
  openMetafieldButton.addEventListener('click', () => {
    if (rules.length >= 4) return;
    pendingIndex = rules.length;
    openDialog();
  });
  document.querySelectorAll('.preset-button').forEach((button) => {
    button.addEventListener('click', () => {
      rules = PRESETS[button.dataset.preset].map((rule) => ({ ...rule }));
      render();
      notify();
    });
  });

  return {
    configure(fields) {
      ruleFields = fields;
      render();
    },
    getRules,
    ruleId,
    ruleLabel,
    formatValue,
  };
}
