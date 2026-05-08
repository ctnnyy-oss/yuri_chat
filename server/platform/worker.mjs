// 后台 worker：调度 + 4 类任务执行器（generic / web_fetch / file_scan / connector_check）

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { stripHtml } from '../shared/utils.mjs'
import { WORKER_INTERVAL_MS, WEB_FETCH_TIMEOUT_MS } from './db.mjs'
import {
  readNextQueuedTask,
  readPlatformTask,
  markTaskRunning,
  applyTaskOutcome,
  extractFirstUrl,
} from './tasks.mjs'
import { listPlatformConnectors, createPlatformNotification } from './connectors.mjs'

let workerTimer
let workerBusy = false

export function startPlatformWorker() {
  if (workerTimer) return
  workerTimer = setInterval(() => {
    void processNextPlatformTask()
  }, WORKER_INTERVAL_MS)
  void processNextPlatformTask()
}

export function isWorkerRunning() {
  return Boolean(workerTimer)
}

export function getWorkerIntervalMs() {
  return WORKER_INTERVAL_MS
}

export async function processNextPlatformTask() {
  if (workerBusy) return
  workerBusy = true

  try {
    const task = readNextQueuedTask()
    if (!task) return

    markTaskRunning(task)
    const runningTask = readPlatformTask(task.id)
    const outcome = await runPlatformTask(runningTask)
    const result = applyTaskOutcome(runningTask, outcome)

    createPlatformNotification({
      title: result.statusLabel,
      body: `${runningTask.title}：${outcome.result || outcome.error || '已有新状态。'}`.slice(0, 220),
      kind: result.status === 'completed' ? 'task_completed' : 'task_blocked',
      taskId: runningTask.id,
    })
  } catch (error) {
    console.error(error)
  } finally {
    workerBusy = false
  }
}

// ============ 任务执行器 ============

async function runPlatformTask(task) {
  if (task.kind === 'web_fetch') return runWebFetchTask(task)
  if (task.kind === 'file_scan') return runFileScanTask()
  if (task.kind === 'connector_check') return runConnectorCheckTask()
  return runGenericTask(task)
}

async function runWebFetchTask(task) {
  const url = extractFirstUrl(`${task.title}\n${task.detail}`)
  if (!url) {
    return {
      status: 'blocked',
      error: '缺少可读取的公开 URL。',
      result: '任务已保留在后台，需要补充链接后继续。',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEB_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'YuriChatAgent/0.1' },
      signal: controller.signal,
    })
    const text = await response.text()
    const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim()
    const preview = stripHtml(text).slice(0, 360)
    return {
      result: [`读取 ${url}`, title ? `标题：${title}` : '', preview ? `摘录：${preview}` : '页面没有可读文本摘录。']
        .filter(Boolean)
        .join('\n'),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function runFileScanTask() {
  const root = resolve(process.cwd())
  const files = scanWorkspaceFiles(root)
  const extensionCounts = new Map()
  for (const file of files) {
    const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || 'no-ext' : 'no-ext'
    extensionCounts.set(ext, (extensionCounts.get(ext) || 0) + 1)
  }

  const topExtensions = Array.from(extensionCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([ext, count]) => `${ext}:${count}`)
    .join(' / ')

  return {
    result: `扫描 ${files.length} 个工作区文件。主要类型：${topExtensions || '暂无'}。`,
  }
}

function runConnectorCheckTask() {
  const connectors = listPlatformConnectors()
  const connected = connectors.filter((connector) => connector.connected)
  return {
    result:
      connected.length > 0
        ? `已连接：${connected.map((connector) => connector.label).join(' / ')}。`
        : '当前没有可用账号连接；可先用服务器环境变量或手动状态登记接入。',
  }
}

function runGenericTask(task) {
  return {
    result: `已记录并完成后台整理切片：${task.detail || task.title}`.slice(0, 420),
  }
}

// ============ 文件扫描辅助 ============

function scanWorkspaceFiles(root) {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'data', 'secrets', '.playwright-cli'])
  const files = []

  function visit(directory) {
    if (files.length >= 2_000) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue
      const fullPath = join(directory, entry.name)
      if (!isInsideRoot(root, fullPath)) continue
      if (entry.isDirectory()) {
        visit(fullPath)
      } else if (entry.isFile()) {
        const stats = statSync(fullPath)
        files.push({
          name: entry.name,
          path: relative(root, fullPath),
          size: stats.size,
        })
      }
    }
  }

  if (existsSync(root)) visit(root)
  return files
}

function isInsideRoot(root, target) {
  const relativePath = relative(root, resolve(target))
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.includes(`..${sep}`))
}
