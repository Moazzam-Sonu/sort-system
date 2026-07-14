import { PAGE_SIZE } from '../config.js';
import {
  buildCollectionProductsQuery,
  buildDraftCollectionProductsQuery,
  GET_BEST_SELLING_RANKS_QUERY,
  LIST_COLLECTIONS_QUERY,
} from '../graphql/collection-queries.js';
import { customMetafieldId } from '../utils/metafields.js';

function withCustomMetafields(product, customMetafields) {
  return {
    ...product,
    customMetafields: Object.fromEntries(customMetafields.map((metafield, index) => [
      customMetafieldId(metafield),
      product[`customMetafield${index}`]?.value ?? null,
    ])),
  };
}

function metafieldVariables(customMetafields) {
  return Object.fromEntries(customMetafields.flatMap((metafield, index) => [
    [`metafieldNamespace${index}`, metafield.namespace],
    [`metafieldKey${index}`, metafield.key],
  ]));
}

export async function listCollections(client) {
  const collections = [];
  let after = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const response = await client.request({ query: LIST_COLLECTIONS_QUERY, variables: { first: PAGE_SIZE, after } });
    const connection = response.data?.collections;
    if (!connection) throw new Error('Collections could not be fetched from Shopify.');

    collections.push(...connection.nodes.map((collection) => ({
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      image: collection.image ? { url: collection.image.url, altText: collection.image.altText } : null,
      productCount: collection.productsCount?.count ?? 0,
    })));
    hasNextPage = connection.pageInfo.hasNextPage;
    if (!hasNextPage) return collections;
    after = connection.pageInfo.endCursor;
  }
}

export async function fetchAllCollectionProducts(client, collectionId, rules, log = () => {}) {
  const collectionProducts = [];
  const customMetafields = rules.filter((rule) => rule.field === 'METAFIELD').map((rule) => rule.metafield);
  const query = buildCollectionProductsQuery(customMetafields);
  let after = null;
  let collectionTitle = '';
  let sortOrder = '';
  let hasNextPage = true;

  log('Fetching products from Shopify...');
  while (hasNextPage) {
    const response = await client.request({
      query,
      variables: {
        id: collectionId,
        first: PAGE_SIZE,
        after,
        ...Object.fromEntries(customMetafields.flatMap((metafield, index) => [
          [`metafieldNamespace${index}`, metafield.namespace],
          [`metafieldKey${index}`, metafield.key],
        ])),
      },
    });
    const collection = response.data?.collection;
    if (!collection) throw new Error('The selected collection could not be found. Refresh the page and try again.');

    collectionTitle = collection.title;
    sortOrder = collection.sortOrder;
    collectionProducts.push(...collection.products.nodes.map((product) => withCustomMetafields(product, customMetafields)));
    hasNextPage = collection.products.pageInfo.hasNextPage;
    if (!hasNextPage) {
      if (rules.some((rule) => rule.field === 'BEST_SELLING')) {
        const ranks = await fetchBestSellingRanks(client, collectionId, log);
        for (const product of collectionProducts) {
          product.bestSellingRank = ranks.get(product.id) ?? null;
        }
      }
      const draftProducts = await fetchDraftCollectionProducts(client, collection.legacyResourceId, customMetafields, log);
      const collectionProductIds = new Set(collectionProducts.map((product) => product.id));
      const supplementalDraftProducts = draftProducts.filter((product) => !collectionProductIds.has(product.id));
      const products = [...collectionProducts, ...supplementalDraftProducts];
      return {
        collectionTitle,
        sortOrder,
        products,
        collectionProductIds,
        hasSupplementalDraftProducts: supplementalDraftProducts.length > 0,
      };
    }
    after = collection.products.pageInfo.endCursor;
  }
}

async function fetchDraftCollectionProducts(client, legacyCollectionId, customMetafields, log) {
  if (!legacyCollectionId) return [];

  const products = [];
  const query = buildDraftCollectionProductsQuery(customMetafields);
  const productQuery = `collection_id:${legacyCollectionId} status:draft`;
  let after = null;
  let hasNextPage = true;
  log('Fetching draft products from Shopify...');

  while (hasNextPage) {
    const response = await client.request({
      query,
      variables: {
        first: PAGE_SIZE,
        after,
        query: productQuery,
        ...metafieldVariables(customMetafields),
      },
    });
    const connection = response.data?.products;
    if (!connection) throw new Error('Draft products could not be fetched from Shopify.');

    products.push(...connection.nodes.map((product) => withCustomMetafields(product, customMetafields)));
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
  }

  return products;
}

async function fetchBestSellingRanks(client, collectionId, log) {
  const ranks = new Map();
  let after = null;
  let position = 0;
  let hasNextPage = true;
  log('Fetching Shopify best-selling ranks...');
  while (hasNextPage) {
    const response = await client.request({
      query: GET_BEST_SELLING_RANKS_QUERY,
      variables: { id: collectionId, first: PAGE_SIZE, after },
    });
    const connection = response.data?.collection?.products;
    if (!connection) throw new Error('Best-selling ranks could not be fetched from Shopify.');
    for (const product of connection.nodes) {
      position += 1;
      ranks.set(product.id, position);
    }
    hasNextPage = connection.pageInfo.hasNextPage;
    if (!hasNextPage) return ranks;
    after = connection.pageInfo.endCursor;
  }
}
