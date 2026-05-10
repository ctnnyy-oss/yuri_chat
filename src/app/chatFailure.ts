export function formatChatFailure(error: unknown): string {
  const rawMessage = error instanceof Error && error.message ? error.message : '模型代理刚才没有接通。'
  const message = rawMessage.replace(/\s+/g, ' ').trim()

  if (/401|授权|登录|口令|token/i.test(message)) {
    return `需要授权：请重新登录，或检查模型中转站的 API Key。${message}`
  }
  if (/400|参数|格式|invalid|bad request/i.test(message)) {
    return `请求格式有问题：模型名、接口格式或上下文可能不被上游接受。${message}`
  }
  if (/402|403|余额|额度|quota|billing|forbidden/i.test(message)) {
    return `额度或权限不足：请检查中转站余额、套餐额度或模型权限。${message}`
  }
  if (/429|频率|rate limit|too many/i.test(message)) {
    return `请求太频繁：上游限流了，稍等一下再试。${message}`
  }
  if (/502|503|504|上游|供应商|gateway|unavailable|timeout/i.test(message)) {
    return `模型上游暂时没接住：通常是中转站或模型供应商临时波动。${message}`
  }
  if (/500|服务异常|server/i.test(message)) {
    return `模型服务临时异常：这更像后端或上游服务报错。${message}`
  }
  return `模型代理刚才没有接通：${message}`
}
