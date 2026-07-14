import { collectionDetails, makeChevron, makeCollectionImage } from './helpers.js';

export function createCollectionPicker({ onSelectionChange }) {
  const trigger = document.querySelector('#collection-trigger');
  const picker = document.querySelector('#collection-picker');
  const search = document.querySelector('#collection-search');
  const list = document.querySelector('#collection-list');
  const selectAllButton = document.querySelector('#select-all-collections');
  const clearButton = document.querySelector('#clear-collection-selection');
  const countLabel = document.querySelector('#picker-selection-count');

  let collections = [];
  let selectedIds = new Set();

  function selectedCollections() {
    return collections.filter((collection) => selectedIds.has(collection.id));
  }

  function notifySelectionChange() {
    const selected = selectedCollections();
    countLabel.textContent = `${selected.length.toLocaleString()} selected`;
    renderTrigger(selected);
    onSelectionChange(selected);
  }

  function renderTrigger(selected) {
    trigger.replaceChildren();
    if (selected.length === 0) {
      const placeholder = document.createElement('span');
      placeholder.className = 'trigger-placeholder';
      placeholder.textContent = 'Choose one or more collections...';
      trigger.append(placeholder, makeChevron());
      return;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'selected-collections';
    for (const collection of selected.slice(0, 4)) {
      const chip = document.createElement('span');
      chip.className = 'selected-chip';
      chip.append(makeCollectionImage(collection));

      const label = document.createElement('span');
      label.className = 'selected-chip-label';
      label.textContent = collection.title;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-selected-chip';
      remove.setAttribute('aria-label', `Remove ${collection.title}`);
      remove.textContent = 'x';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        selectedIds.delete(collection.id);
        notifySelectionChange();
        renderList(search.value);
      });
      chip.append(label, remove);
      wrapper.append(chip);
    }

    if (selected.length > 4) {
      const more = document.createElement('span');
      more.className = 'more-selected-chip';
      more.textContent = `+${(selected.length - 4).toLocaleString()} more`;
      wrapper.append(more);
    }
    trigger.append(wrapper, makeChevron());
  }

  function renderList(filter = '') {
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
      const selected = selectedIds.has(collection.id);
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'collection-option';
      option.role = 'option';
      option.setAttribute('aria-selected', String(selected));

      const checkbox = document.createElement('span');
      checkbox.className = 'selection-box';
      checkbox.textContent = selected ? 'OK' : '';
      option.append(checkbox, makeCollectionImage(collection));

      const text = document.createElement('span');
      text.className = 'option-text';
      const title = document.createElement('strong');
      title.textContent = collection.title;
      const details = document.createElement('small');
      details.textContent = collectionDetails(collection);
      text.append(title, details);
      option.append(text);

      option.addEventListener('click', () => {
        if (selectedIds.has(collection.id)) selectedIds.delete(collection.id);
        else selectedIds.add(collection.id);
        notifySelectionChange();
        renderList(search.value);
      });
      list.append(option);
    }
  }

  function open() {
    picker.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    renderList(search.value);
    search.focus();
  }

  function close() {
    picker.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', () => {
    if (trigger.getAttribute('aria-disabled') === 'true') return;
    picker.hidden ? open() : close();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (trigger.getAttribute('aria-disabled') === 'true') return;
    picker.hidden ? open() : close();
  });
  search.addEventListener('input', () => renderList(search.value));
  selectAllButton.addEventListener('click', () => {
    selectedIds = new Set(collections.map((collection) => collection.id));
    notifySelectionChange();
    renderList(search.value);
  });
  clearButton.addEventListener('click', () => {
    selectedIds.clear();
    notifySelectionChange();
    renderList(search.value);
  });
  document.addEventListener('click', (event) => {
    if (!picker.hidden && !event.target.closest('.picker-wrap')) close();
  });

  return {
    setCollections(nextCollections) {
      collections = nextCollections;
      trigger.setAttribute('aria-disabled', 'false');
      notifySelectionChange();
      renderList();
    },
    getSelected: selectedCollections,
  };
}
