# 百合小窝 / Yuri Nest

网页端 AI 百合陪伴应用。它是妹妹“百合帝国”的应用侧起点，当前重点不是做一次性聊天 demo，而是把角色、长期记忆、世界树、本地/云端数据和可控的记忆主权慢慢打磨成长期可用的陪伴花园。

线上预览：

- https://ctnnyy-oss.github.io/yuri-nest/

当前仓库、部署路径和服务器技术名已经统一为 `yuri-nest`，面向用户的产品名是“百合小窝 / Yuri Nest”。

## 当前功能

- 聊天工作台：支持角色切换、上下文提示、模型代理失败时的本地兜底回复。
- 角色卡：已内置姐姐大人、雾岛怜、林秋实等角色雏形。
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

复制 `.env.local.example` 为 `.env.local`，可以先填入服务器默认模型服务：

```env
AI_API_KEY=你的密钥
AI_BASE_URL=http://127.0.0.1:18788/v1
AI_MODEL=deepseek-v4-flash
AI_MAX_TOKENS=4096
AI_ESCAPE_UNICODE_CONTENT=false
```

当前按妹妹单人使用处理：前端直接连接服务器，聊天、记忆、设置和模型配置会自动同步到云端。模型 API Key 保存在服务器模型保险箱，不保存在浏览器里。

没有填写密钥时，应用会使用本地兜底回复，方便先验证界面、角色和记忆流程。公开给多用户使用前，需要升级为注册/登录系统，让每个用户拥有独立聊天、记忆、云端数据和模型密钥空间。

## 云端同步

前端公开页面不保存 API Key。云端同步走后端服务；当前单人使用阶段默认直连服务器，不要求登录或口令。

敏感配置不要提交到 GitHub：

- `secrets/`
- `.env.local`
- 服务器 `/opt/yuri-nest/.env`

本地开发阶段仍然默认免口令直连，方便妹妹调试。生产/公网模式会默认要求 `YURI_NEST_SYNC_TOKEN`，聊天授权开启时 `/api/chat` 也会走同一口令校验；模型保险箱在生产环境需要 `YURI_NEST_MODEL_SECRET` 保护服务器保存的模型密钥。

当前后端服务名：

- `yuri-nest-api.service`
- `yuri-nest-tunnel.service`

如果 Cloudflare Quick Tunnel 地址变化，需要更新前端的 `VITE_API_BASE_URL` 后重新构建并推送。

## 构建和上线

GitHub Pages 使用仓库路径 `/yuri-nest/`，构建时必须带正确 base path：

```powershell
$env:VITE_BASE_PATH='/yuri-nest/'
$env:VITE_API_BASE_URL='<当前云端 API 地址>'
npm run build
```

构建后要检查 `dist/index.html` 是否引用：

```text
/yuri-nest/assets/...
```

`dist` 是当前 Pages 部署产物的一部分，提交前请确认没有把任何密钥、token 或 `.env.local` 加入 Git。

## 文档

- `docs/PROJECT_HANDOFF.md`：当前接手项目时最重要的交接文档（含部署、密钥、入口、版本回溯）。
- `docs/ARCHITECTURE.md`：项目结构、分层、模块边界。
- `docs/REFACTOR_PROGRESS.md`：架构重构进度记录（多阶段累积）。
- `docs/SAFETY_AND_MEMORY_GUARDS.md`：公网授权、模型保险箱 secret、自动记忆候选优先的守护说明。
- `docs/MEMORY_SYSTEM_HISTORY.md`：记忆系统设计原则、17 维代理指标、研究资料和演进时间线。
- `docs/USAGE.md`：给妹妹看的功能使用说明。

## 开发提醒

- 不要从零重做架构；先读交接文档，再沿当前 React + Vite + Node/Express 后端继续迭代。
- 记忆系统是项目灵魂，任何改动都要保留用户可编辑、可删除、可恢复、可永久删除的主权。
- UI 风格偏雾粉、浅粉、淡粉，可爱但不要死亡芭比粉。
- 妹妹零编程基础，功能说明和交互文案要尽量直观。
