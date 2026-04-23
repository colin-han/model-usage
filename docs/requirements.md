# AI Coding Plan Monitor - 需求文档

## 1. 背景与目标

用户在使用智谱 AI 的 Coding Plan 和 Windsurf 时，需要在桌面上查看额度使用情况。为了更方便地监控用量，需要一个本地运行的桌面应用，实时展示各 AI 工具的配额消耗数据。

**目标：** 构建一个 macOS 桌面应用，在本地持续运行，一目了然地展示智谱 AI 和 Windsurf 的配额使用情况。

---

## 2. 功能需求

### 2.1 智谱 AI 额度展示

展示当前账户下各维度的限额和使用情况：

| 限额项 | 说明 |
|--------|------|
| Token 限额 · 每五小时 | 展示使用百分比、进度条、重置倒计时 |
| Token 限额 · 每周 | 展示使用百分比、进度条、重置倒计时 |
| MCP每月额度 | 展示使用百分比、进度条、重置倒计时、剩余/总量 |

账户等级标签（如 `pro`）显示在卡片标题旁。

详细 API 文档参见 [docs/zhipu-api.md](zhipu-api.md)。

数据来源：智谱 API `GET https://bigmodel.cn/api/monitor/usage/quota/limit`

### 2.2 Windsurf 配额展示

展示每日/每周配额使用情况：

| 配额项 | 时间窗口 | 说明 |
|--------|----------|------|
| 每日配额 | 24 小时 | 展示使用百分比、进度条、重置倒计时、时间进度 |
| 每周配额 | 168 小时 | 展示使用百分比、进度条、重置倒计时、时间进度 |

计划名称（如 `Teams`）显示在卡片标题旁。

详细 API 文档参见 [docs/windsurf-api.md](windsurf-api.md)。

数据来源：Windsurf Cloud API（逆向工程）
- API Key 从本地 SQLite 数据库自动读取
- 请求通过 Tauri Rust 后端代理

### 2.3 进度条颜色规则

所有配额项使用统一的颜色规则：

| 条件 | 颜色 | 说明 |
|------|------|------|
| 使用% > 时间% | 红色 | 使用速度超过时间进度（需注意）|
| 使用% ≤ 时间% | 绿色 | 使用速度正常 |
| 使用% ≥ 90% | 红色 | 配额即将耗尽（无时间对比时）|
| 使用% ≥ 70% | 黄色 | 配额使用较多 |
| 使用% < 70% | 青色 | 配额充足 |

### 2.4 数据刷新

- 启动时立即获取一次数据
- 每分钟自动刷新
- 提供手动刷新按钮，显示加载状态和上次更新时间

### 2.5 错误处理

- 智谱 API：未配置 API Key 时，显示提示信息引导用户配置
- Windsurf：未安装或未登录时，显示友好错误信息
- API 请求失败时，在卡片内显示错误信息
- 全局异常错误提示

### 2.6 配置管理

- 智谱 API Key 通过 `.env.local` 文件配置（环境变量方式）
- Windsurf API Key 自动从本地 SQLite 读取（无需配置）
- 提供 `.env.local.example` 作为模板
- `.env.local` 必须在 `.gitignore` 中，不提交到版本控制

环境变量：
```
VITE_ZHIPU_API_KEY=    # 智谱 AI API Key
```

---

## 3. 非功能需求

| 项目 | 要求 |
|------|------|
| 平台 | macOS 桌面应用 |
| 窗口大小 | 480 x 600，可调整 |
| 技术栈 | Tauri v2 + React + TypeScript + Tailwind CSS |
| 包管理 | volta run yarn |
| 构建 | volta run yarn tauri:dev（开发）/ volta run yarn tauri:build（发布）|
| Rust 依赖 | rusqlite（读取 SQLite 数据库）|

---

## 4. UI 设计

```
┌─────────────────────────────┐
│  AI Coding Plan Monitor     │  ← 标题栏
├─────────────────────────────┤
│                             │
│  🌊 Windsurf         [Teams]│  ← WindsurfCard
│                             │
│  每日配额                   │
│         24.5%    ██░░░░░░░ │ ← 配额进度（红色表示超速）
│         50.0%    ██████░░░ │ ← 时间进度（白色半透明）
│  重置: 5小时30分钟后        │
│                             │
│  每周配额                   │
│         39.8%    ████░░░░░ │
│         55.0%    ███████░░ │
│  重置: 3天2小时后           │
│                             │
├─────────────────────────────┤
│  🤖 智谱 AI           [pro] │  ← ZhipuCard
│                             │
│  Token 限额 · 每五小时       │
│              29.0%    ██░░░ │
│  重置: 2小时30分钟后         │
│                             │
│  Token 限额 · 每周          │
│               7.0%    █░░░░ │
│  重置: 6天7小时后            │
│                             │
│  MCP每月额度                │
│               0.0%    ░░░░░ │
│  重置: 30天6小时后  1000/1000│
│                             │
│  🔄 刷新    上次更新: 14:30 │  ← RefreshButton
│                             │
│  数据每分钟自动刷新          │  ← 说明
│                             │
└─────────────────────────────┘
```

---

## 5. 文件结构

```
model-usage/
├── .env.local                 # API Key 配置（不提交）
├── .env.local.example         # API Key 模板
├── index.html                 # HTML 入口
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── docs/
│   ├── requirements.md        # 需求文档
│   ├── zhipu-api.md           # 智谱 API 设计文档
│   ├── windsurf-api.md        # Windsurf API 设计文档
│   └── screenshots/           # 测试截图
├── src/
│   ├── main.tsx               # React 入口
│   ├── App.tsx                # 主应用组件
│   ├── index.css              # Tailwind CSS 入口
│   ├── vite-env.d.ts          # Vite 类型声明
│   ├── types/
│   │   └── index.ts           # TypeScript 类型定义
│   ├── hooks/
│   │   └── useUsageData.ts    # 数据获取 Hook
│   └── components/
│       ├── ZhipuCard.tsx      # 智谱数据卡片
│       ├── WindsurfCard.tsx   # Windsurf 数据卡片
│       └── RefreshButton.tsx  # 刷新按钮
└── src-tauri/
    ├── Cargo.toml             # Rust 依赖（含 rusqlite）
    ├── tauri.conf.json        # Tauri 配置
    ├── capabilities/
    │   └── default.json       # 权限配置
    └── src/
        ├── main.rs            # Rust 主入口
        ├── lib.rs             # 命令注册
        └── api.rs             # API 命令实现
            ├── get_windsurf_api_key()    # 读取 SQLite API Key
            ├── fetch_windsurf_quota()    # 获取 Windsurf 配额
            └── fetch_zhipu_quota()       # 获取智谱配额
```

---

## 6. 数据流

```
智谱 AI（前端直接调用）:
.env.local
    │
    │  VITE_ZHIPU_API_KEY
    │
    ▼
useUsageData.ts ─── fetch() ────► https://bigmodel.cn/api/monitor/usage/quota/limit
    │                                    │
    │  ◄────── JSON Response ────────────┘
    │
    ▼
ZhipuCard

Windsurf（通过 Tauri 后端）:
~/Library/Application Support/Windsurf/User/globalStorage/state.vscdb
    │
    │  get_windsurf_api_key() 读取 SQLite
    │
    ▼
Tauri Rust (api.rs) ──► https://server.codeium.com/.../GetUserStatus
    │                      │
    │  ◄──── JSON ─────────┘
    │
    ▼
useUsageData.ts ─── invoke() ────► Tauri 命令
    │
    ▼
WindsurfCard
```

---

## 7. 已知限制与后续计划

1. **API Key 明文存储** — 环境变量在构建后嵌入前端，适用于本地个人使用的场景
2. **无历史数据** — 当前仅展示实时数据，后续可考虑添加用量趋势图
3. **Windsurf API 非官方** — 基于逆向工程，可能随时变更
4. **macOS 依赖** — SQLite 路径硬编码为 macOS 路径，跨平台支持待实现
