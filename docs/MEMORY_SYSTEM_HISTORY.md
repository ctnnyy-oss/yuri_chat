# 记忆系统设计与演进记录

> 这份文件合并了 2026-05 期间记忆系统从 0 到 17/17 的设计原则、目标、任务、研究摘记和最终结果。原本散在 5 个文件里：`HUMAN_MEMORY_TARGET.md`、`HUMAN_MEMORY_80_TASK.md`、`HUMAN_MEMORY_90_TASK.md`、`DEEP_RESEARCH_MEMORY_CLOSURE.md`、`MEMORY_AGENT_UPGRADE_RESEARCH.md`，2026-05-07 合并归档以减少重复。

## 当前结果（2026-05-07）

```powershell
npm run test:memory
```

输出：

- `Memory eval score: 13/13 (100%)` —— 旧事召回用例
- `Human-memory proxy gate: 17/17 (100%)` —— 17 维人类记忆代理指标

测试套件覆盖语义召回、程序记忆、项目事实、事件时间线、关联回忆、隐私边界、复习加固、整合重巩固、可解释反思、向量近邻、可持久语义签名、Embedding 缓存、外部 Embedding 查询、高噪声抗干扰、反馈校准、时间线定位、情绪显著性。

## 17 维人类记忆代理指标

| 维度 | 实现要点 |
|---|---|
| 语义召回 | 关键词 + 概念线索扩展 + 中文 2-3 字片段相似度 |
| 程序/偏好记忆 | procedure 类型 + 高权重核心锚点 |
| 项目事实记忆 | project / profile，按 scope 分层调用 |
| 事件时间线 | episode + 日期/阶段/前后顺序进入评分 |
| 关联回忆 | 同来源 / 同标签可串起多条记忆 |
| 隐私边界 | silent / contextual / explicit 提及策略；回忆模式不泄露 silent |
| 复习加固 | 调用后 `accessCount++` / `memoryStrength++` / `nextReviewAt` 更新 |
| 整合与重巩固 | reflection 候选 + value conflict 检测 + 版本线 |
| 可解释反思 | 候选附带"可沉淀原则 / 证据 / 时间线 / 仍需确认" |
| 向量近邻检索 | 本地稀疏向量索引；明确领域问题避开向量噪声 |
| 可持久语义签名 | `semanticSignature` + `semanticSignatureVersion`，向量索引按签名分桶但不硬过滤 |
| Embedding 缓存底座 | `AppState.memoryEmbeddings`；迁移/保存/备份自动补齐 |
| 外部 Embedding 查询向量 | 显式旧事询问时 3.5s 内尝试同模型 query vector，失败回落本地 |
| 高噪声抗干扰 | 评测集含高权重泛化干扰项，确保具体焦虑不被泛化记忆压住 |
| 反馈校准 | 冷却/少用/问起再提/归档会调整 `memoryStrength` 和 `emotionalSalience` |
| 时间线定位 | 识别"5月5号 / 五一最后一天 / 之前 / 之后"等线索 |
| 情绪显著性 | `emotionalSalience` 让焦虑/担心/反复强调的记忆更难沉下去 |

## 设计原则（来自前沿研究）

### 记忆系统

1. **短期与长期分开** —— LangGraph 的 thread-scoped short-term + 跨会话 long-term。本项目对应：最近对话、会话摘要、长期记忆、scope、prompt block。
2. **语义、事件、流程三类分工** —— LangGraph 的 semantic / episodic / procedural。本项目对应 `stable / episode / working` 与 `profile / event / procedure / reflection`。**不要把一次性事件写成稳定规则**。
3. **层级记忆与上下文预算** —— MemGPT 的有限上下文里管理多级记忆。本项目 `promptBuilder.ts` 沿用边界、稳定事实、关系、项目、事件的预算顺序。
4. **观察、反思、计划闭环** —— Generative Agents 的 observation / reflection / planning。本项目当前是轻量版：候选捕捉、人工审核、调用日志、守护台复查。
5. **人类可干预** —— 候选、来源、版本、误用反馈都要可见。"记忆流水线"把捕捉、校准、调用、修剪四段直接放到记忆页。

### Agent 能力

1. **工具有清楚契约** —— OpenAI Tools / MCP tools 都强调 tool name / schema / structured result。本项目 `toolDetectors / toolExecutors / actionDetectors` 走白名单 + facade。
2. **工具调用可见** —— MCP 建议 UI 展示哪些工具暴露给模型。本项目新增 `agent.decision` 摘要：意图、工作流、风险、记忆模式、下一步。
3. **护栏与追踪不是附加品** —— OpenAI Agents SDK 把 guardrails / human review / tracing 放在核心。本项目有 `risk_gate / tool_governance / response_quality_gate`。
4. **协议化资源与提示词** —— 后续云端版本可把记忆空间、角色档案、世界树、任务队列抽象成可列出的资源。

## 设计决策

### 已采纳

- **作用域优先**：每条记忆都有 global / relationship / character_private / project / world / world_branch / conversation / temporary 八档 scope。
- **候选审核**：自动捕捉先进入 candidate，确认前不参与聊天提示。
- **冲突检查**：覆盖全局关系串戏、重复不一致、偏好相反等高频问题。
- **Prompt 打包**：发送前按边界、稳定资料、关系、项目、事件分层注入，不全量塞入。
- **用户主权**：编辑、删除、回收、恢复、永久删除、防复活 tombstone 全部保留。
- **透明性**：聊天页显示本轮记忆，记忆页显示最近调用，档案页显示来源、版本、调用记录。
- **提及时机**：proactive / contextual / explicit / silent 四档。
- **冷却机制**：`cooldownUntil` 让刚被纠正或暂时敏感的记忆不参与检索。
- **核心锚点**：稳定 + 置顶 + 高权重高可信 + procedure 不会因关键词漏召回而被压下去。
- **回忆模式**：用户问"以前 / 上次 / 还记得"时召回上限 12 → 18，放宽事件/反思/曾调用记忆。
- **本地稀疏向量 + 可持久语义签名**：模糊旧事走向量近邻，明确领域问题避开向量噪声。
- **Embedding 缓存 + 外部 query 向量**：底座已搭，可平滑接 OpenAI-compatible embedding 模型。

### 暂时不做

- 不急着上向量数据库。当前结构化偏好/关系/项目/边界用可解释检索更稳。
- 不急着上细粒度后端同步。当前已有云端快照，下一步先把同步边界想清楚再做事件日志级。
- 不急着做多智能体记忆委员会。优先打磨单人陪伴。
- 不急着把聊天全文 embedding。先保留来源、摘要和事件层，等数据量大再接 embedding adapter。

### 下一步（仍未完成）

1. 真正可用的外部 embedding 模型 + ANN 向量检索（当前底座已搭）。
2. **LLM 后台反思整理**，替代当前规则启发式 reflection 候选。
3. 更大规模真实聊天旧事评测集。
4. 云端多设备**增量同步与冲突合并**。
5. 图片/文档/语音内容自动入记忆（当前必须先转文本或链接）。
6. 用真实反馈校准 `emotionalSalience`，让"重要"不只是关键词判断。

## 资料来源

- [LangGraph Memory Concepts](https://docs.langchain.com/oss/python/concepts/memory)
- [LangGraph Add Memory](https://docs.langchain.com/oss/python/langgraph/add-memory)
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560)
- [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)
- [OpenAI Tools Guide](https://developers.openai.com/api/docs/guides/tools)
- [OpenAI Agents SDK Guide](https://developers.openai.com/api/docs/guides/agents)
- [OpenAI Agents SDK Tracing](https://github.com/openai/openai-agents-python/blob/main/docs/tracing.md)
- [MCP Tools Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Resources Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [MCP Prompts Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)
- [NCBI Bookshelf: Physiology, Long Term Memory](https://www.ncbi.nlm.nih.gov/books/NBK549791/)
- [NCBI Bookshelf: Memory Reconsolidation or Updating Consolidation](https://www.ncbi.nlm.nih.gov/books/NBK3905/)
- [Frontiers: Using Self-Generated Cues to Facilitate Recall](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01830/full)

## 演进时间线

| 日期 | 阶段 |
|---|---|
| 2026-05-02 | Deep Research 收尾，确定记忆主权、候选审核、scope 优先、提及时机四档、cooldown 等核心原则 |
| 2026-05-05 早 | 80% 代理目标定下，识别 17 维人类记忆机制 |
| 2026-05-05 中 | 接入 LangGraph / MemGPT / Generative Agents / OpenAI Agents / MCP 研究，落地 agent.decision、记忆流水线、核心锚点、回忆模式 |
| 2026-05-05 晚 | 加入时间线定位、情绪显著性、可解释反思、向量近邻底座、可持久语义签名、Embedding 缓存、外部 query 向量；评测从 8 维扩到 17 维，全部 17/17 |
| 2026-05-05 末 | 安全加固：CAS 版本号冲突、候选合并防污染、语义墓碑防复活 |

## 继续规则

每次继续记忆系统改动时，先跑：

```powershell
npm run test:memory
```

如果失败，先修评测失败。如果通过，从"下一步"列表里挑最优先的项推进。
