import { neon } from '@neondatabase/serverless';

let sqlClient;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to use the database.');
  }
  if (!connectionString.startsWith('postgresql://') && !connectionString.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
  }
  sqlClient ??= neon(connectionString);
  return sqlClient;
}

export async function verifyDatabaseConnection() {
  const sql = getDatabase();
  const [result] = await sql`SELECT current_database() AS database_name`;
  return result.database_name;
}
