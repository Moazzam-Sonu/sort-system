import crypto from 'node:crypto';

import { getDatabase } from '../database/client.js';
import { normalizeRules } from '../sorting/rule-validator.js';

const PREVIEW_TTL_MS = 10 * 60 * 1000;

function rulesMatch(storedRules, rules) {
  const parsedRules = typeof storedRules === 'string' ? JSON.parse(storedRules) : storedRules;
  return JSON.stringify(normalizeRules(parsedRules)) === JSON.stringify(normalizeRules(rules));
}

export async function createPreviewSnapshot({ collectionId, rules, snapshotHash }) {
  const sql = getDatabase();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  const normalizedRules = normalizeRules(rules);
  await sql`
    INSERT INTO sort_preview_snapshots (id, collection_id, rules, snapshot_hash, expires_at)
    VALUES (${id}, ${collectionId}, ${JSON.stringify(normalizedRules)}::jsonb, ${snapshotHash}, ${expiresAt})
  `;
  return id;
}

export async function consumePreviewSnapshot({ previewToken, collectionId, rules }) {
  if (typeof previewToken !== 'string' || !/^[0-9a-f-]{36}$/i.test(previewToken)) {
    throw new Error('Create a fresh preview before applying this order.');
  }
  const sql = getDatabase();
  const [snapshot] = await sql`
    DELETE FROM sort_preview_snapshots
    WHERE id = ${previewToken} AND expires_at > NOW()
    RETURNING collection_id, rules, snapshot_hash
  `;
  if (!snapshot) {
    throw new Error('The preview is no longer valid. Create a fresh preview before applying this order.');
  }
  if (snapshot.collection_id !== collectionId) {
    throw new Error('This preview belongs to another collection. Create a fresh preview before applying this order.');
  }
  if (!rulesMatch(snapshot.rules, rules)) {
    throw new Error('The sorting rules changed since the preview. Create a fresh preview before applying this order.');
  }
  return snapshot.snapshot_hash;
}
