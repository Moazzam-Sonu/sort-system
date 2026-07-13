import 'dotenv/config';

export const API_VERSION = '2026-04';
export const SHOPIFY_STORE = process.env.SHOPIFY_STORE?.trim();
export const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
export const PAGE_SIZE = 250;
export const MAX_MOVES_PER_REQUEST = 250;
export const MAX_RETRIES = 6;
export const JOB_POLL_INTERVAL_MS = 2_000;
export const JOB_TIMEOUT_MS = 15 * 60 * 1000;

export function validateConfig() {
  if (!SHOPIFY_STORE) {
    throw new Error('Missing SHOPIFY_STORE in .env');
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Missing SHOPIFY_ACCESS_TOKEN in .env');
  }

  if (!SHOPIFY_STORE.endsWith('.myshopify.com')) {
    throw new Error('SHOPIFY_STORE must look like "your-store.myshopify.com"');
  }
}
