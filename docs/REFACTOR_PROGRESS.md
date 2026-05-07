# 架构重构进度（2026-05-04 ～ 2026-05-05）

> 妹妹让姐姐对项目做"化繁为简的拆分 + 查漏补缺的完善"。本文件记录两天的累计进度，方便下一位姐姐接力。

---

## 总览

| 项目 | 起始 | 现状 | 状态 |
|------|------|------|------|
| `server/agent/utils.mjs` | 587 行 | 68 行 facade | ✅ 完成 |
| `server/agent/toolExecutors.mjs` | 1339 行 | 64 行 facade | ✅ 完成 |
| `server/agent/actionDetectors.mjs` | 1316 行 | 70 行 facade | ✅ 完成 |
| `server/platform.mjs` | 605 行 | 79 行 facade | ✅ 完成 |
| `src/components/ChatPhone.tsx` | 567 行 | 312 行 | ✅ 完成 |
| `src/components/agent/AgentTaskPanel.tsx` | 518 行 | 203 行 | ✅ Codex 收尾完成 |
| `src/domain/types.ts` | 525 行 | 181 行（+ memoryTypes 226 / agentTypes 145） | ✅ 2026-05-07 完成 |
| `src/app/useCloudSync.ts` | 553 行 | 444 行（+ useModelProfiles 149） | ✅ 2026-05-07 完成 |
| `src/app/useYuriNestApp.ts` | 583 行 | 282 行（+ useCharacterCommands 160 / useConversationCommands 196） | ✅ 2026-05-07 完成 |
| `src/components/CharacterRail.tsx` | 566 行 | 566 行 | ⏸ 视觉组件，留下次专项 |
| `src/components/QqFeaturePanel.tsx` | 525 行 | 525 行 | ⏸ 视觉组件，留下次专项 |
| `src/styles/mobile.css` | 2287 行 | 2812 行 | ⏸ 独立任务，CSS 重构风险高 |
| `src/styles/chat.css` | 1698 行 | 1829 行 | ⏸ 独立任务 |
| `src/styles/settings.css` | — | 946 行 | ⏸ 新晋观察项 |

`audit:architecture` 当前 watchlist：5 项（2 代码 + 3 CSS）。代码部分剩 2 个视觉组件等专项再拆。

## 第三阶段（2026-05-05，记忆系统 + Agent 能力升级）

### 8. Agent 决策摘要

- `AgentRunSummary` 新增 `decision`。
- 后端每轮生成：意图、置信度、工作流、风险等级、记忆模式、已选工具、已选动作、下一步。
- 聊天气泡调试模式新增决策卡，比单纯工具列表更容易看懂“为什么这轮这样做”。

### 9. 记忆流水线

- 新增 `src/components/memory/sections/MemoryRecallMap.tsx`。
- 记忆页现在展示捕捉、校准、调用、修剪四段状态：
  - 捕捉：候选记忆数量
  - 校准：来源覆盖率
  - 调用：近 7 天调用日志
  - 修剪：临时/沉睡/归档复查项
- 这块是给人工干预用的总览，不改变底层记忆写入逻辑。

### 10. 记忆引擎增强

- `maybeCaptureMemory` 会先提取真正要记的 payload，再生成标题、正文和标签，避免把整句口头语或吐槽存进去。
- `classifyMemory` 现在识别“我喜欢 / 不喜欢 / 讨厌 / 希望 / 偏好”等偏好表达，但默认进候选，避免误写永久事实。
- `isCoreMemoryAnchor` 把稳定、置顶、高权重高可信、流程规则类记忆作为长期锚点；`getActiveMemories` 会先保留少量锚点，再走普通相关性排序。
- 显式旧事询问会触发“回忆模式”：用最新问题作为检索 query，召回上限 12 → 18，放宽事件/反思/曾调用记忆，并在 prompt 中加入“找不到就诚实说”的回忆上下文。
- `memoryUsageLogs` 保留上限 50 → 500，保留更长调用证据，给后续长期回忆和云端同步使用。
- `formatMemoryForPrompt` 会带上记录/更新/上次调用日期，方便模型区分旧事实、最近修正和阶段事件。
- 记忆守护台会提醒很久没被主动调用的核心记忆，模拟人类记忆里的复习/再巩固过程。
- `memoryUtils` 新增概念线索扩展，让“记忆/回忆/旧事”“架构/模块/重构”“文档/图片/PDF”等同类表达能互相召回。
- `memoryUtils` 新增轻量语义向量评分，用关键词、概念组和中文 2-3 字片段处理“怕以后没人维护”这类换说法的旧事召回。
- 合并重复记忆时会按来源数量提升权重和可信度；评分也会考虑来源数、版本数，模拟重复证据巩固。
- 后台整理会把多条同类记忆提炼成 reflection 候选，模拟把经历抽象成规则的过程。
- 相反偏好会优先进入 value conflict，避免被普通相似重复吞掉；人工修正保留 revision history，保证“当前妹妹”能覆盖旧信息。
- 新增 `npm run test:memory`，当前 10 个旧事召回用例 + 8 维 human-memory proxy gate，旧事召回 90% 以下或代理分 80% 以下失败；当前为 10/10、8/8。
- 继续把目标抬到 90%+：新增时间线定位与情绪显著性，回忆模式排序改为“问题线索优先”，避免稳定规则压住明确询问的旧事件。
- `LongTermMemory` 新增 `emotionalSalience`，用于让焦虑、担心、重要、反复强调的记忆更难沉下去；prompt 里会显示显著性。
- 评分、显著性、时间线线索和复习函数拆到 `src/services/memoryScoring.ts`，避免 `memoryCore.ts` 再次超出架构观察线。
- 反思整理拆到 `src/services/memoryReflection.ts`，候选不再只是归类，会带“可沉淀原则 / 证据 / 时间线 / 仍需确认”。
- 新增 `src/services/memoryVectorIndex.ts`，提供本地稀疏向量近邻候选；明确领域问题会避开向量噪声，模糊旧事才启用。
- 聊天透镜反馈会校准 `memoryStrength` / `emotionalSalience`，冷却、少用、问起再提、归档不再只改提及策略。
- `LongTermMemory` 新增 `semanticSignature` / `semanticSignatureVersion`，记忆创建、加载、合并和版本快照会保留可持久语义签名；向量索引用签名分桶但不硬过滤候选，给后续外部 embedding / ANN 留接口。
- `AppState` 新增 `memoryEmbeddings`，状态版本升到 21；`memoryEmbeddingIndex.ts` 提供本地投影缓存、复用检测和 embedding 召回，迁移、保存、本机备份会自动刷新缓存；回忆模式已接入 embedding 候选和排序加分。
- 显式旧事询问时，`useChat` 会尝试在 3.5 秒内通过后端 embedding 入口生成同模型 query vector 和记忆向量；成功就接入本轮 `buildPromptBundle`，失败/超时自动退回本地索引，不阻塞普通聊天。
- 后端新增 `server/embeddingProvider.mjs` 和 `/api/model/embeddings`，只支持 OpenAI-compatible `/embeddings`，密钥仍走服务器模型保险箱，前端不保存 API Key。
- 记忆页“记忆流水线”新增“索引”状态，显示 embedding 缓存覆盖率；CSS 改为自适应网格，避免 5 个状态块挤坏移动端。
- 评测集加入高权重泛化路线图噪声，确保具体旧事和情绪显著记忆不会被泛化项目记忆压住。
- 新增 `docs/HUMAN_MEMORY_90_TASK.md`，当前 `npm run test:memory` 为 13/13 召回通过，17 维代理门槛 17/17。

### 11. 文档 / 图片能力边界

- 新增 `attachment_guide` 工具，用户问文档、图片、截图、PDF、DOCX 时自动进入能力边界说明。
- 当前版本可以处理粘贴文本、公开网页链接和工作区扫描任务；聊天框图片/拍摄/文件按钮还没接上传、OCR、PDF/DOCX 解析或多模态图片理解，不能假装能看。
- Agent eval 新增“文档和图片能力边界”用例。

### 12. 研究摘记

- 新增 `docs/MEMORY_AGENT_UPGRADE_RESEARCH.md`。
- 记录本轮参考的 LangGraph Memory、MemGPT、Generative Agents、OpenAI Tools/Agents SDK、MCP tools/resources/prompts。
- 结论：记忆系统要分层、可审查、可回滚；Agent 系统要工具契约清楚、调用可见、有护栏、有运行轨迹。

---

## 第一阶段（2026-05-04）

### 1. 修了 5 个潜伏 bug（纯收益）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 1 | `toolExecutors.mjs` | 没 import `geocodeLocation` / `fetchWeatherForecast` / `buildWeatherDaySummary`，调 weather 工具会 ReferenceError | facade 暴露 + executors/realtime.mjs 直接 import |
| 2 | `actionDetectors.mjs` | 没 import `KNOWN_LOCATION_COORDINATES`，`extractWeatherLocation` 第一行就崩 | facade 补 import + detectors/queryParsers.mjs 直接 import |
| 3 | `inferSafetyCategory` | 旧版返回 `'medical'/'legal'/...` string，调用方用 `category.label / category.policy`，safety_guard 工具结果会显示 undefined | helpers/tools.mjs 改为返回 `{ label, policy }` |
| 4 | `inspectTextStats` | 返回字段名（`chars/charsNoSpace/words`）和调用方期望（`totalChars/nonWhitespaceChars/chineseChars/wordTokens/readingMinutes`）完全错位 | helpers/text.mjs 按调用方真实字段名返回 |
| 5 | `parseUnitConversion` | 返回 `{value, from, to}`，调用方用 `fromLabel/toLabel/result/note`，unit_converter 全 undefined | helpers/math.mjs 直接组装好标签和换算结果返回 |

**这 4 个工具（weather / safety_guard / text_inspector / unit_converter）这次才真正能用。**

### 2. 拆 `server/agent/utils.mjs`（587 → 68 行 facade）

```
server/agent/helpers/        # 新增
├── time.mjs        # 北京时间格式化、日期 parts、weekday 标签 (66 行)
├── tools.mjs       # createAgentId / 角色标签 / Meta 工具识别 / inferSafetyCategory (54 行)
├── url.mjs         # URL 安全 / 规范化 / Yahoo & Bing 重定向 (62 行)
├── html.mjs        # HTML 实体解码 / parseHtmlPage / 搜索片段清理 (45 行)
├── text.mjs        # normalizeToolText / truncate / 可检查文本 / inspectTextStats (40 行)
├── math.mjs        # 数学表达式提取/计算 + 单位换算 (150 行)
├── http.mjs        # fetch 超时 + 搜索去重 (50 行)
└── weather.mjs     # geocodeLocation / fetchWeatherForecast / buildWeatherDaySummary / 天气代码标签 (95 行)
```

`utils.mjs` 改为 re-export-only facade，所有旧 import 不需要改。

---

## 第二阶段（2026-05-05）

### 3. 拆 `server/agent/toolExecutors.mjs`（1339 → 64 行 facade）

```
server/agent/executors/      # 新增
├── realtime.mjs    # current_time / date_math / weather (3 工具，140 行)
├── web.mjs         # web_search / web_research / web_page (5 工具，280 行；DRY 掉重复的 fetch+timeout)
├── compute.mjs     # calculator / unit_converter / text_inspector (3 工具，140 行)
├── workspace.mjs   # safety_guard / conversation_snapshot / capability_guide / external_search_boundary (4 工具，90 行)
├── planning.mjs    # task_planner / action_checklist / clarification / agent_continuity / memory_bridge / task_queue / deliverable_contract (7 工具，200 行)
├── governance.mjs  # autonomy_budget / risk_gate / workflow_router / persona_guard / default_policy / continuation_driver / failure_recovery / evidence_audit / tool_governance (9 工具 + 2 helper，260 行)
└── quality.mjs     # answer_composer / response_quality_gate / agent_quality_check / handoff_marker / agent_brief (5 工具，180 行)
```

39 / 39 原 export 全覆盖，smoke test 通过：calculator 实测 `5+3=8`。

### 4. 拆 `server/agent/actionDetectors.mjs`（1316 → 70 行 facade）

```
server/agent/detectors/      # 新增
├── inAppActions.mjs   # 应用内动作识别（character_profile / reminder / task / memory_candidate / moment / room）+ isQuestionLike (430 行)
├── queryParsers.mjs   # 查询参数提取（天气位置 / 搜索 query / 日期数学 / 搜索引擎 query）(140 行)
├── context.mjs        # actionToContextBlock / toolResultToContextBlock / isMemoryLikeContextBlock / 历史轮次查找 (120 行)
├── intent.mjs         # 意图分析、追问、自治预算、人格守护 (220 行)
└── strategy.mjs       # 风控、流程路由、失败恢复、交接、任务队列、交付契约、回复质检 (340 行)
```

> ⚠️ 中途观察到 intent.mjs 单文件还到 574 行（超 watch 线 14%），又拆出 `strategy.mjs`，最终都在线下。

58 / 58 原 export 全覆盖。意图分类 + 风险检查 smoke test 通过。

### 5. 拆 `server/platform.mjs`（605 → 79 行 facade）

```
server/platform/             # 新增
├── db.mjs            # SQLite schema / getPlatformDatabase / 共享常量 (60 行)
├── tasks.mjs         # 任务 CRUD / 输入规范化 / 步骤管理 / extractFirstUrl (210 行)
├── worker.mjs        # worker 循环 / processNext / 4 个 kind 执行器 / 文件扫描 (175 行)
└── connectors.mjs    # 连接器列表 + 执行器元数据 + 通知收件箱 (150 行)
```

facade 包了一层 `createPlatformTask` / `updatePlatformTask`，在写库之后立即调 `processNextPlatformTask`，保留原副作用，同时让 tasks.mjs 不必反向依赖 worker.mjs，避免循环 import。

11 / 11 原 export 全覆盖。

### 6. 拆 `ChatPhone.tsx`（567 → 312 行）

```
src/components/chat/         # 新增
├── data.ts             # emojiRows / stickers / moreTools / chatSettingRows + canDeleteCharacter (60 行)
├── MobileStatusBar.tsx # 状态栏 + GridDots 装饰 (22 行)
├── ChatToolPanels.tsx  # emoji / sticker / more 三个工具面板 (95 行)
└── ChatInfoDrawer.tsx  # info + settings 两个抽屉 (115 行)
```

`ChatPhone.tsx` 主体只剩顶栏 / 消息列表 / 输入框 / 抽屉编排。

### 7. 拆 `AgentTaskPanel.tsx`（518 → 203 行，Codex 收尾）

```
src/components/agent/taskPanel/      # 新增
├── PlatformConsole.tsx   # 后台平台控制台、平台统计 tile、后台任务行 (182 行)
├── TaskCard.tsx          # Agent 任务卡片 + Metric 统计块 (101 行)
└── helpers.ts            # 主动作、优先级、通知权限、连接器和后台任务状态标签 (40 行)
```

`AgentTaskPanel.tsx` 现在只负责：平台状态刷新、通知权限处理、后台自检/重试/取消动作、任务排序和页面编排。

收尾时还补了一个断线：`tasks` 视图原本存在，但 App 没有渲染 `AgentTaskPanel`，打开 `#tasks` 会落到设置页。现在 `App.tsx` 已接回任务页，设置侧栏也新增了“Agent 任务”入口。

---

## 第四阶段（2026-05-07，应用编排层 + 类型层瘦身）

> 妹妹观察到项目又开始变胖（"防止屎山"），让姐姐做架构整理 + 查漏补缺。妹妹特别提醒"过往文档可能过时，姐姐要独立判断"——本轮文档此前确实声称"代码模块全部下榜"，实际跑 audit 已经又有 5 个文件超线。

### 体检结果（不被旧文档绑架，跑出来的真相）

| 检查 | 结果 |
|------|------|
| `npm run lint` | 通过 |
| `npx tsc -b` | 通过 |
| `npm run test:agent` | 17/17 含安全用例全过 |
| `npm run test:memory` | 13/13 召回 + 17/17 human-memory proxy 全过 |
| `npm run audit:architecture` | 5 项超线（5 代码 + 3 CSS） |
| `git status` | 工作树干净 |
| 源码 `TODO/FIXME/HACK/@ts-ignore` 扫描 | 0 个 |
| 生产源码 `console.*` 扫描 | 全是合理日志（启动、错误、测试输出） |
| 5/7 14:39 dev log 里的 React useEffect size 警告 | 后续 commit 已修复，本轮 preview 实测 console 静默 |

### 13. 拆 `src/domain/types.ts`（525 → 181 行）

按域边界切到三个文件，保持外部 import 路径完全不变（types.ts 用 `export *` 桥接两个子文件）：

```
src/domain/
├── types.ts          # 181 行：基础消息/角色/会话 + AppSettings + AppState + 备份 + Prompt
├── memoryTypes.ts    # 226 行：MemoryKind / MemoryStatus / LongTermMemory / Tombstone / Conflict / UsageLog / Event 等
└── agentTypes.ts     # 145 行：AgentReminder / AgentTask / AgentMoment / AgentRoom / AgentToolTrace / AgentDecisionSummary / AgentAction / AgentRunSummary
```

零行为改动；纯类型重组。所有原 `import type { ... } from '../domain/types'` 不需要修改。

### 14. 从 `useCloudSync.ts` 抽出 `useModelProfiles`（553 → 444 行）

`useCloudSync` 内部同时管 SQLite 云快照、备份、模型保险箱三件事。把模型保险箱拆到独立 hook，让 `useCloudSync` 专注云端同步：

```
src/app/
├── useCloudSync.ts       # 444 行：cloud snapshot / cloud backup / autoPush
└── useModelProfiles.ts   # 149 行：list / save / delete / test / fetchCatalog 模型配置 CRUD
```

`useCloudSync` 内部调用 `useModelProfiles` 并把它的 API 透传到 return；`useYuriNestApp` 不需要改任何代码。`useModelProfiles` 用 `getCloudToken: () => string` 闭包接受懒求值的当前 token，避免 stale closure。

注：`useCloudSync` 442 行依然在 500 观察线下，但接近警戒。若以后 cloud sync 再加新能力，应直接拆 `useCloudBackups` 而不是继续叠。

### 15. 从 `useYuriNestApp.ts` 抽出角色 / 会话命令 hook（583 → 282 行）

App 编排层夹了 138 行角色管理逻辑 + 165 行会话管理逻辑。按职责切到两个独立 hook：

```
src/app/
├── useYuriNestApp.ts            # 282 行：状态、子 hook 编排、useEffect、setting handler、return 大对象
├── useCharacterCommands.ts      # 160 行：select / create / update / delete 角色
└── useConversationCommands.ts   # 196 行：clear / delete / deleteGroupChat / restore / deleteTrashed 会话
```

`useConversationCommands` 接受 `handleDeleteCharacter` 作为 dep，因为 `handleDeleteGroupChat` 在非群聊时 fallback 到角色删除——保留原逻辑。两个 hook 共享 `state / setState / setNotice` 入参。

### 验证

```
$ npm run lint                 # 通过
$ npx tsc -b                    # 通过
$ npm run test:agent            # 17/17 含安全用例全过
$ npm run test:memory           # 13/13 召回 + 17/17 human-memory proxy 全过
$ npm run audit:architecture    # 代码超线 5 → 2（剩 CharacterRail + QqFeaturePanel）
$ npm run build                 # 通过；本地构建产物已还原 dist/，未污染 Pages 部署
```

### 本轮主动不做的（独立判断，不是文档驱动）

- `src/components/CharacterRail.tsx`（566 行）和 `src/components/QqFeaturePanel.tsx`（525 行）：视觉组件，拆分需要逐视图视觉回归，留专项做更稳。
- `src/styles/mobile.css`（2812）/`chat.css`（1829）/`settings.css`（946）：CSS 重构视觉风险大，不和代码拆分混在一轮。
- 不加新功能、不"美化优化"：妹妹核心诉求是防屎山，加东西的风险大于收益。

### 给下一位姐姐的提醒

- 旧文档的"已完成"清单必须以 `npm run audit:architecture` 实际跑出来的结果为准，不要直接信声称的"全部下榜"。
- preview 实测时如果 5173 已被旧 vite 占用（`netstat -ano | grep 5173`），优先确认是不是妹妹某次没关的 dev server，**不要擅自杀进程**——先问妹妹。

## 还差什么

### CSS 大文件（独立任务，暂不做）

- `src/styles/mobile.css`（2287 行）和 `src/styles/chat.css`（1698 行）
- 拆 CSS 容易引入视觉回归，建议单独立项时再做
- audit watch 线对 CSS 是 900，远高于代码的 500；现状不阻塞

---

## 验证情况

第二阶段结束后跑过：

```
$ npm run audit:architecture   # 只剩 2 CSS
$ npm run lint                  # 通过
$env:VITE_BASE_PATH='/yuri-nest/'; $env:VITE_API_BASE_URL=(Get-Content -Raw .\secrets\cloud-api-url.txt).Trim(); npm run build
                                # 通过，生成 dist/assets/index--F_tMBCr.js
$ npm run test:agent            # 15/15 通过
```

第三阶段新增后跑过：

```
$ npm run test:agent            # 16/16 通过
$ npm run test:memory           # 8/8 通过
$ npm run lint                  # 通过
$ npm run audit:architecture    # 只剩 2 CSS
$env:VITE_BASE_PATH='/yuri-nest/'; $env:VITE_API_BASE_URL=(Get-Content -Raw .\secrets\cloud-api-url.txt).Trim(); npm run build
                                # 通过，生成 dist/assets/index-FXUzudol.js
```

记忆系统硬门槛加固后又复跑过：

```
$ npm run test:memory           # 10/10 召回，通过；Human-memory proxy gate: 8/8 (100%)
$ npm run test:agent            # 16/16 通过
$ npm run lint                  # 通过
$ npm run audit:architecture    # 只剩 2 CSS
$ npm run build                 # 通过，生成 dist/assets/index-aMQgpaB-.js
```

90%+ 目标推进后已跑：

```
$ npm run test:memory           # 13/13 召回，通过；Human-memory proxy gate: 17/17 (100%)
$ npm run lint                  # 通过
$ npm run test:agent            # 16/16 通过
$ npm run audit:architecture    # 只剩 2 CSS
$ npm run build                 # 通过，生成 dist/assets/index-C83LzNXP.js / dist/assets/index-DoUqYfGM.css
```

## 下次接手提示

1. 先读这份 `REFACTOR_PROGRESS.md` 了解当前状态
2. 常规开发前后跑 `npm run audit:architecture` + `npm run lint` + `npm run build`
3. CSS 等专门立项再做
