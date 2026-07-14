import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { getDatabase } from '../database/client.js';

const scrypt = promisify(crypto.scrypt);
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;

function normalizeUsername(username) {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username.trim())) return null;
  return username.trim().toLowerCase();
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('base64url')}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedKey] = storedHash?.split('$') ?? [];
  if (algorithm !== 'scrypt' || !salt || !expectedKey) return false;
  const derivedKey = Buffer.from(await scrypt(password, salt, 64));
  const expectedBuffer = Buffer.from(expectedKey, 'base64url');
  return derivedKey.length === expectedBuffer.length && crypto.timingSafeEqual(derivedKey, expectedBuffer);
}

export async function authenticateUser(username, password) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || typeof password !== 'string') return null;

  const sql = getDatabase();
  const [user] = await sql`
    SELECT id, username, password_hash, role
    FROM app_users
    WHERE username = ${normalizedUsername} AND is_active = TRUE
  `;
  if (!user) {
    await hashPassword(password);
    return null;
  }
  if (!await verifyPassword(password, user.password_hash)) return null;
  return { id: user.id, username: user.username, role: user.role };
}

export async function createOrUpdateUser({ username, password, role = 'admin' }) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) throw new Error('Username must contain 3-64 letters, numbers, dots, hyphens, or underscores.');
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Password must contain at least 12 characters.');
  }
  if (!['admin', 'operator'].includes(role)) throw new Error('Role must be admin or operator.');

  const sql = getDatabase();
  const passwordHash = await hashPassword(password);
  const [user] = await sql`
    INSERT INTO app_users (username, password_hash, role)
    VALUES (${normalizedUsername}, ${passwordHash}, ${role})
    ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          is_active = TRUE,
          updated_at = NOW()
    RETURNING id, username, role
  `;
  return user;
}
