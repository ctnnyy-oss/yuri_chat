import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const watchRoots = ['src', 'server', 'scripts']
const ignoredDirs = new Set(['.git', 'dist', 'node_modules', '.playwright-cli'])
const codeExtensions = new Set(['.ts', '.tsx', '.mjs'])
const styleExtensions = new Set(['.css'])
const codeRecommendedLineLimit = 500
const styleRecommendedLineLimit = 900
const hardLineLimit = 999

const files = watchRoots.flatMap((dir) => collectFiles(join(root, dir)))
const inspected = files
  .map((filePath) => ({ filePath, lineCount: countLines(filePath), policy: getLinePolicy(filePath) }))
  .filter((item) => item.policy)
const hardOversized = inspected
  .filter((item) => item.lineCount > item.policy.hard)
  .sort((a, b) => b.lineCount - a.lineCount)
const recommendedWatchlist = inspected
  .filter((item) => item.lineCount > item.policy.recommended && item.lineCount <= item.policy.hard)
  .sort((a, b) => b.lineCount - a.lineCount)

if (hardOversized.length === 0 && recommendedWatchlist.length === 0) {
  console.log('Architecture audit: all watched files are inside the recommended comfort zone.')
}

if (hardOversized.length > 0) {
  console.log('Architecture audit: hard ceiling watchlist')
  for (const item of hardOversized) printWatchItem(item)
}

if (recommendedWatchlist.length > 0) {
  console.log('Architecture audit: recommended refactor watchlist')
  for (const item of recommendedWatchlist) printWatchItem(item)
}

console.log(`Scanned ${files.length} source files. This command is advisory and does not fail the build.`)

function printWatchItem(item) {
  const pathLabel = relative(root, item.filePath).replaceAll('\\', '/')
  console.log(`- ${pathLabel}: ${item.lineCount} lines (recommended ${item.policy.recommended}; hard ceiling ${item.policy.hard})`)
}

function collectFiles(dir) {
  if (!existsAsDirectory(dir)) return []

  return readdirSync(dir).flatMap((name) => {
    const filePath = join(dir, name)
    const stats = statSync(filePath)
    if (stats.isDirectory()) {
      return ignoredDirs.has(name) ? [] : collectFiles(filePath)
    }
    return shouldWatch(filePath) ? [filePath] : []
  })
}

function existsAsDirectory(dir) {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function shouldWatch(filePath) {
  return Boolean(getLinePolicy(filePath))
}

function getLinePolicy(filePath) {
  const extension = filePath.slice(filePath.lastIndexOf('.'))
  if (codeExtensions.has(extension)) return { recommended: codeRecommendedLineLimit, hard: hardLineLimit }
  if (styleExtensions.has(extension)) return { recommended: styleRecommendedLineLimit, hard: hardLineLimit }
  return null
}

function countLines(filePath) {
  const content = readFileSync(filePath, 'utf8')
  return content.length === 0 ? 0 : content.split(/\r?\n/).length
}
