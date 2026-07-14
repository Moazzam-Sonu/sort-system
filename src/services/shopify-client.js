import {
  API_VERSION,
  MAX_RETRIES,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_STORE,
  validateConfig,
} from '../config.js';
import { ShopifyAdminClient } from '../lib/shopify-admin.js';

export function createShopifyClient() {
  validateConfig();
  return new ShopifyAdminClient({
    store: SHOPIFY_STORE,
    accessToken: SHOPIFY_ACCESS_TOKEN,
    apiVersion: API_VERSION,
    maxRetries: MAX_RETRIES,
  });
}
