// 搜索引擎适配器：Yahoo、Bing、DuckDuckGo、360搜索的 HTML 抓取和解析

import { SEARCH_TIMEOUT_MS, MAX_SEARCH_RESULTS, MAX_SEARCH_SNIPPET_LENGTH } from './constants.mjs'
import {
  fetchTextWithTimeout,
  fetchJsonWithTimeout,
  cleanSearchHtml,
  normalizeSearchUrl,
  decodeYahooRedirectUrl,
  decodeBingRedirectUrl,
  dedupeSearchResults,
  normalizeToolText,
  truncateToolText,
  decodeHtmlEntity,
} from './utils.mjs'

export function inferPreferredSourceDomains(query) {
  if (!/官方|官网|文档|教程|official|documentation|docs/i.test(query)) return []
  if (/openai|gpt|chatgpt/i.test(query)) return ['openai.com', 'openai.github.io']
  if (/claude|anthropic/i.test(query)) return ['anthropic.com']
  if (/gemini|google/i.test(query)) return ['google.com', 'ai.google.dev', 'cloud.google.com']
  if (/sillytavern|酒馆|小手机酒馆/i.test(query)) return ['sillytavern.app', 'docs.sillytavern.app', 'github.com']
  return []
}

export function refineSearchResultsForIntent(query, results) {
  const preferredDomains = inferPreferredSourceDomains(query)
  if (preferredDomains.length === 0) return results

  const preferredResults = results.filter((result) => {
    try {
      const hostname = new URL(result.url).hostname.toLowerCase()
      return preferredDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    } catch {
      return false
    }
  })

  return preferredResults.length > 0 ? preferredResults : []
}

export async function fetchWebSearchResults(query) {
  let yahooResults = []
  try {
    yahooResults = await fetchYahooHtmlResults(query)
  } catch (_error) {
    yahooResults = []
  }
  if (yahooResults.length > 0) return yahooResults.slice(0, MAX_SEARCH_RESULTS)

  if (/\p{Script=Han}/u.test(query)) {
    let soResults = []
    try {
      soResults = await fetchSoHtmlResults(query)
    } catch (_error) {
      soResults = []
    }
    if (soResults.length > 0) return soResults.slice(0, MAX_SEARCH_RESULTS)
  }

  let bingResults = []
  try {
    bingResults = await fetchBingHtmlResults(query)
  } catch (_error) {
    bingResults = []
  }
  if (bingResults.length > 0) return bingResults.slice(0, MAX_SEARCH_RESULTS)

  let htmlResults = []
  try {
    htmlResults = await fetchDuckDuckGoHtmlResults(query)
  } catch (_error) {
    htmlResults = []
  }
  if (htmlResults.length > 0) return htmlResults.slice(0, MAX_SEARCH_RESULTS)

  const instantResults = await fetchDuckDuckGoInstantResults(query)
  return instantResults.slice(0, MAX_SEARCH_RESULTS)
}

async function fetchYahooHtmlResults(query) {
  const url = new URL('https://search.yahoo.com/search')
  url.searchParams.set('p', query)

  const html = await fetchTextWithTimeout(url, SEARCH_TIMEOUT_MS, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 YuriChatAgent/0.1',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.5',
  })

  return parseYahooHtmlResults(html)
}

async function fetchSoHtmlResults(query) {
  const url = new URL('https://www.so.com/s')
  url.searchParams.set('q', query)

  const html = await fetchTextWithTimeout(url, SEARCH_TIMEOUT_MS, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 YuriChatAgent/0.1',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.5',
  })

  return parseSoHtmlResults(html)
}

async function fetchBingHtmlResults(query) {
  const hasChineseQuery = /\p{Script=Han}/u.test(query)
  const url = new URL(hasChineseQuery ? 'https://cn.bing.com/search' : 'https://www.bing.com/search')
  url.searchParams.set('q', query)
  if (hasChineseQuery) {
    url.searchParams.set('ensearch', '0')
  } else {
    url.searchParams.set('setlang', 'en-US')
  }

  const html = await fetchTextWithTimeout(url, SEARCH_TIMEOUT_MS, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 YuriChatAgent/0.1',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.5',
  })

  return parseBingHtmlResults(html)
}

async function fetchDuckDuckGoHtmlResults(query) {
  const url = new URL('https://html.duckduckgo.com/html/')
  url.searchParams.set('q', query)

  const html = await fetchTextWithTimeout(url, SEARCH_TIMEOUT_MS, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 YuriChatAgent/0.1',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.5',
  })

  return parseDuckDuckGoHtmlResults(html)
}

async function fetchDuckDuckGoInstantResults(query) {
  const url = new URL('https://api.duckduckgo.com/')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('no_redirect', '1')
  url.searchParams.set('no_html', '1')
  url.searchParams.set('skip_disambig', '1')

  const data = await fetchJsonWithTimeout(url, SEARCH_TIMEOUT_MS)
  const results = []

  if (data?.AbstractText && data?.AbstractURL) {
    results.push({
      title: truncateToolText(data.Heading || data.AbstractSource || '摘要', 120),
      url: normalizeSearchUrl(data.AbstractURL),
      snippet: truncateToolText(data.AbstractText, MAX_SEARCH_SNIPPET_LENGTH),
    })
  }

  if (Array.isArray(data?.RelatedTopics)) {
    collectInstantRelatedTopics(data.RelatedTopics, results)
  }

  return dedupeSearchResults(results)
}

function collectInstantRelatedTopics(topics, results) {
  for (const topic of topics) {
    if (results.length >= MAX_SEARCH_RESULTS) break
    if (topic?.FirstURL && topic?.Text) {
      results.push({
        title: truncateToolText(topic.Text.split(' - ')[0] || topic.Text, 120),
        url: normalizeSearchUrl(topic.FirstURL),
        snippet: truncateToolText(topic.Text, MAX_SEARCH_SNIPPET_LENGTH),
      })
    }
    if (Array.isArray(topic?.Topics)) {
      collectInstantRelatedTopics(topic.Topics, results)
    }
  }
}

function parseDuckDuckGoHtmlResults(html) {
  const results = []
  const blockPattern = /<div[^>]+class=["'][^"']*result__body[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
  let blockMatch

  while ((blockMatch = blockPattern.exec(html)) && results.length < MAX_SEARCH_RESULTS * 2) {
    const block = blockMatch[1]
    const anchorMatch = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
    const title = cleanSearchHtml(anchorMatch?.[2] || '')
    const rawUrl = decodeURIComponent(anchorMatch?.[1] || '').replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '').split('&')[0]
    const url = normalizeSearchUrl(rawUrl)
    if (!title || !url) continue

    const snippet = cleanSearchHtml(block.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || '')
    results.push({
      title: truncateToolText(title, 120),
      url,
      snippet: truncateToolText(snippet, MAX_SEARCH_SNIPPET_LENGTH),
    })
  }

  return dedupeSearchResults(results)
}

function parseYahooHtmlResults(html) {
  const results = []
  const blockPattern = /<li[^>]*>[\s\S]*?<div[^>]+class=["'][^"']*(?:algo|dd algo)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/li>/gi
  let blockMatch

  while ((blockMatch = blockPattern.exec(html)) && results.length < MAX_SEARCH_RESULTS * 2) {
    const block = blockMatch[1]
    const anchorMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
    const title = cleanSearchHtml(anchorMatch?.[2] || '')
    const rawUrl = decodeYahooRedirectUrl(anchorMatch?.[1] || '')
    const url = normalizeSearchUrl(rawUrl)
    if (!title || !url) continue

    const snippet = cleanSearchHtml(
      block.match(/<span[^>]+class=["'][^"']*fc-falcon[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
        block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ||
        '',
    )
    results.push({
      title: truncateToolText(title, 120),
      url,
      snippet: truncateToolText(snippet, MAX_SEARCH_SNIPPET_LENGTH),
    })
  }

  return dedupeSearchResults(results)
}

function parseSoHtmlResults(html) {
  const results = []
  const blockPattern = /<li[^>]+class=["'][^"']*res-list[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
  let blockMatch

  while ((blockMatch = blockPattern.exec(html)) && results.length < MAX_SEARCH_RESULTS * 2) {
    const block = blockMatch[1]
    const anchorMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]+(data-mdurl=["'][^"']+["']|href=["'][^"']+["'])[^>]*>([\s\S]*?)<\/a>/i)
    const title = cleanSearchHtml(anchorMatch?.[2] || '')
    const attrs = normalizeToolText(anchorMatch?.[0] || '')
    const rawUrl = attrs.match(/data-mdurl=["']([^"']+)["']/i)?.[1] || attrs.match(/href=["']([^"']+)["']/i)?.[1] || ''
    const url = normalizeSearchUrl(rawUrl)
    if (!title || !url) continue

    const snippet = cleanSearchHtml(block.match(/<p[^>]+class=["'][^"']*res-desc[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '')
    results.push({
      title: truncateToolText(title, 120),
      url,
      snippet: truncateToolText(snippet, MAX_SEARCH_SNIPPET_LENGTH),
    })
  }

  return dedupeSearchResults(results)
}

function parseBingHtmlResults(html) {
  const results = []
  const blockPattern = /<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
  let blockMatch

  while ((blockMatch = blockPattern.exec(html)) && results.length < MAX_SEARCH_RESULTS * 2) {
    const block = blockMatch[1]
    const anchorMatch =
      block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
    const title = cleanSearchHtml(anchorMatch?.[2] || '')
    const url = normalizeSearchUrl(anchorMatch?.[1] || '')
    if (!title || !url) continue

    const snippet = cleanSearchHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '')
    results.push({
      title: truncateToolText(title, 120),
      url,
      snippet: truncateToolText(snippet, MAX_SEARCH_SNIPPET_LENGTH),
    })
  }

  return dedupeSearchResults(results)
}
