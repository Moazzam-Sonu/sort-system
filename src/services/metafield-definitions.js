import { PAGE_SIZE } from '../config.js';
import {
  CREATE_PRODUCT_METAFIELD_DEFINITION_MUTATION,
  LIST_PRODUCT_METAFIELD_DEFINITIONS_QUERY,
} from '../graphql/metafield-queries.js';
import { normalizeCustomMetafield } from '../sorting/rule-validator.js';
import { metafieldSortType, toProductMetafieldDefinitionType } from '../utils/metafields.js';
import { formatUserErrors } from '../utils/shopify-errors.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function mapDefinition(definition) {
  return {
    label: definition.name?.trim() || `${definition.namespace}.${definition.key}`,
    namespace: definition.namespace,
    key: definition.key,
    type: metafieldSortType(definition.type?.name),
    shopifyType: definition.type?.name || 'unknown',
  };
}

export async function listProductMetafieldDefinitions(client) {
  const definitions = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await client.request({
      query: LIST_PRODUCT_METAFIELD_DEFINITIONS_QUERY,
      variables: { first: PAGE_SIZE, after },
    });
    const connection = response.data?.metafieldDefinitions;
    if (!connection) throw new Error('Product metafield definitions could not be fetched from Shopify.');

    definitions.push(...connection.nodes.map(mapDefinition));
    hasNextPage = connection.pageInfo.hasNextPage;
    if (!hasNextPage) {
      return definitions.sort((left, right) => collator.compare(left.label, right.label));
    }
    after = connection.pageInfo.endCursor;
  }
}

export async function createProductMetafieldDefinition(client, metafield) {
  const normalized = normalizeCustomMetafield(metafield, 0);
  const response = await client.request({
    query: CREATE_PRODUCT_METAFIELD_DEFINITION_MUTATION,
    variables: {
      definition: {
        name: normalized.label,
        namespace: normalized.namespace,
        key: normalized.key,
        ownerType: 'PRODUCT',
        type: toProductMetafieldDefinitionType(normalized.type),
      },
    },
  });
  const payload = response.data?.metafieldDefinitionCreate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) throw new Error(formatUserErrors(userErrors));
  if (!payload?.createdDefinition) throw new Error('Shopify did not create the product metafield definition.');
  return mapDefinition(payload.createdDefinition);
}
