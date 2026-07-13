import { setTimeout as sleep } from 'node:timers/promises';

class ShopifyRequestError extends Error {
  constructor(message, { retriable = false } = {}) {
    super(message);
    this.name = 'ShopifyRequestError';
    this.retriable = retriable;
  }
}

function normalizeStoreDomain(store) {
  return store.replace(/^https?:\/\//i, '').replace(/\/+$/u, '');
}

function isRetriableGraphQLError(body) {
  const messages = [
    ...(body?.errors ?? []).map((error) => error?.message ?? ''),
  ];

  return messages.some((message) => {
    const upper = message.toUpperCase();
    return upper.includes('THROTTLED') || upper.includes('MAX_COST_EXCEEDED');
  });
}

function getThrottleStatus(body) {
  return body?.extensions?.cost?.throttleStatus ?? null;
}

function getRequestedCost(body) {
  return body?.extensions?.cost?.requestedQueryCost
    ?? body?.extensions?.cost?.actualQueryCost
    ?? null;
}

function getRetryAfterMs(response) {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryDate = Date.parse(retryAfter);
  if (Number.isNaN(retryDate)) {
    return null;
  }

  return Math.max(0, retryDate - Date.now());
}

function calculateThrottleDelayMs({ response, body, attempt }) {
  const retryAfterMs = getRetryAfterMs(response);
  if (retryAfterMs !== null) {
    return retryAfterMs + 250;
  }

  const throttleStatus = getThrottleStatus(body);
  const requestedCost = getRequestedCost(body) ?? 100;

  if (throttleStatus?.restoreRate) {
    const deficit = Math.max(0, requestedCost - (throttleStatus.currentlyAvailable ?? 0));
    const waitMs = Math.ceil((deficit / throttleStatus.restoreRate) * 1000);
    return Math.max(1_000, waitMs + 250);
  }

  return Math.min(30_000, 1_000 * (2 ** attempt));
}

function shouldBackOffAfterSuccess(body) {
  const throttleStatus = getThrottleStatus(body);
  if (!throttleStatus?.restoreRate) {
    return 0;
  }

  const requestedCost = getRequestedCost(body) ?? 0;
  const safetyFloor = Math.max(100, requestedCost);
  const currentlyAvailable = throttleStatus.currentlyAvailable ?? safetyFloor;

  if (currentlyAvailable >= safetyFloor) {
    return 0;
  }

  const deficit = safetyFloor - currentlyAvailable;
  return Math.ceil((deficit / throttleStatus.restoreRate) * 1000);
}

export class ShopifyAdminClient {
  constructor({ store, accessToken, apiVersion, maxRetries = 5 }) {
    this.store = normalizeStoreDomain(store);
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
    this.maxRetries = maxRetries;
    this.endpoint = `https://${this.store}/admin/api/${this.apiVersion}/graphql.json`;
  }

  async request({ query, variables = {}, extraHeaders = {} }) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': this.accessToken,
            ...extraHeaders,
          },
          body: JSON.stringify({ query, variables }),
        });

        const body = await response.json().catch(() => ({}));

        if (!response.ok || isRetriableGraphQLError(body)) {
          const retriableStatus = response.status === 429 || response.status >= 500;
          const retriableError = isRetriableGraphQLError(body);

          if ((retriableStatus || retriableError) && attempt < this.maxRetries) {
            const delayMs = calculateThrottleDelayMs({ response, body, attempt });
            console.warn(`Retrying Shopify request in ${delayMs}ms (attempt ${attempt + 1}/${this.maxRetries})...`);
            await sleep(delayMs);
            continue;
          }
        }

        if (!response.ok) {
          throw new ShopifyRequestError(
            `Shopify request failed with HTTP ${response.status}: ${JSON.stringify(body)}`,
            { retriable: false },
          );
        }

        if (body.errors?.length) {
          throw new ShopifyRequestError(
            `Shopify GraphQL errors: ${JSON.stringify(body.errors)}`,
            { retriable: false },
          );
        }

        const postSuccessDelayMs = shouldBackOffAfterSuccess(body);
        if (postSuccessDelayMs > 0) {
          await sleep(postSuccessDelayMs);
        }

        return body;
      } catch (error) {
        const isLastAttempt = attempt >= this.maxRetries;
        const retriable = !(error instanceof ShopifyRequestError) || error.retriable;

        if (isLastAttempt || !retriable) {
          throw error;
        }

        const delayMs = Math.min(30_000, 1_000 * (2 ** attempt));
        console.warn(`Request error: ${error.message}. Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }

    throw new Error('Unexpected Shopify request retry exhaustion.');
  }
}
