import { authenticateUser } from '../auth/auth-service.js';
import { createSession, getSessionTtlMs, revokeSession, SESSION_COOKIE_NAME, sessionCookieOptions } from '../auth/session.js';

const attemptsByIp = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getAttemptState(ip) {
  const current = attemptsByIp.get(ip);
  if (!current || current.resetAt <= Date.now()) {
    const next = { count: 0, resetAt: Date.now() + WINDOW_MS };
    attemptsByIp.set(ip, next);
    return next;
  }
  return current;
}

export async function login(request, response) {
  const attempts = getAttemptState(request.ip);
  if (attempts.count >= MAX_ATTEMPTS) {
    response.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    return;
  }
  const user = await authenticateUser(request.body?.username, request.body?.password);
  if (!user) {
    attempts.count += 1;
    response.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  attemptsByIp.delete(request.ip);
  response.cookie(SESSION_COOKIE_NAME, await createSession(user.id), sessionCookieOptions());
  response.json({ user: { username: user.username, role: user.role }, expiresInMs: getSessionTtlMs() });
}

export async function logout(request, response) {
  await revokeSession(request.sessionToken);
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  response.status(204).end();
}

export function getSession(request, response) {
  response.json({ user: request.user, expiresInMs: getSessionTtlMs() });
}
