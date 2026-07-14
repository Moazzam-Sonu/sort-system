export function createFeedback() {
  const previewPanel = document.querySelector('#preview-panel');
  const previewSummary = document.querySelector('#preview-summary');
  const previewBadge = document.querySelector('#preview-badge');
  const previewRules = document.querySelector('#preview-rules');
  const previewWarnings = document.querySelector('#preview-warnings');
  const previewProducts = document.querySelector('#preview-products');
  const applyButton = document.querySelector('#apply-custom-button');
  const resultPanel = document.querySelector('#result-panel');
  const resultIcon = document.querySelector('#result-icon');
  const resultKicker = document.querySelector('#result-kicker');
  const resultTitle = document.querySelector('#result-title');
  const resultSummary = document.querySelector('#result-summary');
  const resultLog = document.querySelector('#result-log');
  const bulkPanel = document.querySelector('#bulk-progress-panel');
  const bulkTitle = document.querySelector('#bulk-progress-title');
  const bulkSummary = document.querySelector('#bulk-progress-summary');
  const bulkStatus = document.querySelector('#bulk-progress-status');
  const bulkBar = document.querySelector('#bulk-progress-bar');
  const bulkErrors = document.querySelector('#bulk-progress-errors');

  document.querySelector('#close-result').addEventListener('click', () => { resultPanel.hidden = true; });

  function hidePreview() {
    previewPanel.hidden = true;
    applyButton.disabled = true;
  }

  function showPreview({ preview, rules, selectedCount, ruleBuilder }) {
    previewPanel.hidden = false;
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
      values.textContent = rules.map((rule) => `${ruleBuilder.ruleLabel(rule)}: ${ruleBuilder.formatValue(rule, product.values[ruleBuilder.ruleId(rule)])}`).join('  |  ');
      row.append(next, details, previous, values);
      previewProducts.append(row);
    }

    applyButton.disabled = selectedCount === 1 && !preview.changed;
    applyButton.querySelector('span').textContent = selectedCount > 1
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
    bulkPanel.hidden = false;
    const percent = job.total === 0 ? 0 : Math.round((job.processed / job.total) * 100);
    bulkTitle.textContent = label;
    bulkSummary.textContent = `${job.processed.toLocaleString()} of ${job.total.toLocaleString()} collections processed. ${job.changed.toLocaleString()} changed, ${job.unchanged.toLocaleString()} already in order, ${job.failed.toLocaleString()} failed.`;
    bulkStatus.textContent = job.status.replaceAll('_', ' ');
    bulkStatus.classList.toggle('is-neutral', job.status !== 'running' && job.status !== 'queued');
    bulkBar.style.width = `${percent}%`;
    bulkErrors.replaceChildren();
    for (const error of job.errors || []) {
      const line = document.createElement('p');
      line.textContent = `${error.collectionId || 'Batch'}: ${error.message}`;
      bulkErrors.append(line);
    }
    bulkErrors.hidden = !job.errors?.length;
  }

  return { applyButton, hidePreview, showPreview, showResult, setButtonBusy, renderBatchProgress };
}
