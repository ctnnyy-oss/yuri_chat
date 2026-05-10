import { getCloudDatabase } from './cloudStore.mjs'

export function initializeAccountStore() {
  const database = getCloudDatabase()
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL,
      email TEXT,
      email_key TEXT,
      email_verified_at TEXT,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email_key TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user_id ON email_verification_codes(user_id, expires_at);
  `)
  ensureColumn(database, 'users', 'role', "TEXT NOT NULL DEFAULT 'user'")
  ensureColumn(database, 'users', 'email', 'TEXT')
  ensureColumn(database, 'users', 'email_key', 'TEXT')
  ensureColumn(database, 'users', 'email_verified_at', 'TEXT')
  migrateUsersTableSchema(database)
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_key ON users(email_key) WHERE email_key IS NOT NULL')
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column.name === columnName)) return
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

function migrateUsersTableSchema(database) {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()
  if (!/username_key\s+TEXT\s+NOT NULL\s+UNIQUE/i.test(String(table?.sql || ''))) return

  const legacyAlterTable = Number(database.prepare('PRAGMA legacy_alter_table').get()?.legacy_alter_table ?? 0)
  database.exec('PRAGMA foreign_keys = OFF')
  database.exec('PRAGMA legacy_alter_table = ON')
  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec('ALTER TABLE users RENAME TO users_unique_username_backup')
    database.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_key TEXT NOT NULL,
        email TEXT,
        email_key TEXT,
        email_verified_at TEXT,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    database.exec(`
      INSERT INTO users
        (id, username, username_key, email, email_key, email_verified_at, display_name, password_hash, role, created_at, updated_at)
      SELECT id, username, username_key, email, email_key, email_verified_at, display_name, password_hash, role, created_at, updated_at
      FROM users_unique_username_backup
    `)
    database.exec('DROP TABLE users_unique_username_backup')
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  } finally {
    database.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable ? 'ON' : 'OFF'}`)
    database.exec('PRAGMA foreign_keys = ON')
  }
}
