# AI Coding Plan Monitor - 需求文档

## 1. 背景与目标

用户在使用智谱 AI 的 Coding Plan 时，需要在桌面上查看额度使用情况。为了更方便地监控用量，需要一个本地运行的桌面应用，实时展示智谱 AI 的额度消耗数据。

**目标：** 构建一个 macOS 桌面应用，在本地持续运行，一目了然地展示智谱 AI Coding Plan 的使用情况。

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

### 2.2 数据刷新

- 启动时立即获取一次数据
- 每分钟自动刷新
- 提供手动刷新按钮，显示加载状态和上次更新时间

### 2.3 错误处理

- 未配置 API Key 时，显示提示信息引导用户配置
- API 请求失败时，在卡片内显示错误信息
- 全局异常错误提示

### 2.4 配置管理

- API Key 通过 `.env.local` 文件配置（环境变量方式）
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
| 构建 | volta run yarn tauri:dev（开发）/ volta run yarn tauri:build（发布） |

---

## 4. UI 设计

```
┌─────────────────────────────┐
│  AI Coding Plan Monitor     │  ← 标题栏
├─────────────────────────────┤
│                             │
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
│       └── RefreshButton.tsx  # 刷新按钮
└── src-tauri/
    ├── Cargo.toml             # Rust 依赖
    ├── tauri.conf.json        # Tauri 配置
    ├── capabilities/
    │   └── default.json       # 权限配置
    └── src/
        ├── main.rs            # Rust 主入口
        └── lib.rs             # 命令注册
```

---

## 6. 数据流

```
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
App.tsx
 ├── ZhipuCard
 └── RefreshButton
```

前端通过浏览器 `fetch()` 直接调用智谱 API，不经过 Tauri Rust 后端。

---

## 7. 已知限制与后续计划

1. **API Key 明文存储** — 环境变量在构建后嵌入前端，适用于本地个人使用的场景
2. **无历史数据** — 当前仅展示实时数据，后续可考虑添加用量趋势图
3. **Kimi 支持** — Kimi 集成暂时移除，后续待 API 稳定后重新接入
