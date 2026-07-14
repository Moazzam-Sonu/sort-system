export function normalizeCollectionIds(collectionIds) {
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
    throw new Error('Select at least one collection.');
  }
  const ids = [...new Set(collectionIds)];
  if (ids.length > 5_000) {
    throw new Error('A batch can contain up to 5,000 collections.');
  }
  if (ids.some((id) => !id?.startsWith('gid://shopify/Collection/'))) {
    throw new Error('One or more selected collections are invalid.');
  }
  return ids;
}
