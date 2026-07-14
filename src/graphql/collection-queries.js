export const LIST_COLLECTIONS_QUERY = `
  query ListCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      nodes {
        id
        title
        handle
        image { url altText }
        productsCount { count }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export function buildCollectionProductsQuery(customMetafields) {
  const variableDefinitions = customMetafields
    .map((_, index) => `$metafieldNamespace${index}: String!, $metafieldKey${index}: String!`)
    .join(', ');
  const selections = customMetafields
    .map((_, index) => `customMetafield${index}: metafield(namespace: $metafieldNamespace${index}, key: $metafieldKey${index}) { value }`)
    .join('\n');

  return `
    query GetCollectionProducts($id: ID!, $first: Int!, $after: String${variableDefinitions ? `, ${variableDefinitions}` : ''}) {
      collection(id: $id) {
        id
        title
        sortOrder
        products(first: $first, after: $after) {
          nodes {
            id
            title
            vendor
            productType
            tags
            createdAt
            totalInventory
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            rangeMetafield: metafield(namespace: "custom", key: "range") { value }
            ${selections}
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;
}

export const GET_BEST_SELLING_RANKS_QUERY = `
  query GetBestSellingRanks($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      products(first: $first, after: $after, sortKey: BEST_SELLING) {
        nodes { id }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;
