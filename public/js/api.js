async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.');
    error.logs = data.logs || [];
    throw error;
  }
  return data;
}

function post(url, body) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  collections: () => request('/api/collections'),
  metafieldDefinitions: () => request('/api/metafield-definitions'),
  createMetafieldDefinition: (body) => post('/api/metafield-definitions', body),
  sortOptions: () => request('/api/sort-options'),
  previewRules: (body) => post('/api/rules/preview', body),
  applyRules: (body) => post('/api/rules/apply', body),
  applyRulesBulk: (body) => post('/api/rules/bulk-apply', body),
  applyNative: (body) => post('/api/sort', body),
  applyNativeBulk: (body) => post('/api/sort/bulk-apply', body),
  bulkJob: (jobId) => request(`/api/bulk-jobs/${jobId}`),
};
