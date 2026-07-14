export function customMetafieldId(metafield) {
  return `METAFIELD/${metafield.namespace}/${metafield.key}`;
}

export function metafieldSortType(shopifyType) {
  if (shopifyType === 'date' || shopifyType === 'date_time') return 'date';
  if (shopifyType?.startsWith('number_')) return 'number';
  return 'text';
}

export function toProductMetafieldDefinitionType(sortType) {
  return {
    text: 'single_line_text_field',
    number: 'number_decimal',
    date: 'date',
  }[sortType];
}
