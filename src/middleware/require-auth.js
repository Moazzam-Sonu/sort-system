import { readSession, SESSION_COOKIE_NAME } from '../auth/session.js';

function readCookie(request, name) {
  const entries = request.headers.cookie?.split(';') ?? [];
  const entry = entries.find((item) => item.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : null;
}

export async function requireAuth(request, response, next) {
  try {
    const sessionToken = readCookie(request, SESSION_COOKIE_NAME);
    const session = await readSession(sessionToken);
    if (session) {
      request.user = session;
      request.sessionToken = sessionToken;
      next();
      return;
    }
    if (request.originalUrl.startsWith('/api/') || request.originalUrl.startsWith('/auth/')) {
      response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
      return;
    }
    response.redirect('/login');
  } catch (error) {
    next(error);
  }
}
