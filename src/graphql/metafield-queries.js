export const LIST_PRODUCT_METAFIELD_DEFINITIONS_QUERY = `
  query ListProductMetafieldDefinitions($first: Int!, $after: String) {
    metafieldDefinitions(first: $first, after: $after, ownerType: PRODUCT) {
      nodes {
        name
        namespace
        key
        type { name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const CREATE_PRODUCT_METAFIELD_DEFINITION_MUTATION = `
  mutation CreateProductMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        name
        namespace
        key
        type { name }
      }
      userErrors { field message }
    }
  }
`;
