import { getDatabase } from './client.js';

const migrations = [
  {
    id: '001_initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS sort_jobs (
        id UUID PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('custom', 'native')),
        status TEXT NOT NULL,
        total INTEGER NOT NULL,
        processed INTEGER NOT NULL DEFAULT 0,
        changed INTEGER NOT NULL DEFAULT 0,
        unchanged INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        current_index INTEGER,
        action JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS sort_job_items (
        id BIGSERIAL PRIMARY KEY,
        job_id UUID NOT NULL REFERENCES sort_jobs(id) ON DELETE CASCADE,
        collection_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (job_id, collection_id)
      )`,
      `CREATE TABLE IF NOT EXISTS audit_events (
        id BIGSERIAL PRIMARY KEY,
        actor TEXT,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      'CREATE INDEX IF NOT EXISTS sort_jobs_status_idx ON sort_jobs(status, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS sort_job_items_job_id_idx ON sort_job_items(job_id, position)',
      'CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at DESC)',
    ],
  },
  {
    id: '002_database_auth',
    statements: [
      `CREATE TABLE IF NOT EXISTS app_users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      'CREATE INDEX IF NOT EXISTS auth_sessions_active_idx ON auth_sessions(token_hash, expires_at) WHERE revoked_at IS NULL',
      'CREATE INDEX IF NOT EXISTS app_users_active_idx ON app_users(username) WHERE is_active = TRUE',
    ],
  },
];

export async function runMigrations() {
  const sql = getDatabase();
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  for (const migration of migrations) {
    const applied = await sql`SELECT id FROM schema_migrations WHERE id = ${migration.id}`;
    if (applied.length > 0) continue;
    await sql.transaction(migration.statements.map((statement) => sql.query(statement)));
    await sql`INSERT INTO schema_migrations (id) VALUES (${migration.id})`;
  }
}
