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
  const form = document.querySelector('#metafield-form');
  const labelInput = document.querySelector('#metafield-label');
  const namespaceInput = document.querySelector('#metafield-namespace');
  const keyInput = document.querySelector('#metafield-key');
  const typeInput = document.querySelector('#metafield-type');
  const formError = document.querySelector('#metafield-form-error');

  let ruleFields = {};
  let customMetafields = loadCustomMetafields();
  let pendingIndex = null;
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
    addOption.textContent = '+ Add custom metafield...';
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

  function openDialog() {
    form.reset();
    formError.hidden = true;
    formError.textContent = '';
    dialog.showModal();
    labelInput.focus();
  }

  function closeDialog() {
    pendingIndex = null;
    dialog.close();
  }

  document.querySelector('#close-metafield-dialog').addEventListener('click', closeDialog);
  document.querySelector('#cancel-metafield-dialog').addEventListener('click', closeDialog);
  form.addEventListener('submit', (event) => {
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
    const duplicateIndex = customMetafields.findIndex((item) => customMetafieldId(item) === customMetafieldId(metafield));
    if (duplicateIndex >= 0) customMetafields[duplicateIndex] = metafield;
    else customMetafields.push(metafield);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customMetafields));

    if (pendingIndex !== null) {
      rules[pendingIndex] = { field: 'METAFIELD', metafield: { ...metafield }, direction: 'ASC' };
    }
    closeDialog();
    render();
    notify();
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
