import { api } from './js/api.js';
import { createCollectionPicker } from './js/collection-picker.js';
import { createFeedback } from './js/feedback.js';
import { createRuleBuilder } from './js/rule-builder.js';
import Swal from '/vendor/sweetalert2.esm.all.min.js';

const collectionStatus = document.querySelector('#collection-status');
const selectionSummary = document.querySelector('#selection-summary');
const previewButton = document.querySelector('#preview-button');
const nativeSortSelect = document.querySelector('#native-sort-select');
const applyNativeButton = document.querySelector('#apply-native-button');
const logoutButton = document.querySelector('#logout-button');
const profileMenu = document.querySelector('#profile-menu');
const profileTrigger = document.querySelector('#profile-trigger');
const profilePopover = document.querySelector('#profile-popover');
const profileAvatar = document.querySelector('#profile-avatar');
const profileMenuAvatar = document.querySelector('#profile-menu-avatar');
const profileName = document.querySelector('#profile-name');
const profileMenuName = document.querySelector('#profile-menu-name');
const profileRole = document.querySelector('#profile-role');
const profileMenuRole = document.querySelector('#profile-menu-role');
const feedback = createFeedback();

let sortOptions = {};
let previewKey = null;
let activeBulkJobId = null;

function userInitials(username) {
  return username
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
}

function formatRole(role) {
  return role ? `${role[0].toUpperCase()}${role.slice(1)} access` : 'Authenticated user';
}

function renderProfile(user) {
  const initials = userInitials(user.username);
  const role = formatRole(user.role);
  profileAvatar.textContent = initials;
  profileMenuAvatar.textContent = initials;
  profileName.textContent = user.username;
  profileMenuName.textContent = user.username;
  profileRole.textContent = role;
  profileMenuRole.textContent = role;
  profileMenu.classList.remove('is-loading');
  profileMenu.removeAttribute('aria-busy');
  profileTrigger.disabled = false;
}

function finishInitialLoading() {
  document.querySelectorAll('[data-initial-skeleton]').forEach((element) => {
    element.classList.remove('is-loading');
    element.removeAttribute('aria-busy');
  });
}

function setProfileMenuOpen(isOpen) {
  profileTrigger.setAttribute('aria-expanded', String(isOpen));
  profilePopover.hidden = !isOpen;
}

function invalidatePreview() {
  previewKey = null;
  feedback.hidePreview();
}

function updateActionState() {
  const selected = picker.getSelected();
  previewButton.disabled = selected.length === 0;
  applyNativeButton.disabled = selected.length === 0 || !nativeSortSelect.value;
  selectionSummary.textContent = selected.length === 0
    ? 'Select one or more collections to preview a custom order.'
    : selected.length === 1
      ? '1 collection selected. Preview the new order before applying it.'
      : `${selected.length.toLocaleString()} collections selected. The preview uses the first selected collection as a sample.`;
}

const picker = createCollectionPicker({
  onSelectionChange() {
    invalidatePreview();
    updateActionState();
  },
});

const ruleBuilder = createRuleBuilder({
  onRulesChange() {
    invalidatePreview();
  },
});

function currentPreviewKey() {
  return JSON.stringify({
    rules: ruleBuilder.getRules(),
    collectionIds: picker.getSelected().map((collection) => collection.id).sort(),
  });
}

async function confirmSorting({ title, message, confirmText }) {
  const result = await Swal.fire({
    title,
    text: message,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
    reverseButtons: true,
    buttonsStyling: false,
    focusCancel: true,
    customClass: {
      popup: 'swal-popup',
      confirmButton: 'swal-confirm',
      cancelButton: 'swal-cancel',
    },
  });
  return result.isConfirmed;
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
  nativeSortSelect.disabled = false;
}

async function pollBulkJob(jobId, label) {
  try {
    const { job } = await api.bulkJob(jobId);
    feedback.renderBatchProgress(job, label);
    if (job.status === 'queued' || job.status === 'running') {
      window.setTimeout(() => { void pollBulkJob(jobId, label); }, 1500);
      return;
    }
    activeBulkJobId = null;
    feedback.showResult({
      failed: job.status === 'failed' || job.status === 'cancelled',
      title: job.status === 'completed'
        ? 'Batch sorting completed'
        : job.status === 'cancelled'
          ? 'Batch sorting cancelled'
          : 'Batch sorting finished with issues',
      summary: `${job.changed.toLocaleString()} collections changed, ${job.unchanged.toLocaleString()} already in order, and ${job.failed.toLocaleString()} failed.`,
    });
  } catch (error) {
    feedback.showResult({ failed: true, title: 'Batch progress could not be loaded', summary: error.message });
  }
}

async function startBulkSort({ request, label }) {
  feedback.showBatchLoading(label);
  try {
    const { job } = await request();
    activeBulkJobId = job.id;
    feedback.renderBatchProgress(job, label);
    void pollBulkJob(job.id, label);
  } catch (error) {
    feedback.hideBatch();
    throw error;
  }
}

previewButton.addEventListener('click', async () => {
  const [collection] = picker.getSelected();
  if (!collection) return;
  feedback.setButtonBusy(previewButton, true, 'Building preview...', 'Preview order');
  feedback.showPreviewLoading();
  document.querySelector('#result-panel').hidden = true;
  try {
    const { preview } = await api.previewRules({ collectionId: collection.id, rules: ruleBuilder.getRules() });
    previewKey = currentPreviewKey();
    feedback.showPreview({
      preview,
      rules: ruleBuilder.getRules(),
      selectedCount: picker.getSelected().length,
      ruleBuilder,
    });
  } catch (error) {
    feedback.hidePreview();
    feedback.showResult({ failed: true, title: 'Preview could not be created', summary: error.message, logs: error.logs });
  } finally {
    previewButton.disabled = picker.getSelected().length === 0;
    previewButton.classList.remove('is-busy');
    previewButton.querySelector('span').textContent = 'Preview order';
  }
});

feedback.applyButton.addEventListener('click', async () => {
  const selected = picker.getSelected();
  if (selected.length === 0 || previewKey !== currentPreviewKey()) return;
  const isBatch = selected.length > 1;
  const confirmed = await confirmSorting({
    title: isBatch ? 'Start batch sorting?' : 'Apply custom sorting?',
    message: isBatch
      ? `${selected.length.toLocaleString()} collections will be sorted in the background.`
      : `${selected[0].title} will be updated in Shopify.`,
    confirmText: isBatch ? 'Start batch' : 'Apply sorting',
  });
  if (!confirmed) return;

  feedback.setButtonBusy(feedback.applyButton, true, isBatch ? 'Starting batch...' : 'Applying order...', 'Confirm and apply');
  try {
    if (isBatch) {
      await startBulkSort({
        request: () => api.applyRulesBulk({ collectionIds: selected.map((collection) => collection.id), rules: ruleBuilder.getRules(), confirmed: true }),
        label: 'Applying custom rules to selected collections',
      });
      feedback.showResult({ title: 'Batch sorting started', summary: `${selected.length.toLocaleString()} collections are being sorted in the background.` });
    } else {
      const { result, logs } = await api.applyRules({ collectionId: selected[0].id, rules: ruleBuilder.getRules(), confirmed: true });
      feedback.showResult({
        title: 'Custom order was applied successfully',
        summary: result.changed
          ? `${result.movedCount.toLocaleString()} product positions were updated in ${selected[0].title}.`
          : 'This collection was already in the requested order.',
        logs,
      });
    }
    previewKey = null;
    feedback.applyButton.disabled = true;
  } catch (error) {
    feedback.showResult({ failed: true, title: 'Sorting could not be completed', summary: error.message, logs: error.logs });
  } finally {
    feedback.applyButton.classList.remove('is-busy');
    feedback.applyButton.querySelector('span').textContent = 'Confirm and apply';
    if (previewKey === currentPreviewKey()) feedback.applyButton.disabled = false;
  }
});

nativeSortSelect.addEventListener('change', updateActionState);
profileTrigger.addEventListener('click', () => {
  setProfileMenuOpen(profileTrigger.getAttribute('aria-expanded') !== 'true');
});

document.addEventListener('click', (event) => {
  if (!profileMenu.contains(event.target)) setProfileMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setProfileMenuOpen(false);
    profileTrigger.focus();
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await api.logout();
  } finally {
    window.location.assign('/login');
  }
});

feedback.cancelBulkButton.addEventListener('click', async () => {
  if (!activeBulkJobId) return;
  const confirmed = await confirmSorting({
    title: 'Cancel batch sorting?',
    message: 'The collection currently being updated may finish, but no further collections will be processed.',
    confirmText: 'Cancel batch',
  });
  if (!confirmed) return;

  feedback.setButtonBusy(feedback.cancelBulkButton, true, 'Cancelling...', 'Cancel batch');
  try {
    const { job } = await api.cancelBulkJob(activeBulkJobId);
    feedback.renderBatchProgress(job, 'Batch sorting');
    activeBulkJobId = null;
  } catch (error) {
    feedback.showResult({ failed: true, title: 'Batch could not be cancelled', summary: error.message });
  } finally {
    feedback.cancelBulkButton.classList.remove('is-busy');
    feedback.cancelBulkButton.querySelector('span').textContent = 'Cancel batch';
  }
});
applyNativeButton.addEventListener('click', async () => {
  const selected = picker.getSelected();
  if (selected.length === 0 || !nativeSortSelect.value) return;
  const label = nativeSortSelect.options[nativeSortSelect.selectedIndex].text;
  const isBatch = selected.length > 1;
  const confirmed = await confirmSorting({
    title: isBatch ? 'Start batch sorting?' : 'Apply Shopify sorting?',
    message: isBatch
      ? `${label} will be applied to ${selected.length.toLocaleString()} collections in the background.`
      : `${label} will be applied to ${selected[0].title}.`,
    confirmText: isBatch ? 'Start batch' : 'Apply sorting',
  });
  if (!confirmed) return;

  feedback.setButtonBusy(applyNativeButton, true, 'Applying...', 'Apply native sort');
  try {
    if (isBatch) {
      await startBulkSort({
        request: () => api.applyNativeBulk({ collectionIds: selected.map((collection) => collection.id), sortOrder: nativeSortSelect.value, confirmed: true }),
        label: `Applying ${label} to selected collections`,
      });
      feedback.showResult({ title: 'Batch sorting started', summary: `${selected.length.toLocaleString()} collections are being sorted in the background.` });
    } else {
      const { logs } = await api.applyNative({ collectionId: selected[0].id, sortOrder: nativeSortSelect.value });
      invalidatePreview();
      feedback.showResult({ title: 'Shopify native sort was applied', summary: `${selected[0].title} is now sorted by ${label}.`, logs });
    }
  } catch (error) {
    feedback.showResult({ failed: true, title: 'Native sorting could not be completed', summary: error.message, logs: error.logs });
  } finally {
    applyNativeButton.disabled = picker.getSelected().length === 0 || !nativeSortSelect.value;
    applyNativeButton.classList.remove('is-busy');
    applyNativeButton.textContent = 'Apply native sort';
  }
});

async function loadApp() {
  try {
    const sessionRequest = api.session().then((sessionData) => {
      renderProfile(sessionData.user);
      return sessionData;
    });
    const [optionsData, collectionsData] = await Promise.all([
      api.sortOptions(),
      api.collections(),
    ]);
    await sessionRequest;
    sortOptions = optionsData.options;
    ruleBuilder.configure(optionsData.ruleFields);
    renderNativeSortOptions();
    picker.setCollections(collectionsData.collections);
    collectionStatus.classList.remove('is-loading');
    collectionStatus.textContent = `${collectionsData.collections.length.toLocaleString()} collections available`;
    finishInitialLoading();
  } catch (error) {
    finishInitialLoading();
    collectionStatus.classList.remove('is-loading');
    collectionStatus.textContent = 'The app could not finish loading';
    feedback.showResult({ failed: true, title: 'Shopify connection issue', summary: error.message });
  }
}

loadApp();
