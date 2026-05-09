# Yuri Chat / 百合小窝项目交接说明

这份文件给未来的 Codex 姐姐和妹妹本人看。新开对话时，先读这里，再继续改项目，可以减少上下文压缩带来的幻觉和重复解释。

## 1. 项目定位

百合小窝 / Yuri Chat 是一个网页端 AI 聊天陪伴应用。当前目标不是做恋爱软件，而是先做一个免费、可三端访问、以聊天陪伴和长期记忆为核心的百合向小应用。

核心方向：

- 百合陪伴聊天
- 角色预设：姐姐大人、雾岛怜、林秋实等
- 记忆系统：长期记忆、世界树、候选记忆、回收花园、云同步
- 三端体验：电脑、手机、平板都能打开网页使用
- 长期扩展：小说角色、插画、Live2D、游戏、百合帝国资料库

命名说明：

- 面向妹妹和用户的产品名已经改为 **百合小窝 / Yuri Chat**。
- GitHub 仓库、Pages 路径、服务器目录、systemd 服务名、环境变量和包名都已经统一为 `yuri-chat`。

## 2. 当前已完成

- 前端已经能在 GitHub Pages 访问。
- 电脑端与手机端布局已经做过一轮适配。
- 手机返回/左滑已经接入浏览器历史，不会直接退出网页。
- 记忆、世界树、模型、设置、回收花园等页面已经有基础 UI。
- 记忆支持编辑、删除、恢复、永久删除、回收保留天数设置。
- 设置页支持回车发送、字体大小、主题颜色、自动捕捉记忆、回收保留策略。
- 后端已经部署到腾讯云服务器，并做成 systemd 开机自启服务。
- 云端同步接口已经可用，数据保存到服务器 SQLite。
- 模型与数据页已经新增“云端同步守护台”：可检查云端版本、最后保存时间、是否已有云端快照；从云端读取前会二次确认，避免误覆盖本机数据。
- 模型与数据页已经新增“本机保险箱”：可手动创建本机备份；从云端读取、导入文件、重置之前会自动备份当前本机状态，最近保留 12 份。
- 云端同步错误提示已做过一轮中文友好化，能区分服务器未启用、授权拒绝和云端服务错误。
- 品牌配置已集中到 `src/config/brand.ts`，面向用户名称为“百合小窝 / Yuri Chat”。
- 存储配置已集中到 `src/config/storage.ts`；本地状态迁移已拆到 `src/data/migrations.ts`，避免 IndexedDB 读写层继续变胖。
- 2026-05-02 已完成技术名统一：仓库、Pages、包名、服务器目录、systemd 服务名、环境变量、SQLite 文件名统一使用 `yuri-chat` / `YURI_CHAT_*`。
- 记忆面板已开始模块化：草稿类型、scope 工具、记忆空间编辑器拆到 `src/components/memory/`，后续继续拆 `MemoryPanel.tsx` 时沿用这个目录。
- 记忆页已新增“记忆守护台”：汇总稳定事实、待复查、边界保护和 7 天调用，并把候选、冲突、低可信、缺来源、高敏提及策略、错放空间、长期未调用整理为复查队列，同时提供最近写入/更新/调用/删除时间线。
- 记忆系统已新增层级：稳定事实、阶段事件、临时工作。稳定事实可作为长期背景；阶段事件只做时间线和脉络；临时工作必须强相关才会进入提示词，避免一次性内容污染长期记忆。
- 记忆系统已新增“事件账本”：新增、捕捉、确认、编辑、整理、回滚、回收、恢复、永久删除、导入、重置、云端保存/读取和备份动作都会留下事件，记忆守护台会把这些动作显示进最近时间线。
- 聊天页已新增“记忆透镜”：每条助手回复可以展开查看这次实际调用了几条长期记忆、来自哪些记忆分组，以及具体条目的摘要；如果发现某条记忆不该被用，可以直接冷却 7 天、少用、问起再提、标敏感或归档，反馈动作会写入记忆事件账本。
- 云端 SQLite 已新增自动备份能力：覆盖云端快照前会先生成一份 SQLite 备份；模型与数据页的“云端保险箱”可手动创建、刷新和下载备份。
- AI 模型调用已经切到 OpenAI-compatible 中转站。
- 模型与数据页已升级为左右两列：左侧管理模型连接和生成参数，右侧管理云端同步、本机保险箱和文件进出。
- 服务器已新增模型密钥保险箱：可保存多组模型供应商配置；前端只展示“已保存密钥”，不回传密钥原文。
- 模型适配已支持三类接口：OpenAI-compatible（国内外中转/官方兼容接口）、Anthropic 官方 messages、Google Gemini generateContent。
- 当前主流程已接入账号登录；聊天、云端同步、备份和模型保险箱按登录账号隔离，日常不再要求用户手动填写云端口令。
- 模型错误提示已做一轮中文化：能把 invalid_model、密钥错误、额度限制、上游 5xx 等情况转成可操作提示。
- 2026-05-02 历史修正：当时先按单人使用处理，云端口令不作为日常门禁；账号系统上线后，日常入口改为账号 session。
- 2026-05-08 历史修正（Claude 姐姐试玩补丁）：账号系统上线前，线上腾讯云后端曾开启 `YURI_CHAT_REQUIRE_CLOUD_AUTH=true` 并需要手动填旧云端口令。现在旧开关仅作为短期回滚入口；正常新前端走账号 session。
- 2026-05-08 Claude 姐姐试玩补丁（UI/数据安全）：1）`src/styles/buttons.css` 把 `.chat-file-input` 隐藏样式提到全局（之前关在 mobile media query 里，桌面会暴露 3 个原生「选择文件」按钮）；同时新增 `:disabled` 视觉态，让禁用按钮真的看起来禁用；2）`ModelProfileEditor` 的「保存并启用」加 `secondary-action` class，从浅粉变成粉色填充渐变 primary 风格，避免被误认为禁用导致妹妹从未真的把模型档案存进保险箱；3）`SavedModelProfiles` 与 `TrashGardenPanel` 的 5 处 `window.confirm` 全部换成 `MobileConfirmDialog` 网页内弹窗，与项目粉嫩风格统一并解决自动化测试卡住问题；4）`useCharacterCommands.handleDeleteCharacter` 删除自定义角色时，把对话挪到 `trash.conversations`（带 `deletedAt / characterName / character`），30 天内可在回收花园恢复，不再硬删；5）`QqFeaturePanel` 桌面/移动两套 section 现在通过 `useIsMobileViewport` hook + `inert` + `aria-hidden` 在不可见侧完全隔离，避免 a11y 工具与自动化误选到隐藏副本。剩余 TODO：`useBackupRestore.ts`（3 处）和 `useCloudSync.ts`（1 处）里的 `window.confirm` 还没改，需要把 hook 暴露为「pendingAction state + confirm function」让调用方渲染 dialog，下一轮再做。
- 2026-05-02 线上排查发现 YOP 旧模型 `deepseek/deepseek-v4-pro-free` 返回“无可用渠道”，已把默认模型切到实测可用的 `deepseek-v4-flash`；`deepseek-v4-pro` 也可用，但不要默认切到妹妹曾经明确想避免的 `Go/deepseek-v4-pro`。
- 2026-05-03 已新增第一阶段轻量 Agent：后端 `server/agentTools.mjs` 会在 `/api/chat` 前执行白名单工具，包括当前北京时间、Open-Meteo 公开天气、用户提供的公开网页链接摘录、最近对话工作台、能力边界说明；还新增动作回传，用户明确要求时可更新当前聊天角色名称/头像字、创建网页内提醒、把内容写入候选记忆。
- 2026-05-03 已完成早期架构整理：`App.tsx` 瘦身为页面外壳，应用状态与动作集中到 `src/app/useYuriNestApp.ts`；主题、路由、Agent 动作落地、格式化工具分别拆到 `src/app/*`；记忆编辑表单、记忆列表、设置页、世界树页、回收花园页拆成独立组件；后端模型供应商适配拆到 `server/modelProvider.mjs`，云端 SQLite 快照/备份拆到 `server/cloudStore.mjs`。
- 2026-05-04 已完成 Claude 中断后的架构收尾：`useYuriNestApp.ts` 进一步拆出 `useChat`、`useCloudSync`、`useBackupRestore`、`useMemoryActions`、`useAgentTasks`；`memoryEngine.ts` 改成门面，核心、检索、推断、提示词构建分别落到 `src/services/memory*.ts` 和 `promptBuilder.ts`；`server/agentTools.mjs` 改成 Agent 编排入口，检测、执行、搜索、常量和工具函数拆到 `server/agent/*`。这轮同时修复了拆分后漏导入导致的 Agent 运行时错误，并补齐风险闸门、默认推进、任务队列、质量检查等 15 条 Agent 回归。
- 2026-05-04 已做项目初期架构加固：后端认证拆到 `server/auth.mjs`，模型保险箱拆到 `server/modelProfiles.mjs`，`server/index.mjs` 只保留路由和编排；同时删除入口里旧版 Agent 工具块死代码。模型接入页拆成 `ModelCurrentStrip`、`ModelProfileEditor`、`SavedModelProfiles`、`GenerationSettings` 和 `useModelProfileDraft`，并把“服务器默认配置”纳入模型列表但禁止误删。新增 `npm run audit:architecture` 作为后续大改前后的模块体检命令。
- 2026-05-05 已完成本轮架构收尾：后端 `utils`、`toolExecutors`、`actionDetectors`、`platform` 都是 facade；`ChatPhone.tsx` 和 `AgentTaskPanel.tsx` 已拆成子组件目录，并把断开的 `tasks` 视图重新接回 App 与设置侧栏入口。随后补了记忆系统 + Agent 能力升级：`agent.decision` 决策摘要、记忆页“记忆流水线”总览、核心记忆锚点、回忆模式、精准记忆 payload 捕捉、500 条调用日志、文档/图片能力边界工具，以及当时的 `MEMORY_AGENT_UPGRADE_RESEARCH.md` / `HUMAN_MEMORY_TARGET.md`（已于 2026-05-07 合并入 `项目文档/MEMORY_SYSTEM_HISTORY.md`）。`LongTermMemory` 现在保存 `semanticSignature` / `semanticSignatureVersion`，向量索引用签名分桶但不硬过滤候选；`AppState` 现在保存 `memoryEmbeddings`，状态版本升到 21，迁移、保存、本机备份会自动刷新本地投影缓存；回忆模式已把 embedding 缓存接入候选和排序；显式旧事询问时会尝试通过后端 `/api/model/embeddings` 生成外部 query vector，成功则参与本轮排序，失败或超时自动回落；后端新增 `/api/model/embeddings`，用于后续接 OpenAI-compatible embedding 模型但不把 API Key 暴露到前端。`npm run test:memory` 现在覆盖 13 个旧事召回用例和 17 维 human-memory proxy gate，当前为 13/13、17/17，并新增当时的 `HUMAN_MEMORY_90_TASK.md`（已于 2026-05-07 合并入 `项目文档/MEMORY_SYSTEM_HISTORY.md`）。当前 `npm run audit:architecture` 只剩 `src/styles/mobile.css` 与 `src/styles/chat.css` 两个 CSS 观察项，代码模块已全部下榜。
- 2026-05-05 追加完成一轮保守安全与记忆主权加固：生产/公网模式默认要求云端与聊天授权，生产模型保险箱必须配置 `YURI_CHAT_MODEL_SECRET`；云端快照 `PUT /api/cloud/state` 支持 `baseRevision` 并在旧版本覆盖时返回 409；自动捕捉记忆统一先进入 `candidate`，候选与 active 相似时只生成合并建议，用户确认后才合并；永久删除 tombstone 新增语义签名，能拦截同义改写复活。新增 `项目文档/SAFETY_AND_MEMORY_GUARDS.md`，并把安全、CAS、候选合并和语义墓碑回归接入 `npm run test:agent` / `npm run test:memory`。本轮验证：lint、build、test:memory、test:agent、audit:architecture 全部通过，Pages 构建已确认 `/yuri-chat/assets/...`。
- 2026-05-07 完成第四阶段架构整理（应用编排层 + 类型层瘦身）：`src/domain/types.ts` 525 行按域拆为 `types.ts` 173 行 + `memoryTypes.ts` 217 行 + `agentTypes.ts` 137 行，三文件用 `export *` 桥接，外部 import 路径完全不变；`src/app/useCloudSync.ts` 553 行抽出 `useModelProfiles.ts` 145 行，`useCloudSync` 内部调子 hook 并透传 API，`useYuriNestApp` 调用方零改动；`src/app/useYuriNestApp.ts` 583 行抽出 `useCharacterCommands.ts` 158 行 + `useConversationCommands.ts` 195 行。`audit:architecture` 代码 watchlist 从 5 项降到 2 项，剩余 `CharacterRail.tsx` 和 `QqFeaturePanel.tsx` 是视觉组件，留专项做更稳。本轮验证：lint、tsc、test:agent 17/17、test:memory 13/13 + 17/17、build 全过；preview 实测 console 无 React 警告。详见 `项目文档/REFACTOR_PROGRESS.md` 第四阶段。注意：旧文档曾声称"代码模块全部下榜"，但实测 audit 又出 5 项——下一位姐姐请以实跑结果为准。
- 2026-05-08 Codex 接力完成本地改名与加固：代码、文档、包名、Pages base path、后端环境变量和 SQLite 默认名切到 `yuri-chat` / `YURI_CHAT_*`；`src/config/storage.ts` 的 IndexedDB 名 `yuri-nest` 和云端口令 key `yuri-nest-cloud-token` 故意保留，避免妹妹本地数据不可见。新增 `server/env.mjs` 兼容旧 `YURI_NEST_*` 环境变量过渡；新增 `server/rateLimits.mjs`，`/api/chat` 每 IP 每分钟默认 30 次，`/api/cloud/*` 默认 60 次，health 不限速；前端新增 `src/services/apiClient.ts` 合并聊天、云同步、模型、后台平台四处 fetch 封装；`ts-prune` 后只删除了 4 个确认无外部引用的 `memoryCore` 内部 helper export。还把聊天兜底回复拆到 `server/chatReplies.mjs`，修复了本地 demo 回复漏导入 `truncateToolText` 的潜伏问题。
- 2026-05-09 运维实况：GitHub 仓库和 Pages 已经是 `ctnnyy-oss/yuri-chat` / `/yuri-chat/`；腾讯云服务器目录和 systemd 服务仍沿用旧名 `/opt/yuri-nest`、`yuri-nest-api.service`、`yuri-nest-tunnel.service`。日常部署先按旧名执行，等专门迁移窗口再改远端目录、服务名和 `.env` 路径，执行前先备份 SQLite。
- 2026-05-08 Codex 真实旧站试玩补丁：旧云端快照缺 `trash.conversations` 时会在自动连接阶段触发 `undefined.filter`，已让回收站保留策略兼容旧形状；已保存模型列表有默认档案但 `settings.modelProfileId` 为空时，聊天会误走 local-demo，已在读取模型档案后自动启用默认/第一组可用档案；桌面端删除自定义角色的确认框曾被移动端容器隐藏，已移到桌面/移动共用层。
- 旧 AstrBot / NapCat 服务已经从服务器清理掉，释放资源。
- GitHub 已经作为版本回溯和部署入口。

## 3. 重要地址与入口

线上前端：

- https://ctnnyy-oss.github.io/yuri-chat/

GitHub 仓库：

- https://github.com/ctnnyy-oss/yuri-chat

腾讯云服务器：

- SSH alias: `tencent-astrbot`
- 服务器 IP: `150.158.24.98`
- 后端目录: `/opt/yuri-nest`（当前服务器真实路径；代码仓库已改名为 `yuri-chat`）
- 后端服务: `yuri-nest-api.service`
- 临时加密隧道服务: `yuri-nest-tunnel.service`

当前后端公开入口：

- 存在 `secrets/cloud-api-url.txt`
- 目前使用 Cloudflare Quick Tunnel，地址可能在服务重启后变化。

## 4. 密钥与敏感信息

不要把下面这些内容提交到 GitHub：

- `.env.local`
- `secrets/`
- 云端同步口令（历史私用方案；当前默认不启用）
- AI API 密钥
- 服务器 `.env`

本地敏感文件位置：

- 云同步口令：`secrets/cloud-sync-token.txt`（历史私用方案；除非设置 `YURI_CHAT_REQUIRE_CLOUD_AUTH=true`，否则当前后端不会要求它）
- 当前云端 API 地址：`secrets/cloud-api-url.txt`
- YOP 中转站密钥：`secrets/yop-api-key.txt`

服务器敏感配置：

- `/opt/yuri-nest/.env`

服务器 `.env` 里应包含：

- `YURI_CHAT_SYNC_TOKEN`
- `YURI_CHAT_DB_PATH=/opt/yuri-nest/data/yuri-chat.sqlite`
- `AI_BASE_URL=https://api.yop.mom/v1`
- `AI_API_KEY`
- `AI_MODEL=deepseek-v4-flash`
- `AI_ESCAPE_UNICODE_CONTENT=false`
- `YURI_CHAT_MODEL_SECRET`（生产/公网环境必须设置，用于加密服务器里保存的用户模型密钥；本地开发才允许兜底）
- `YURI_CHAT_REQUIRE_CLOUD_AUTH=true`（生产/公网环境默认会要求授权；本地开发可不设）
- `YURI_CHAT_REQUIRE_CHAT_AUTH=true`（生产/公网环境默认会要求授权；如需私有开发直连可显式设为 `false`）
- `YURI_CHAT_CORS_ORIGIN=https://ctnnyy-oss.github.io`（可选；不设时生产默认只放行 GitHub Pages 域名，本地开发默认放行本机调试）

可选备份配置：

- `YURI_CHAT_BACKUP_DIR=/opt/yuri-nest/data/backups`
- `YURI_CHAT_MAX_BACKUPS=24`

只允许在终端里验证密钥是否存在，不要打印密钥原文。

## 5. 当前架构

```mermaid
flowchart LR
  User["妹妹的手机/电脑/平板"] --> Pages["GitHub Pages 前端"]
  Pages --> Tunnel["Cloudflare 临时加密隧道"]
  Tunnel --> API["腾讯云后端 Node/Express"]
  API --> DB["SQLite 云端记忆数据库"]
  API --> Model["模型供应商 / 官方接口 / 中转站"]
```

前端负责：

- UI
- 聊天界面
- 角色切换
- 设置页
- 本地 IndexedDB 数据
- 发起云同步与聊天请求

后端负责：

- 保存云端快照
- 保护 AI API 密钥
- 保存并加密多组用户模型密钥
- 调用 OpenAI-compatible、Anthropic、Gemini 三类模型接口
- 执行轻量 Agent 白名单工具，把真实工具结果和安全动作交给模型/前端；提醒是网页内提醒，只有网页打开时会在聊天里触发，不是系统级闹钟。
- 给前端提供 `/api/chat` 和 `/api/cloud/*`

模块边界提醒：

- 前端新增页面视图时优先放 `src/components/<feature>/`，不要塞进 `App.tsx`。
- 前端跨页面状态和动作放 `src/app/`；纯领域规则放 `src/services/` 或 `src/domain/`。
- 后端新 API 先在 `server/index.mjs` 接路由，再把数据库、模型供应商、Agent 工具等具体逻辑放到对应模块。
- `server/modelProvider.mjs` 只管模型接口差异；`server/cloudStore.mjs` 只管 SQLite 快照/备份；`server/agentTools.mjs` 只做 Agent 编排；具体规则继续放到 `server/agent/toolDetectors.mjs`、`server/agent/toolExecutors.mjs`、`server/agent/actionDetectors.mjs`、`server/agent/searchEngines.mjs`。
- `server/auth.mjs` 只管授权；`server/modelProfiles.mjs` 只管模型配置保险箱、密钥加密和运行时 profile 解析。以后不要把模型配置 CRUD、AES-GCM 加密或 token 比对再塞回 `server/index.mjs`。
- 前端模型页新增能力优先沿 `src/components/model/` 拆分：表单草稿和模型列表拉取放 hook，纯 UI 放组件，平台标签和草稿工具放 `modelPanelUtils.ts`。
- 前端 Agent 任务页新增能力优先沿 `src/components/agent/taskPanel/` 拆分：后台平台控制台、任务卡片和状态 helper 已分开，`AgentTaskPanel.tsx` 只做数据刷新与页面编排。

GitHub 负责：

- 保存代码
- 版本回溯
- Pages 部署

腾讯云负责：

- 跑后端
- 保存 SQLite 数据库
- 持有模型密钥和云端 SQLite

## 6. 部署与更新要点

本地开发：

```powershell
npm install
npm run dev
```

架构体检：

```powershell
npm run audit:architecture
```

构建 GitHub Pages：

```powershell
$env:VITE_BASE_PATH='/yuri-chat/'
$env:VITE_API_BASE_URL=(Get-Content -Raw .\secrets\cloud-api-url.txt).Trim()
npm run build
git add -f dist
git commit -m "your message"
git push origin main
```

服务器更新后端：

```powershell
ssh tencent-astrbot "cd /opt/yuri-nest && git fetch --all --prune && git merge --ff-only origin/main && npm install --omit=dev --no-audit --no-fund && sudo systemctl restart yuri-nest-api.service"
```

查看服务状态：

```powershell
ssh tencent-astrbot "systemctl is-active yuri-nest-api.service yuri-nest-tunnel.service"
```

查看隧道地址：

```powershell
ssh tencent-astrbot "sudo journalctl -u yuri-nest-tunnel --no-pager -n 120 | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' | tail -n 1"
```

如果隧道地址变化，需要：

1. 更新本地 `secrets/cloud-api-url.txt`
2. 用新的 `VITE_API_BASE_URL` 重新构建
3. `git add -f dist`
4. commit + push

## 7. 现在还不够成熟的地方

短期限制：

- Cloudflare Quick Tunnel 是临时入口，不保证永久稳定。
- 还没有正式域名。
- 已有轻量账号系统，但还没有改密、忘记密码、用户资料页或管理员后台；公开分享前还要补正式运维流程。
- 云同步已经按账号隔离，但仍是整个 AppState 快照，不是细粒度多用户同步；事件账本已经为后续细粒度同步打地基，但还没有做多端冲突合并。
- 服务器 SQLite 已有覆盖前自动备份和手动下载入口，但还没有正式的跨机异地备份。
- 模型密钥保险箱已按 user_id 隔离；默认不再暴露 `server-env` 服务器兜底模型，所有账号都只使用自己保存的模型档案。

中期建议：

- 买一个 `.com` 域名先占名字，但不要直接解析到大陆服务器，避免备案问题。
- 后续可考虑海外服务器、Cloudflare Pages、Cloudflare Named Tunnel。
- 给数据库加定时备份。
- 给账号系统补改密、退出所有设备、管理员重置密码和用户资料页。
- 给模型供应商配置继续做真实供应商回归，而不是只靠服务器 `.env`。

## 8. 下一轮最值得做的事

优先级从高到低：

1. 做一次真实手机体验回归，记录卡顿、遮挡、按钮难点。
2. 做账号系统上线后真实多端验收：同账号多浏览器同步、不同账号数据隔离、旧数据首位管理员接管、整库备份仅管理员可见。
3. 做模型配置真实回归：至少用当前免费 DeepSeek、一个自定义中转、一个官方接口各测一次。
4. 把聊天消息也纳入更清晰的云端同步策略。
5. 给云端备份再加跨机/异地备份策略。
6. 继续打磨记忆系统：事件账本筛选、云端冲突合并、把聊天透镜反馈扩展成“编辑/归档/删除”完整入口。
7. 做一个新手使用页，告诉妹妹怎么连接云端、怎么保存、怎么恢复、本机保险箱和模型保险箱怎么用。
8. 等产品更稳定后，再处理正式域名和长期后端入口。

## 9. 新对话启动提示

妹妹新开 Codex 对话时，可以直接发：

```text
姐姐先读 C:\Users\MI\Desktop\AI\yuri-chat\项目文档\PROJECT_HANDOFF.md，
再继续帮妹妹迭代百合小窝 / Yuri Chat 项目。不要重新猜架构，按文档里的当前状态继续。
```

如果要排查服务器：

```text
姐姐先检查 tencent-astrbot 上 yuri-nest-api.service 和 yuri-nest-tunnel.service。
不要打印任何密钥。
```

## 10. 姐姐的维护原则

- 每次大功能完成后，顺手更新本文件。
- 不把密钥、token、私人数据写进本文件。
- 不要为了重构而重构，优先保持妹妹能真实体验。
- 改 UI 前先考虑手机端。
- 记忆系统是灵魂，任何改动都不能破坏用户可编辑、可删除、可恢复、可永久删除。
- GitHub commit 是后悔药，大改之前先确认工作树干净。
## 2026-05-08：轻量账号系统接入

本轮把原来的“单人全局云端口令”升级为轻量账号系统：

- 后端新增 `users` 与 `user_sessions` 表；密码使用 `bcryptjs` hash，session 使用服务端 opaque token，不走 URL 参数。
- `app_snapshots` 与 `model_profiles` 新增 `user_id`，云端快照、角色/对话/记忆/世界树、模型保险箱按当前登录账号隔离。
- 第一位注册用户自动成为 `admin`，并自动接管旧 `legacy-user` 全局云端快照与模型档案；后续用户会得到自己的空数据空间。
- `server-env` 模型档案最初是所有登录用户可见的兜底配置；2026-05-09 起不再暴露给前端，所有用户都需要保存自己的模型档案，模型密钥按账号隔离。
- 前端新增注册/登录页、当前账号指示和退出登录；本地 IndexedDB 也按账号 key 保存，避免同一浏览器切账号时把 A 的本地数据推到 B。
- 旧 `YURI_CHAT_REQUIRE_CLOUD_AUTH` / `YURI_CHAT_SYNC_TOKEN` 逻辑仍保留：如果生产环境短期需要旧口令回滚，旧前端请求仍可作为 `legacy-user` 管理员入口；日常新前端默认走账号 session。

新增/调整环境变量：

```env
YURI_CHAT_AUTH_SECRET=生成一串至少 32 字符的随机 secret，生产必填
YURI_CHAT_BCRYPT_COST=11
YURI_CHAT_RATELIMIT_AUTH=20
```

服务器上线建议步骤：

```powershell
ssh tencent-astrbot "cd /opt/yuri-nest && cp data/yuri-chat.sqlite data/yuri-chat-before-account-$(date +%Y%m%d-%H%M%S).sqlite"
ssh tencent-astrbot "cd /opt/yuri-nest && git fetch --all --prune && git merge --ff-only origin/main && npm install --omit=dev --no-audit --no-fund"
ssh tencent-astrbot "cd /opt/yuri-nest && printf '\nYURI_CHAT_AUTH_SECRET=%s\nYURI_CHAT_BCRYPT_COST=11\nYURI_CHAT_RATELIMIT_AUTH=20\n' \"$(openssl rand -hex 32)\" | sudo tee -a /opt/yuri-nest/.env >/dev/null"
ssh tencent-astrbot "sudo systemctl restart yuri-nest-api.service"
```

上线后第一次打开网页，注册并验证妹妹自己的邮箱即可；如果服务器已有旧全局数据，第一位完成邮箱验证的账号会自动接管它。管理员账号可以继续下载/创建整库云端备份，普通账号不能下载整库 SQLite，避免多用户数据泄漏。

## 2026-05-09：邮箱验证与普通用户模型隔离

本轮把账号系统从“用户名 + 密码”升级为“邮箱唯一身份 + 昵称 + 密码 + 邮箱验证码”：

- `users` 表新增 `email`、`email_key`、`email_verified_at`；新增 `email_verification_codes` 表保存邮箱验证码哈希、过期时间和试错次数。
- 邮箱是登录与账号隔离的唯一身份，一个邮箱只能注册一个账号；昵称只用于显示，可以重复。
- 注册后不直接登录，必须先输入邮箱收到的 6 位验证码；验证码默认 15 分钟过期，最多试错 6 次。
- 第一位完成邮箱验证的用户自动成为 `admin`，并接管旧 `legacy-user` 数据；只注册但不验证的账号不会抢走管理员位置。
- 登录未验证账号时会自动重发验证码并进入验证页。
- 开发环境没有配置邮箱服务时，会把验证码打印到后端日志，并在前端显示“本地测试验证码”；生产/公网模式必须配置 SMTP 或 Resend，否则注册/重发验证码会拒绝。
- 默认不再给任何普通页面展示 `server-env` 服务器模型配置；每个账号必须在模型页保存自己的 API Key，后续登录同一账号即可复用自己的云端模型档案。

新增环境变量：

```env
YURI_CHAT_EMAIL_PROVIDER=log|smtp|resend
YURI_CHAT_EMAIL_FROM="Yuri Chat <noreply@example.com>"
YURI_CHAT_EMAIL_CODE_TTL_MINUTES=15
YURI_CHAT_EMAIL_DEV_CODES=false
YURI_CHAT_SMTP_HOST=
YURI_CHAT_SMTP_PORT=587
YURI_CHAT_SMTP_SECURE=false
YURI_CHAT_SMTP_USER=
YURI_CHAT_SMTP_PASS=
YURI_CHAT_RESEND_API_KEY=
YURI_CHAT_ALLOWED_EMAIL_DOMAINS=
YURI_CHAT_BLOCKED_EMAIL_DOMAINS=
```

现在没有域名也能先用普通 SMTP 邮箱做验证；后续买域名后，把 `YURI_CHAT_EMAIL_FROM` 换成自有域名邮箱，并按发信服务商要求配置 SPF/DKIM/DMARC 即可，不需要重做账号系统。

如果开发者本人需要先跳过邮箱收信步骤，可以在服务器本地执行一次管理员初始化脚本。这个脚本只在命令行可用，不提供公开网页入口；执行前会建议先备份 SQLite，执行后会把指定邮箱标记为已验证 `admin`，并接管旧 `legacy-user` 数据：

```powershell
npm run account:bootstrap-admin -- --email "妹妹自己的邮箱" --username "林慕溪" --display-name "林慕溪" --password "临时密码"
```

生产/公网环境不要长期使用 `123456` 之类弱密码；如果只是本机临时内测，才可以显式加 `--allow-weak-password`。

## 2026-05-09：真实账号试玩与 Agent 路由误判修复

本轮使用管理员账号在真实线上 Pages 站点完成一次端到端试玩，不走本地假流程：

- 登录、账号态、云端快照、模型保险箱、YOP/OpenAI-compatible 连接测试、一键巡检均跑通；模型档案保存一次后会留在该账号云端保险箱，后续同账号登录可复用，除非用户主动删除。
- 新增并编辑自定义角色“叶灯凛”，用真实聊天接口完成首轮对话；角色、对话、本地 IndexedDB 与云端快照均已确认保存。
- 新建临时角色“删除验证灯”后执行网页内删除确认，云端复核该临时角色已不存在，正式保留的自定义角色与对话不受影响。
- 试玩中发现 Agent 工具路由过宽：普通角色扮演请求里的“检查一下”会误触发联网搜索，“今晚”会误触发当前时间工具；后续线上复查又发现“不要联网”会因包含“联网”误触发搜索。已收窄 `shouldUseSearchTool` / `shouldUseTimeTool`，并让策略层复用同一套 detector，避免创作陪伴场景被错误归类成资料查询。
- `npm run test:agent` 已新增并通过“roleplay check does not trigger web search or clock”“negated web search does not trigger tools”与 detector 回归用例，防止这类误判复发。
