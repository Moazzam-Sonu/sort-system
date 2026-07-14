import { setTimeout as sleep } from 'node:timers/promises';

import { JOB_POLL_INTERVAL_MS, JOB_TIMEOUT_MS } from '../config.js';
import { GET_JOB_STATUS_QUERY } from '../graphql/job-queries.js';

export async function waitForJob(client, jobId, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    const response = await client.request({ query: GET_JOB_STATUS_QUERY, variables: { id: jobId } });
    if (response.data?.job?.done) return;
    await sleep(JOB_POLL_INTERVAL_MS);
  }
  throw new Error(`${label} did not finish within ${JOB_TIMEOUT_MS / 1000} seconds.`);
}
