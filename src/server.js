import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyDatabaseConnection } from './database/client.js';
import { runMigrations } from './database/migrations.js';
import { invalidJsonHandler, unhandledErrorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/require-auth.js';
import { authRouter } from './routes/auth-routes.js';
import { apiRouter } from './routes/api-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST?.trim() || '127.0.0.1';
const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '512kb' }));
app.get('/health', (request, response) => response.json({ status: 'ok', database: 'configured' }));
app.get('/login', (request, response) => response.sendFile(path.join(__dirname, '..', 'public', 'login.html')));
app.get('/login.js', (request, response) => response.sendFile(path.join(__dirname, '..', 'public', 'login.js')));
app.get('/login.css', (request, response) => response.sendFile(path.join(__dirname, '..', 'public', 'login.css')));
app.get('/styles.css', (request, response) => response.sendFile(path.join(__dirname, '..', 'public', 'styles.css')));
app.get('/favicon.svg', (request, response) => response.sendFile(path.join(__dirname, '..', 'public', 'favicon.svg')));
app.use('/auth', authRouter);
app.use(requireAuth);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules', 'sweetalert2', 'dist')));
app.use('/api', apiRouter);
app.use(invalidJsonHandler);
app.use(unhandledErrorHandler);

async function startServer() {
  const databaseName = await verifyDatabaseConnection();
  await runMigrations();
  console.log(`Neon database connected: ${databaseName}`);

  app.listen(port, host, () => {
    console.log(`Shopify Collection Sorter is running at http://${host}:${port}`);
  });
}

startServer().catch((error) => {
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});
