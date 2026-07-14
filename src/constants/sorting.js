export const RULE_FIELDS = {
  RANGE: { label: 'Custom Range', type: 'text', description: 'custom.range metafield' },
  TITLE: { label: 'Product Title', type: 'text', description: 'Product name' },
  VENDOR: { label: 'Vendor', type: 'text', description: 'Product vendor' },
  PRODUCT_TYPE: { label: 'Product Type', type: 'text', description: 'Shopify product type' },
  TAGS: { label: 'Tags', type: 'text', description: 'Product tags, alphabetically' },
  PRICE: { label: 'Price', type: 'number', description: 'Lowest variant price' },
  CREATED_AT: { label: 'Created Date', type: 'date', description: 'Product creation date' },
  INVENTORY: { label: 'Inventory', type: 'number', description: 'Total inventory quantity' },
  BEST_SELLING: { label: 'Best Selling', type: 'number', description: 'Shopify best-selling rank' },
  METAFIELD: { label: 'Custom metafield', type: 'text', description: 'A metafield you add by namespace and key' },
};

export const SORT_OPTIONS = {
  RANGE: { label: 'Custom Range', description: 'Custom Range, then Product Title' },
  BEST_SELLING: { label: 'Best Selling', description: 'Best-selling products first' },
  ALPHA_ASC: { label: 'Alphabetical: A to Z', description: 'Product title from A to Z' },
  ALPHA_DESC: { label: 'Alphabetical: Z to A', description: 'Product title from Z to A' },
  PRICE_ASC: { label: 'Price: Low to High', description: 'Lowest-priced products first' },
  PRICE_DESC: { label: 'Price: High to Low', description: 'Highest-priced products first' },
  CREATED_DESC: { label: 'Newest First', description: 'Most recently created products first' },
  CREATED: { label: 'Oldest First', description: 'Oldest products first' },
};
