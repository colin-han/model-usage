# 智谱 AI 额度 API 设计文档

## API 概述

智谱 AI 提供了额度查询接口，用于获取当前账户下各维度的使用限额和消耗情况。

### 接口信息

| 项目 | 说明 |
|------|------|
| 请求方式 | `GET` |
| URL | `https://bigmodel.cn/api/monitor/usage/quota/limit` |
| 认证方式 | `Authorization: Bearer <API_KEY>` |
| 响应格式 | JSON |

### 认证

通过请求头传递 API Key：

```
Authorization: Bearer <your_api_key>
```

API Key 在 `.env.local` 文件中配置为 `VITE_ZHIPU_API_KEY`。

---

## 响应结构

### 成功响应

```json
{
  "code": 200,
  "success": true,
  "msg": "success",
  "data": {
    "level": "pro",
    "limits": [
      {
        "type": "TOKENS_LIMIT",
        "unit": 3,
        "number": 5,
        "percentage": 29.0,
        "nextResetTime": 1774935262365
      },
      {
        "type": "TOKENS_LIMIT",
        "unit": 6,
        "number": 1,
        "percentage": 7.0,
        "nextResetTime": 1775469024997
      },
      {
        "type": "TIME_LIMIT",
        "unit": 5,
        "number": 1,
        "usage": 1000,
        "currentValue": 0,
        "remaining": 1000,
        "percentage": 0.0,
        "nextResetTime": 1777542624993,
        "usageDetails": [
          { "modelCode": "codegeex-4", "usage": 0 }
        ]
      }
    ]
  }
}
```

### 字段说明

#### 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | 状态码，200 表示成功 |
| `success` | boolean | 是否成功 |
| `msg` | string | 状态消息 |
| `data` | object | 数据主体 |

#### data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `level` | string | 账户等级（如 `pro`） |
| `limits` | array | 限额项列表 |

#### limit 项字段

| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 限额类型：`TOKENS_LIMIT`（Token 限额）或 `TIME_LIMIT`（时长限额） |
| `unit` | number | 是 | 时间单位枚举 |
| `number` | number | 是 | 限制数量 |
| `percentage` | number | 是 | 已使用百分比 (0-100) |
| `nextResetTime` | number | 是 | 重置时间戳（毫秒） |
| `usage` | number | 否 | TIME_LIMIT 时的总量（分钟） |
| `currentValue` | number | 否 | TIME_LIMIT 时的当前已用值 |
| `remaining` | number | 否 | TIME_LIMIT 时的剩余量 |
| `usageDetails` | array | 否 | 按模型的用量明细 |

#### usageDetails 项

| 字段 | 类型 | 说明 |
|------|------|------|
| `modelCode` | string | 模型代码（如 `codegeex-4`） |
| `usage` | number | 使用量 |

---

## unit 枚举映射

| unit 值 | 含义 | 界面标签 |
|---------|------|----------|
| 3 | 每 5 小时 | 每五小时 |
| 5 | 每月 | 每月 |
| 6 | 每周 | 每周 |

---

## 限额类型与 UI 标签映射

| type + unit 组合 | 界面显示标签 |
|------------------|-------------|
| `TOKENS_LIMIT` + 3 | Token 限额 · 每五小时 |
| `TOKENS_LIMIT` + 6 | Token 限额 · 每周 |
| `TIME_LIMIT` + 5 | MCP每月额度 |

---

## 错误响应

当 API Key 无效或请求失败时：

```json
{
  "code": 401,
  "success": false,
  "msg": "Unauthorized"
}
```

| HTTP 状态码 | 含义 |
|-------------|------|
| 401 | API Key 无效或未提供 |
| 其他非 200 | 服务端错误 |

---

## 前端解析逻辑

```typescript
// 判断请求成功
if (!json.success) throw new Error(`API 错误: ${json.msg || json.code}`);

// 解析 limits 数组
const limits = json.data.limits.map(limit => ({
  type: limit.type,
  unit: limit.unit,
  unitLabel: UNIT_LABELS[limit.unit],  // 查表映射
  percentage: limit.percentage,
  nextResetTime: limit.nextResetTime,  // 毫秒时间戳，用于倒计时
  // TIME_LIMIT 专属字段
  usage: limit.usage,
  remaining: limit.remaining,
}));
```

---

## 注意事项

1. **时间戳为毫秒级**：`nextResetTime` 是 13 位毫秒时间戳，前端需减去 `Date.now()` 计算倒计时
2. **percentage 范围**：0-100 的浮点数，界面显示时保留一位小数
3. **TIME_LIMIT 的 usage 字段**：表示总量（单位为分钟），`remaining` 为剩余量
4. **CORS**：浏览器直接 fetch 可能有 CORS 限制，当前通过 Vite dev server 代理或直接请求（取决于智谱服务端配置）
