import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { invalidJsonHandler, unhandledErrorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/api-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules', 'sweetalert2', 'dist')));
app.use('/api', apiRouter);
app.use(invalidJsonHandler);
app.use(unhandledErrorHandler);

app.listen(port, () => {
  console.log(`Shopify Collection Sorter is running at http://localhost:${port}`);
});
