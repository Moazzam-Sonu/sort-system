import { PAGE_SIZE } from '../config.js';
import {
  buildCollectionProductsQuery,
  GET_BEST_SELLING_RANKS_QUERY,
  LIST_COLLECTIONS_QUERY,
} from '../graphql/collection-queries.js';
import { customMetafieldId } from '../utils/metafields.js';

export async function listCollections(client) {
  const collections = [];
  let after = null;
  while (true) {
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
    if (!connection.pageInfo.hasNextPage) return collections;
    after = connection.pageInfo.endCursor;
  }
}

export async function fetchAllCollectionProducts(client, collectionId, rules, log = () => {}) {
  const products = [];
  const customMetafields = rules.filter((rule) => rule.field === 'METAFIELD').map((rule) => rule.metafield);
  const query = buildCollectionProductsQuery(customMetafields);
  let after = null;
  let collectionTitle = '';
  let sortOrder = '';

  log('Fetching products from Shopify...');
  while (true) {
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
    products.push(...collection.products.nodes.map((product) => ({
      ...product,
      customMetafields: Object.fromEntries(customMetafields.map((metafield, index) => [
        customMetafieldId(metafield),
        product[`customMetafield${index}`]?.value ?? null,
      ])),
    })));
    if (!collection.products.pageInfo.hasNextPage) {
      if (rules.some((rule) => rule.field === 'BEST_SELLING')) {
        const ranks = await fetchBestSellingRanks(client, collectionId, log);
        for (const product of products) {
          product.bestSellingRank = ranks.get(product.id) ?? null;
        }
      }
      return { collectionTitle, sortOrder, products };
    }
    after = collection.products.pageInfo.endCursor;
  }
}

async function fetchBestSellingRanks(client, collectionId, log) {
  const ranks = new Map();
  let after = null;
  let position = 0;
  log('Fetching Shopify best-selling ranks...');
  while (true) {
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
    if (!connection.pageInfo.hasNextPage) return ranks;
    after = connection.pageInfo.endCursor;
  }
}
