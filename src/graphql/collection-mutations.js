export const UPDATE_COLLECTION_SORT_ORDER_MUTATION = `
  mutation CollectionUpdateSortOrder($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id sortOrder }
      job { id done }
      userErrors { field message }
    }
  }
`;

export const REORDER_COLLECTION_PRODUCTS_MUTATION = `
  mutation ReorderCollectionProducts($id: ID!, $moves: [MoveInput!]!, $idempotencyKey: String!) {
    collectionReorderProducts(id: $id, moves: $moves) @idempotent(key: $idempotencyKey) {
      job { id }
      userErrors { field message }
    }
  }
`;
