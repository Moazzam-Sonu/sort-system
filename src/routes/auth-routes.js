import { Router } from 'express';

import { getSession, login, logout } from '../controllers/auth-controller.js';
import { requireAuth } from '../middleware/require-auth.js';

export const authRouter = Router();

authRouter.post('/login', login);
authRouter.post('/logout', requireAuth, logout);
authRouter.get('/session', requireAuth, getSession);
