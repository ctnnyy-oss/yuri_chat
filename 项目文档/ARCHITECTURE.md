# 百合小窝 / Yuri Nest 架构笔记

## 目标

百合小窝 / Yuri Nest 不是一次性网页，而是长期迭代的百合聊天陪伴底座。第一版先保证可运行、可聊天、可保存记忆，后续再扩展 Live2D、语音、PWA、角色市场、世界树编辑器、RAG 和多端伴随能力。

## 分层

- `src/components`：只负责界面，不直接决定角色、记忆和模型规则。
- `src/app`：前端应用编排层。`useYuriNestApp.ts` 统一持有页面状态、聊天发送、云端同步和模型配置动作；`agentActions.ts` 负责把后端 Agent 动作落到 AppState；`theme.ts`、`navigation.ts` 和 `formatters.ts` 放跨页面的轻量工具。
- `src/components/memory`：记忆面板的子组件、草稿类型和 UI 工具函数。`MemoryPanel.tsx` 只负责组装记忆页、候选审核、守护台和档案弹窗，不继续堆编辑表单和卡片细节。
- `src/components/memory/sections/MemoryRecallMap.tsx`：记忆生命周期总览，展示捕捉、校准、调用、修剪四段状态，让人工审核入口不藏在列表深处。
- `src/components/settings`：设置、主题、云同步、本机备份和导入导出的页面视图。
- `src/components/world`：世界树和 CP 展示视图。
- `src/components/trash`：回收花园视图。
- `src/config`：集中放品牌名、默认项目空间、本地存储 key 等跨模块配置。改名或调整存储策略时先看这里。
- `src/domain`：类型定义，是项目的共同语言。
- `src/domain/memoryLabels.ts`：记忆类型、状态、敏感度、提及时机的中文标签。UI 可以读标签，但不要反向依赖记忆引擎。
- `src/data`：种子数据、本地数据库和状态迁移，后续可替换或扩展为云同步。
- `src/data/migrations.ts`：所有 AppState 版本升级都集中放这里，避免 IndexedDB 读写层越来越臃肿。
- `src/services/memoryEngine.ts`：记忆系统门面，只 re-export 公共 API，并保留会话管理和轻量冲突检测。
- `src/services/memoryCore.ts`：记忆创建、标准化、修订、回滚、候选整合、整理和 tombstone 防复活。
- `src/services/memoryRetrieval.ts`：长期记忆检索、世界树触发、调用权重更新和上下文块构建。
- `src/services/promptBuilder.ts`：提示词组装、上下文预算、运行时环境和记忆调用日志。
- `src/services/chatApi.ts`：前端到本地 API 代理的通信。
- `src/components/model`：模型接入页的组件边界。`ModelAndDataPanel.tsx` 只做页面编排；当前模型条、模型编辑器、已保存模型、生成参数分别在独立组件；草稿、模型列表拉取和测试动作放 `useModelProfileDraft.ts`；平台标签和草稿工具放 `modelPanelUtils.ts`。
- `server/index.mjs`：后端 API 入口，只负责路由、认证、请求编排和调用下层模块。
- `server/auth.mjs`：云端同步与模型代理的授权判断、中间件和 token 比对，避免认证逻辑散落在路由入口。
- `server/cloudStore.mjs`：SQLite 云端快照、备份列表、备份裁剪和状态形状校验。
- `server/modelProvider.mjs`：模型供应商适配层，集中处理 OpenAI-compatible、Anthropic 和 Gemini 的请求、模型列表、错误翻译和兼容编码。
- `server/modelProfiles.mjs`：模型保险箱的配置读写、服务器默认配置摘要、运行时配置解析和 API Key 加密解密；前端不接触密钥原文。
- `server/agentTools.mjs`：Agent 编排入口，只负责按顺序调度工具检测、工具执行、动作检测和上下文块组装。
- `server/agent/toolDetectors.mjs`：判断本轮应该启用哪些白名单工具、风险闸门和收尾检查。
- `server/agent/helpers/text.mjs`：只做基础文本规范化、截断和文本统计，不把用户吐槽或口误擅自改写成产品意图。
- `server/agent/toolExecutors.mjs`：facade，re-export `executors/` 子目录里 39 个工具结果生成器；按职责拆为 realtime / web / compute / workspace / planning / governance / quality 7 个文件。
- `server/agent/actionDetectors.mjs`：facade，re-export `detectors/` 子目录里 58 个识别和编排函数；按职责拆为 inAppActions / queryParsers / context / intent / strategy 5 个文件。
- `server/agent/searchEngines.mjs`、`server/agent/constants.mjs`：Agent 的搜索引擎查询和常量。
- `server/agent/utils.mjs`：facade，re-export `helpers/` 子目录里 8 个文件（time / tools / url / html / text / math / http / weather）的通用工具函数。
- `server/platform.mjs`：facade，re-export `platform/` 子目录的 db / tasks / worker / connectors 四个模块；任务入队后由 facade 统一调用 worker，避免子模块循环依赖。
- `src/components/agent/taskPanel`：Agent 任务页的子组件边界。`AgentTaskPanel.tsx` 只负责状态刷新、任务排序和页面编排；后台平台控制台、任务卡片、状态标签 helper 都放在子目录里。

## 关键原则

- 角色卡、世界树、长期记忆、聊天记录分开存，避免以后牵一发动全身。
- 前端不保存 API Key。浏览器只能调用本地代理 `/api/chat`。
- 默认能离线体验。没有 API Key 时走本地演示回复，方便快速验证 UI 和流程。
- 记忆系统先做可解释版本：最近消息是短期记忆，人工/规则沉淀为长期记忆，关键词触发世界树。每条长期记忆都保留类型、可信度、来源、调用记录和版本记录，避免黑箱记忆。
- 每个新能力都作为模块接入，避免把所有逻辑塞进聊天页面。
- 品牌名、技术路径和存储 key 分开管理，但当前主技术名已经统一为 `yuri-nest`，避免后续部署和文档继续分裂。
- 旧数据升级只能走 `migrations.ts`，不要在界面组件里临时判断旧字段；这样妹妹本机、云端快照和未来多设备同步都能复用同一条升级路径。
- 超过 500 行的文件默认进入“需要继续拆分观察区”。当前 UI 入口、记忆视图、App 编排层、记忆引擎入口、Agent 工具/动作/工具函数/后台平台、ChatPhone 输入面板和 Agent 任务面板都已经拆完；剩余观察项见 `项目文档/REFACTOR_PROGRESS.md`（目前只有两个大 CSS）。新增能力时按目录边界塞到对应子模块，不要回头堆到 facade。
- `npm run audit:architecture` 会扫描 `src` 和 `server`，列出超过观察线的模块。这个命令只做提醒，不阻断构建；每次大功能前后都可以跑一遍，防止新能力又被塞回入口文件。
- 拆大文件优先按“可验证的小模块”推进：先拆纯工具、配置、迁移、独立 UI，再拆带状态流的核心逻辑；每次拆完必须跑 lint/build 和浏览器回归。
- 新功能默认先问“它属于页面、应用编排、领域服务、数据迁移、后端路由、云存储、模型供应商还是 Agent 工具”。答不上来时先补边界，不要直接塞进 `App.tsx`、`MemoryPanel.tsx` 或 `server/index.mjs`。

## 记忆系统分层

- 短期记忆：当前角色最近 N 条消息，直接进入模型上下文。
- 会话摘要：旧消息压缩成当前对话摘要，保持基本连续性。
- 长期记忆：可编辑的用户画像、偏好、关系、项目、事件、规则、世界观。
- 记忆空间：每条记忆都有 scope，先区分全局用户、当前角色关系、角色私有、世界、项目、会话和临时空间，避免多角色串戏。
- 空间编辑器：记忆编辑表单可以手动改 scope，并根据空间类型选择角色、世界、分支、项目或会话。列表卡片提供快捷迁移，降低用户修正成本。
- 记忆状态：active 才会进入聊天提示；candidate 只在界面等待确认；archived/trashed/permanently_deleted 不参与检索。
- 候选审核：candidate 记忆集中进入审核中心，用户可以保存生效、编辑后保存、归档或删除，避免自动捕捉直接污染长期记忆。
- 敏感等级：low/medium/high/critical 会影响检索优先级。禁忌和安全边界可以进入提示词保护用户，其他极敏记忆默认不主动注入。
- 提及策略：每条记忆都有 mentionPolicy，分为 proactive/contextual/explicit/silent。它决定这条记忆能不能自然提起、只能相关时使用、只能用户问起再提，还是只做边界保护。
- 冷却机制：每条记忆可以设置 cooldownUntil。冷却期间不参与聊天检索，用来处理刚被纠正、暂时不想被提起或需要观察的内容。
- 证据来源：记忆从哪条聊天或哪次手动整理来，可在界面展开查看。
- 版本记录：每次创建、编辑、合并、回滚都会留下快照，方便审计和恢复。
- 记忆档案：每条记忆都可以打开档案弹窗，集中查看内容、状态、空间、敏感等级、来源证据、版本线和调用记录。
- 记忆层级：stable 是长期稳定事实；episode 是阶段事件和经历脉络；working 是临时工作上下文。Prompt 打包时会优先稳定事实，事件只能作为脉络，临时工作必须强相关才会进入。
- 核心记忆锚点：active + stable + 置顶/高权重高可信/流程规则会被视为长期锚点。检索时先保留少量锚点，再走相关性排序，避免真正重要的人设、偏好、规则因为时间久或关键词没命中而被忘掉。
- 花园体检：界面层汇总来源覆盖、可信度、待确认、边界记忆、低质量记忆和高频记忆，让用户知道 AI 记忆是否可靠，而不是把记忆藏成黑箱。
- 记忆守护台：`src/services/memoryGuardian.ts` 把候选、冲突、低可信、缺来源、高敏提及策略、错放空间和长期未调用统一整理成复查队列，并生成最近写入、更新、调用、删除的时间线。
- 记忆流水线：记忆页把捕捉、校准、调用、修剪四段状态放在顶部，用户无需理解内部字段，也能看见候选数量、来源覆盖、最近调用和可清理项。
- 记忆事件账本：`src/services/memoryEvents.ts` 记录记忆新增、自动捕捉、确认、编辑、整理、回滚、回收、恢复、永久删除、导入、重置、云端保存/读取和备份动作。它不替代版本快照，而是记录“谁在什么时候做了什么”，为后续细粒度同步、审计和安全回滚打基础。
- 聊天记忆透镜：`src/services/memoryTrace.ts` 把每条助手回复绑定到实际调用过的长期记忆，聊天气泡里可展开查看记忆数量、分组和条目摘要。用户可以在这里直接反馈误用记忆：冷却 7 天、少用、问起再提、标敏感或归档；反馈动作由 `src/services/memoryFeedback.ts` 统一生成修订和事件账本记录。它回答“这条回复为什么会这样想”，和守护台的全局账本互补。
- 防复活：彻底删除记忆时写入不含原文的 tombstone，后台整理和自动捕捉遇到同一指纹时不再重新提取。
- PromptBuilder：发送前先按 scope、status、kind、confidence、sensitivity、mentionPolicy 和 cooldown 过滤和排序，再按禁忌/资料/关系/项目/事件分层检索。每层都有预算和注入原因，不再把长期记忆一股脑塞进去。
- 回忆模式：当用户明确问“以前 / 上次 / 还记得 / 记忆 / 档案”等旧事时，PromptBuilder 会用最新问题作为记忆查询，召回上限从常规 12 条提升到 18 条，并加入“回忆模式”上下文块。此时事件、反思、曾调用过的记忆会放宽召回，回答必须基于召回记忆，找不到就诚实说没有找到。
- 角色记忆隔离：主陪伴体、雾岛怜、林秋实都有自己的关系/角色私有种子；切换角色后只会调用当前角色可见的关系记忆，防止“姐姐大人”和小说角色串戏。
- 空间总览：记忆页展示全局、当前角色、项目和世界空间的数量，并提示关系记忆是否误落到全局。
- 冲突检测：当前先用轻量规则检查明显的偏好相反、重复不一致、关系记忆落到全局空间等问题，并在记忆页给处理建议和小范围修正按钮。
- 使用日志：每次发送消息都会记录本次提示词实际注入的记忆 ID 和上下文分组，方便后续排查“为什么模型这样回答”。
- 使用日志保留上限是 500 条，不再只保留最近 50 条；它是“这条记忆被想起过”的证据来源，也给后续长期回忆、云端同步和记忆体检使用。
- 世界树：角色设定和世界观规则按关键词触发，和用户记忆分开管理。

当前版本使用本地启发式捕捉和整理：明确出现“记住 / 以后 / 我喜欢 / 不喜欢 / 规则 / 项目”等信号时才自动写入。后续接入后台 LLM 整理时，也要沿用“AI 建议、用户可审查、可删除可回滚”的原则。

自动捕捉必须只提取真正要记的内容，不要把整句口头语、吐槽、上下文废话原样塞进长期记忆。`maybeCaptureMemory` 会先抽取记忆 payload，再生成标题、正文和标签。

## Agent 检测与动作路由

- Agent 检测入口是 `server/agentTools.mjs`，输入先归一化，再按“实时 / 搜索 / 计算 / 安全上下文 / 多轮接力 / 动作检测 / 协同治理 / 质量收尾”的顺序调度。
- 工具检测只走 `server/agent/toolDetectors.mjs` 白名单，不让模型随意发明工具名。
- 工具执行只走 `server/agent/toolExecutors.mjs` facade 和 `server/agent/executors/*` 子模块；应用内动作只走 `actionDetectors.mjs` facade 和 `detectors/*` 子模块。
- 每轮 Agent 会生成 `agent.decision`：意图、置信度、工作流、风险等级、记忆模式、已选工具、已选动作和下一步。前端调试模式在聊天气泡里展示这张决策卡，用来回答“为什么这轮调用了这些能力”。
- 高风险动作继续由 `risk_gate` 和 `tool_governance` 收口；提醒、任务、记忆候选等应用动作保留 `requiresConfirmation`，不能越过用户确认。
- 文档/图片能力边界由 `attachment_guide` 明确说明：当前版本可以处理粘贴文本、公开网页链接和工作区文件扫描任务，但聊天框的图片/拍摄/文件按钮还没有接入上传、OCR、PDF/DOCX 解析或多模态图片理解，不能假装已经能看上传附件。

## 云端备份

- 云端 SQLite 数据库默认来自 `YURI_NEST_DB_PATH`，备份目录默认是 `./data/backups`，服务器可用 `YURI_NEST_BACKUP_DIR` 覆盖。
- 每次 `PUT /api/cloud/state` 覆盖云端快照前，如果已有旧快照，后端会先用 SQLite `VACUUM INTO` 生成一份一致性备份。
- 云端备份接口都需要云同步口令：`GET /api/cloud/backups` 列表，`POST /api/cloud/backups` 手动创建，`GET /api/cloud/backups/:fileName` 下载。
- `npm run backup:cloud-db` 可以在服务器上手动或定时运行，默认保留最近 24 份，可用 `YURI_NEST_MAX_BACKUPS` 调整。

## 近期路线

1. MVP：聊天、角色切换、长期记忆、世界树、设置、导入导出。
2. 体验版：PWA 安装、语音输入/朗读、主题、Live2D 占位。
3. 记忆版：候选记忆审核中心、冲突检测、记忆时间线、事件账本、关键词权重、来源证据、版本回滚、使用日志、聊天页记忆调用可视化和误用反馈闭环。后续再补“原地改写记忆”和“限定角色/场景使用”。
4. 百合帝国版：小说角色卡导入、CP 关系图、世界观知识库、插画/Live2D 资源绑定。
