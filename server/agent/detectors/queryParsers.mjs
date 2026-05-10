// 工具内查询参数解析：天气位置、搜索关键词、日期数学

import { KNOWN_LOCATION_COORDINATES } from '../constants.mjs'
import {
  formatBeijingDateOnly,
  getBeijingDateParts,
  createDateFromBeijingParts,
  normalizeToolText,
  truncateToolText,
} from '../utils.mjs'

const FICTIONAL_WEATHER_LOCATION_PATTERN =
  /旧书店|旧书馆|书店|店里|阁楼|窗外|房间|宿舍|教室|学院|书院|仙门|宗门|魔法学院|城堡|花园|小窝|梦里|文里|故事里|剧情里|场景里/

export function extractWeatherLocation(text) {
  const known = Object.keys(KNOWN_LOCATION_COORDINATES).find((location) => text.includes(location))
  if (known) return known

  const patterns = [
    /(?:查|看看|看下|搜|问问|想知道)?([\p{Script=Han}A-Za-z\s·-]{2,18})(?:今天|明天|后天)?(?:天气|气温|温度|会不会下雨|下雨|下雪)/u,
    /(?:今天|明天|后天)?([\p{Script=Han}A-Za-z\s·-]{2,18})(?:天气|会不会下雨|下雨|下雪|气温|温度)/u,
  ]

  for (const pattern of patterns) {
    const location = cleanLocation(text.match(pattern)?.[1])
    if (location) return location
  }

  return ''
}

export function cleanLocation(value) {
  const cleaned = String(value || '')
    .replace(/姐姐|妹妹|帮我|麻烦|请|查查|看看|看下|问问|想知道|今天|明天|后天|现在|一下|会不会/g, '')
    .trim()
  if (cleaned.length < 2 || cleaned.length > 18) return ''
  if (/天气|下雨|下雪|气温|温度/.test(cleaned)) return ''
  if (isFictionalWeatherLocation(cleaned)) return ''
  return cleaned
}

export function isFictionalWeatherLocation(value) {
  return FICTIONAL_WEATHER_LOCATION_PATTERN.test(String(value || '').trim())
}

export function extractWeatherDayOffset(text) {
  if (text.includes('后天')) return 2
  if (text.includes('明天')) return 1
  return 0
}

export function extractSearchQuery(text) {
  const withoutUrls = normalizeToolText(text).replace(/https?:\/\/[^\s，。！？!?]+/gi, ' ')
  const freshnessPrefix = /最新|新闻|热搜|近况|今天|近期|最近/.test(withoutUrls) ? '最新 ' : ''
  const cleaned = withoutUrls
    .replace(/^(姐姐|妹妹|请|麻烦|能不能|可以|帮我|帮忙|给我|想知道|我想知道|查一下|查查|搜索|搜一下|搜搜|联网查|网上查)/g, ' ')
    .replace(/(姐姐|妹妹|请|麻烦|能不能|可不可以|可以吗|帮我|帮忙|给我|一下|一下子|呀|吧|呢|哦|哈|qaq|QAQ|嘻嘻)/g, ' ')
    .replace(/(搜索|搜搜|搜一下|查一下|查查|查找|帮我查|帮我搜|联网|网上|资料|百科|新闻|热搜|近况|榜单|价格|评测|推荐|是什么|有哪些|谁是|哪里买|怎么买)/g, ' ')
    .replace(/[，。！？!?；;：:、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const query = `${freshnessPrefix}${cleaned}`.trim()
  if (query.length < 2) return ''
  return truncateToolText(query, 120)
}

export function buildSearchEngineQuery(query) {
  return normalizeToolText(query)
    .replace(/官方文档/g, 'official documentation')
    .replace(/官方教程/g, 'official guide')
    .replace(/官网/g, 'official site')
    .replace(/官方/g, 'official')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseDateMathRequest(text) {
  const today = getBeijingStartOfDay(new Date())
  const relativeMatch = text.match(/(\d{1,4})\s*(天|日|周|星期|个月|月|年)\s*(后|前)/)
  if (relativeMatch) {
    const amount = Number(relativeMatch[1])
    const unit = relativeMatch[2]
    const direction = relativeMatch[3] === '前' ? -1 : 1
    const target = addBeijingDateUnits(today, amount * direction, unit)
    const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
    return {
      today,
      label: relativeMatch[0],
      result: `${formatBeijingDateOnly(target)}，距离今天 ${formatDayDistance(diffDays)}。`,
    }
  }

  const targetMatch =
    text.match(/(?:到|距离)\s*(今年|明年)?\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*[日号]?(?:还有)?(?:多少|几)天/) ||
    text.match(/(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*[日号]?.*?(?:倒计时|还有(?:多少|几)天)/)
  if (!targetMatch) return null

  const explicitYearWord = targetMatch.length === 4 ? targetMatch[1] : ''
  const month = Number(targetMatch.length === 4 ? targetMatch[2] : targetMatch[1])
  const day = Number(targetMatch.length === 4 ? targetMatch[3] : targetMatch[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const todayParts = getBeijingDateParts(today)
  let year = explicitYearWord === '明年' ? todayParts.year + 1 : todayParts.year
  let target = createDateFromBeijingParts(year, month, day, 0, 0)
  if (!explicitYearWord && target.getTime() < today.getTime()) {
    year += 1
    target = createDateFromBeijingParts(year, month, day, 0, 0)
  }

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  return {
    today,
    label: `到 ${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 还有几天`,
    result: `${formatBeijingDateOnly(target)}，距离今天 ${formatDayDistance(diffDays)}。`,
  }
}

export function getBeijingStartOfDay(date) {
  const parts = getBeijingDateParts(date)
  return createDateFromBeijingParts(parts.year, parts.month, parts.day, 0, 0)
}

export function addBeijingDateUnits(date, amount, unit) {
  const parts = getBeijingDateParts(date)
  const target = createDateFromBeijingParts(parts.year, parts.month, parts.day, 0, 0)

  if (unit === '周' || unit === '星期') {
    target.setUTCDate(target.getUTCDate() + amount * 7)
  } else if (unit === '个月' || unit === '月') {
    target.setUTCMonth(target.getUTCMonth() + amount)
  } else if (unit === '年') {
    target.setUTCFullYear(target.getUTCFullYear() + amount)
  } else {
    target.setUTCDate(target.getUTCDate() + amount)
  }

  return target
}

export function formatDayDistance(diffDays) {
  if (diffDays === 0) return '就是今天'
  if (diffDays > 0) return `还有 ${diffDays} 天`
  return `已经过去 ${Math.abs(diffDays)} 天`
}
