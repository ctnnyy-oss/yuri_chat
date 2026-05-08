// 后台平台 SQLite 数据库初始化和共享工具

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readEnv } from '../env.mjs'

let platformDatabase

export function getPlatformDatabase() {
  if (platformDatabase) return platformDatabase

  const databasePath = resolve(readEnv('YURI_CHAT_DB_PATH') || './data/yuri-chat.sqlite')
  mkdirSync(dirname(databasePath), { recursive: true })
  platformDatabase = new DatabaseSync(databasePath)
  platformDatabase.exec(`
    CREATE TABLE IF NOT EXISTS platform_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      result TEXT,
      error TEXT,
      logs TEXT NOT NULL,
      steps TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      task_id TEXT,
      created_at TEXT NOT NULL,
      seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS platform_connectors (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      mode TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT NOT NULL
    );
  `)
  return platformDatabase
}

// 任务/通知/连接器共享的常量
export const TASK_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'blocked', 'cancelled'])
export const TASK_PRIORITIES = new Set(['low', 'medium', 'high'])
export const TASK_KINDS = new Set(['generic', 'web_fetch', 'file_scan', 'connector_check'])
export const WORKER_INTERVAL_MS = 5_000
export const MAX_TASK_LOGS = 24
export const MAX_TASK_STEPS = 8
export const WEB_FETCH_TIMEOUT_MS = 10_000
