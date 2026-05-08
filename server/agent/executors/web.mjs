// 联网类工具：搜索、深度研究、网页摘录

import { WEB_FETCH_TIMEOUT_MS, MAX_WEB_TEXT_LENGTH } from '../constants.mjs'
import {
  createAgentId,
  formatBeijingDateTime,
  isSafeHttpUrl,
  extractUrls,
  parseHtmlPage,
  truncateToolText,
  fetchTextWithTimeout,
} from '../utils.mjs'
import { fetchWebSearchResults, refineSearchResultsForIntent } from '../searchEngines.mjs'
import { extractSearchQuery, buildSearchEngineQuery } from '../actionDetectors.mjs'

const PAGE_FETCH_HEADERS = {
  'User-Agent': 'YuriChatAgent/0.1 (+https://ctnnyy-oss.github.io/yuri-chat/)',
  Accept: 'text/html,text/plain,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.5',
}

export async function createWebSearchToolResult(text) {
  const query = extractSearchQuery(text)
  const engineQuery = buildSearchEngineQuery(query)

  if (!query) {
    return {
      id: createAgentId('tool'),
      name: 'web_search',
      status: 'needs_input',
      title: 'Agent 工具：联网搜索需要关键词',
      content: [
        '工具 web_search 已识别到搜索/最新/资料意图，但没有提取到明确关键词。',
        '请先问用户要查什么；不要编造搜索结果。',
      ].join('\n'),
      summary: '缺少搜索关键词。',
      createdAt: new Date().toISOString(),
    }
  }

  try {
    const rawResults = await fetchWebSearchResults(engineQuery)
    const results = refineSearchResultsForIntent(query, rawResults)

    if (results.length === 0) {
      return {
        id: createAgentId('tool'),
        name: 'web_search',
        status: 'error',
        title: 'Agent 工具：联网搜索无结果',
        content: [
          '工具 web_search 已执行，但没有拿到可用结果。',
          `关键词：${query}`,
          '请如实告诉用户这次没有查到可靠结果，可以换关键词或提供具体链接；不要编造新闻、价格或来源。',
        ].join('\n'),
        summary: `没有查到：${query}`,
        createdAt: new Date().toISOString(),
      }
    }

    return {
      id: createAgentId('tool'),
      name: 'web_search',
      status: 'success',
      title: 'Agent 工具：联网搜索',
      content: [
        '工具 web_search 已执行。',
        `关键词：${query}`,
        engineQuery !== query ? `实际检索：${engineQuery}` : '',
        `搜索时间：${formatBeijingDateTime(new Date())}`,
        '搜索结果：',
        ...results.map((result, index) =>
          [
            `${index + 1}. ${result.title}`,
            result.url ? `   URL：${result.url}` : '',
            result.snippet ? `   摘要：${result.snippet}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
        '回答时必须基于这些搜索结果并承认搜索范围有限；涉及最新、价格、新闻、医疗、法律或金融时，不要把搜索摘要说成最终权威结论。',
      ].filter(Boolean).join('\n'),
      summary: `${query}：${results
        .slice(0, 3)
        .map((result) => result.title)
        .join(' / ')}`,
      createdAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      id: createAgentId('tool'),
      name: 'web_search',
      status: 'error',
      title: 'Agent 工具：联网搜索失败',
      content: [
        `工具 web_search 查询「${query}」失败。`,
        `错误：${error instanceof Error ? error.message : '未知错误'}`,
        '请向用户说明暂时没有搜到，不要补写猜测结果。',
      ].join('\n'),
      summary: '联网搜索失败。',
      createdAt: new Date().toISOString(),
    }
  }
}

export async function createWebResearchToolResult(text) {
  const query = extractSearchQuery(text)
  const engineQuery = buildSearchEngineQuery(query)

  if (!query) {
    return {
      id: createAgentId('tool'),
      name: 'web_research',
      status: 'needs_input',
      title: 'Agent 工具：深度研究需要主题',
      content: [
        '工具 web_research 已识别到研究/对比/资料整理意图，但没有提取到明确主题。',
        '请先问用户要研究什么；不要编造资料、来源或结论。',
      ].join('\n'),
      summary: '缺少研究主题。',
      createdAt: new Date().toISOString(),
    }
  }

  try {
    const rawResults = await fetchWebSearchResults(engineQuery)
    const results = refineSearchResultsForIntent(query, rawResults)
    if (results.length === 0) {
      return {
        id: createAgentId('tool'),
        name: 'web_research',
        status: 'error',
        title: 'Agent 工具：深度研究无结果',
        content: [
          '工具 web_research 已搜索，但没有拿到可用结果。',
          `主题：${query}`,
          '请如实告诉用户这次没有查到可靠资料，可以换关键词或提供具体链接；不要编造来源。',
        ].join('\n'),
        summary: `没有查到：${query}`,
        createdAt: new Date().toISOString(),
      }
    }

    const pageExcerpts = await fetchResearchPageExcerpts(results.slice(0, 3))
    const successfulPages = pageExcerpts.filter((page) => page.status === 'success')

    return {
      id: createAgentId('tool'),
      name: 'web_research',
      status: successfulPages.length > 0 ? 'success' : 'error',
      title: 'Agent 工具：多步资料研究',
      content: [
        '工具 web_research 已执行：先搜索，再读取前几个公开结果的网页摘录。',
        `主题：${query}`,
        engineQuery !== query ? `实际检索：${engineQuery}` : '',
        `研究时间：${formatBeijingDateTime(new Date())}`,
        '搜索候选：',
        ...results.slice(0, 5).map((result, index) =>
          [
            `${index + 1}. ${result.title}`,
            result.url ? `   URL：${result.url}` : '',
            result.snippet ? `   摘要：${result.snippet}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
        '网页摘录：',
        ...pageExcerpts.map((page, index) =>
          [
            `${index + 1}. ${page.title || page.url}`,
            `   URL：${page.url}`,
            page.status === 'success'
              ? `   摘录：${truncateToolText(page.text, 900)}`
              : `   读取失败：${page.error || '未知错误'}`,
          ].join('\n'),
        ),
        '回答时必须区分“搜索候选”和“已读取摘录”；只能把摘录当作证据，不要声称读完未摘录的全文。',
      ]
        .filter(Boolean)
        .join('\n'),
      summary:
        successfulPages.length > 0
          ? `${query}：已读取 ${successfulPages.length} 个网页摘录`
          : `${query}：搜索到结果，但网页摘录读取失败`,
      createdAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      id: createAgentId('tool'),
      name: 'web_research',
      status: 'error',
      title: 'Agent 工具：深度研究失败',
      content: [
        `工具 web_research 查询「${query}」失败。`,
        `错误：${error instanceof Error ? error.message : '未知错误'}`,
        '请向用户说明暂时没有研究成功，不要补写猜测结果。',
      ].join('\n'),
      summary: '深度研究失败。',
      createdAt: new Date().toISOString(),
    }
  }
}

export async function createWebPageToolResults(text) {
  const urls = extractUrls(text).slice(0, 2)
  const results = []

  for (const url of urls) {
    results.push(await createWebPageToolResult(url))
  }

  return results
}

export async function createWebPageToolResult(url) {
  if (!isSafeHttpUrl(url)) {
    return {
      id: createAgentId('tool'),
      name: 'web_page',
      status: 'error',
      title: 'Agent 工具：网页读取被拦截',
      content: `工具 web_page 拒绝读取这个地址：${url}\n原因：只允许公开 http/https 网页，不读取本机、局域网或非网页协议。`,
      summary: '网页地址不在安全范围。',
      createdAt: new Date().toISOString(),
    }
  }

  try {
    const rawText = await fetchTextWithTimeout(url, WEB_FETCH_TIMEOUT_MS, PAGE_FETCH_HEADERS)
    const page = parseHtmlPage(rawText)

    return {
      id: createAgentId('tool'),
      name: 'web_page',
      status: 'success',
      title: 'Agent 工具：网页摘录',
      content: [
        '工具 web_page 已执行。',
        `URL：${url}`,
        `标题：${page.title || '未识别标题'}`,
        '网页摘录：',
        truncateToolText(page.text, MAX_WEB_TEXT_LENGTH),
        '回答时只能基于摘录内容，不要声称已经读完未摘录的全文。',
      ].join('\n'),
      summary: page.title || url,
      createdAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      id: createAgentId('tool'),
      name: 'web_page',
      status: 'error',
      title: 'Agent 工具：网页读取失败',
      content: [
        `工具 web_page 读取失败：${url}`,
        `错误：${error instanceof Error ? error.message : '未知错误'}`,
        '请向用户说明暂时无法读取这个网页，不要编造网页内容。',
      ].join('\n'),
      summary: '网页读取失败。',
      createdAt: new Date().toISOString(),
    }
  }
}

export async function fetchResearchPageExcerpts(results) {
  const excerpts = []
  for (const result of results) {
    excerpts.push(await fetchPublicPageExcerpt(result.url, result.title))
  }
  return excerpts
}

export async function fetchPublicPageExcerpt(url, fallbackTitle = '') {
  if (!isSafeHttpUrl(url)) {
    return {
      status: 'error',
      url,
      title: fallbackTitle,
      text: '',
      error: '网页地址不在安全范围',
    }
  }

  try {
    const rawText = await fetchTextWithTimeout(url, WEB_FETCH_TIMEOUT_MS, PAGE_FETCH_HEADERS)
    const page = parseHtmlPage(rawText)

    return {
      status: 'success',
      url,
      title: page.title || fallbackTitle,
      text: page.text,
      error: '',
    }
  } catch (error) {
    return {
      status: 'error',
      url,
      title: fallbackTitle,
      text: '',
      error: error instanceof Error ? error.message : '未知错误',
    }
  }
}
