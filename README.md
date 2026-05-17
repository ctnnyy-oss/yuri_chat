# 百合小窝 / yuri_chat

网页端 AI 百合陪伴应用。它是妹妹“百合帝国”的应用侧起点，当前重点不是做一次性聊天 demo，而是把角色、长期记忆、世界树、本地/云端数据和可控的记忆主权慢慢打磨成长期可用的陪伴花园。

线上预览：

- https://ctnnyy-oss.github.io/yuri_chat/

当前仓库、部署路径、服务器目录、systemd 服务名、包名和文档技术名已经统一为 `yuri_chat`，面向用户的产品名是“百合小窝 / yuri_chat”。

## 当前功能

- 聊天工作台：支持角色切换、上下文提示、模型代理失败时的本地兜底回复。
- 角色卡：已内置姐姐大人、雾岛怜、林秋实等角色雏形；自定义角色会通过 Persona V2 编译成人格宪法、关系图谱、说话样本、场景触发器、角色知识库和 OOC 守门。
- 长期记忆：支持用户画像、偏好、关系、项目、事件、规则、世界观、角色私有、禁忌和安全边界。
- 记忆主权：支持编辑、删除、恢复、永久删除、版本回滚、冷却、归档和防复活 tombstone。
- 记忆守护台：显示健康度、复查队列、事件账本、调用记录和最近更新。
- 聊天记忆透镜：每条助手回复可展开查看实际调用过的记忆，并能直接反馈误用记忆：冷却 7 天、少用、问起再提、标敏感或归档。
- 世界树：保存世界观节点和触发词，用于后续百合设定、角色和项目扩展。
- 数据管理：支持本地 IndexedDB 存储、导入导出、本机备份、云端同步和云端备份。
- 模型保险箱：服务器可保存多组模型供应商配置，支持 OpenAI-compatible 中转/官方兼容接口、Anthropic 官方和 Gemini 官方，前端不保存密钥原文。

## 启动

```powershell
npm install
npm run dev
```

打开终端显示的本地地址即可使用。

## 接入模型

复制 `.env.local.example` 为 `.env.local`，先配置本地后端和云端地址；模型 API Key 现在由每个账号在网页「模型」页保存：

```env
YURI_CHAT_AUTH_SECRET=本地随便填一串，生产用 openssl rand -hex 32 生成
YURI_CHAT_MODEL_SECRET=本地随便填一串，生产必须固定保存
YURI_CHAT_EMAIL_PROVIDER=log
YURI_CHAT_API_PORT=8787
VITE_API_BASE_URL=
```

登录后，聊天、记忆、设置和模型配置会按账号同步到云端。每个账号只使用自己保存的模型档案；模型 API Key 保存在服务器模型保险箱，不保存在浏览器里。

没有保存模型档案时，聊天会走本地兜底回复，方便先验证界面、角色和记忆流程。

## 云端同步

前端公开页面不保存 API Key。云端同步走后端服务；当前主流程使用账号登录后的 session 自动授权，不再要求用户手动填写云端口令。

敏感配置不要提交到 GitHub：

- `secrets/`
- `.env.local`
- 服务器 `/opt/yuri_chat/.env`

旧版 `YURI_CHAT_REQUIRE_CLOUD_AUTH` / `YURI_CHAT_SYNC_TOKEN` 仍保留为短期回滚入口；账号系统正常使用时走 session。模型保险箱在生产环境需要 `YURI_CHAT_MODEL_SECRET` 保护服务器保存的模型密钥。

公网部署还默认启用接口限流：`YURI_CHAT_RATELIMIT_CHAT` 控制 `/api/chat` 每 IP 每分钟次数（默认 30），`YURI_CHAT_RATELIMIT_CLOUD` 控制 `/api/cloud/*`（默认 60）。两个 health 接口不走限流，方便监控和前端启动检查。

自动云端保存默认会在覆盖前最多每 10 分钟创建一次 SQLite 备份，避免每条聊天都触发重备份；可用 `YURI_CHAT_AUTO_BACKUP_INTERVAL_MINUTES` 调整。手动云端备份仍可随时创建。

当前后端服务名：

- `yuri_chat-api.service`
- `yuri_chat-tunnel.service`

如果 Cloudflare Quick Tunnel 地址变化，需要更新前端的 `VITE_API_BASE_URL` 后重新构建并推送。

## 构建和上线

GitHub Pages 使用仓库路径 `/yuri_chat/`，构建时必须带正确 base path：

```powershell
$env:VITE_BASE_PATH='/yuri_chat/'
$env:VITE_API_BASE_URL='<当前云端 API 地址>'
npm run build
```

构建后要检查 `dist/index.html` 是否引用：

```text
/yuri_chat/assets/...
```

`dist` 是当前 Pages 部署产物的一部分，提交前请确认没有把任何密钥、token 或 `.env.local` 加入 Git。

## 验证

- `npm run test:persona`：检查 Persona V2 的人设编译、语气样本、场景触发、动态状态、运行时锚点和防破甲守门。
- `npm run verify:all`：串行跑 lint、TypeScript、架构审计、Agent、记忆和 Persona 回归。

## 文档

- `项目文档/PROJECT_HANDOFF.md`：当前接手项目时最重要的交接文档（含部署、密钥、入口、版本回溯）。
- `项目文档/ARCHITECTURE.md`：项目结构、分层、模块边界。
- `项目文档/REFACTOR_PROGRESS.md`：架构重构进度记录（多阶段累积）。
- `项目文档/SAFETY_AND_MEMORY_GUARDS.md`：公网授权、模型保险箱 secret、自动记忆候选优先的守护说明。
- `项目文档/MEMORY_SYSTEM_HISTORY.md`：记忆系统设计原则、17 维代理指标、研究资料和演进时间线。
- `项目文档/USAGE.md`：给妹妹看的功能使用说明。

## 开发提醒

- 不要从零重做架构；先读交接文档，再沿当前 React + Vite + Node/Express 后端继续迭代。
- 记忆系统是项目灵魂，任何改动都要保留用户可编辑、可删除、可恢复、可永久删除的主权。
- UI 风格偏雾粉、浅粉、淡粉，可爱但不要死亡芭比粉。
- 妹妹零编程基础，功能说明和交互文案要尽量直观。
