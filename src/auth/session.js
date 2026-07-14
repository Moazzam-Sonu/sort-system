import crypto from 'node:crypto';

import { getDatabase } from '../database/client.js';

export const SESSION_COOKIE_NAME = 'collection_sorter_session';

export function getSessionTtlMs() {
  const hours = Number(process.env.APP_SESSION_HOURS || 12);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
    throw new Error('APP_SESSION_HOURS must be between 1 and 168.');
  }
  return hours * 60 * 60 * 1000;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + getSessionTtlMs());
  const sql = getDatabase();
  await sql`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (${crypto.randomUUID()}, ${userId}, ${hashToken(token)}, ${expiresAt.toISOString()})
  `;
  return token;
}

export async function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  const sql = getDatabase();
  const [session] = await sql`
    SELECT users.id AS user_id, users.username, users.role
    FROM auth_sessions AS sessions
    JOIN app_users AS users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${hashToken(token)}
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > NOW()
      AND users.is_active = TRUE
  `;
  return session ? { id: session.user_id, username: session.username, role: session.role } : null;
}

export async function revokeSession(token) {
  if (!token || typeof token !== 'string') return;
  const sql = getDatabase();
  await sql`
    UPDATE auth_sessions
    SET revoked_at = NOW()
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
  `;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: getSessionTtlMs(),
    path: '/',
  };
}
