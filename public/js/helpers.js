export function customMetafieldId(metafield) {
  return `METAFIELD/${metafield.namespace}/${metafield.key}`;
}

export function isValidCustomMetafield(metafield) {
  return typeof metafield?.namespace === 'string'
    && /^[A-Za-z0-9_.$:-]{1,255}$/.test(metafield.namespace)
    && typeof metafield?.key === 'string'
    && /^[A-Za-z0-9_-]{1,64}$/.test(metafield.key)
    && ['text', 'number', 'date'].includes(metafield.type);
}

export function collectionDetails(collection) {
  return `${collection.productCount.toLocaleString()} products${collection.handle ? `  /  ${collection.handle}` : ''}`;
}

function initials(title) {
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';
}

export function makeCollectionImage(collection, className = '') {
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

export function makeChevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chevron');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}
