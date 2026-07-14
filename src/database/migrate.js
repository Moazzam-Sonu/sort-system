import 'dotenv/config';

import { runMigrations } from './migrations.js';
import { verifyDatabaseConnection } from './client.js';

const databaseName = await verifyDatabaseConnection();
await runMigrations();
console.log(`Neon migrations completed for database: ${databaseName}`);
