# Windsurf 配额 API 设计文档

## API 概述

Windsurf（Codeium）提供配额查询接口，用于获取当前账户的每日/每周配额使用情况。本文档基于逆向工程分析，API 可能随时变更。

### 接口信息

| 项目 | 说明 |
|------|------|
| 请求方式 | `POST` |
| URL | `https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus` |
| 认证方式 | 在请求体 metadata 中传递 `apiKey` |
| 响应格式 | JSON (Connect-RPC v1) |
| 协议头 | `Connect-Protocol-Version: 1` |

### API Key 获取

Windsurf API Key 存储在本地 SQLite 数据库中：

| 项目 | 说明 |
|------|------|
| 数据库路径 | `~/Library/Application Support/Windsurf/User/globalStorage/state.vscdb` |
| 表名 | `ItemTable` |
| 查询 Key | `windsurfAuthStatus` |
| API Key 字段 | `apiKey` (格式: `sk-ws-01-...`) |

---

## 请求结构

### 请求体

```json
{
  "metadata": {
    "apiKey": "sk-ws-01-...",
    "ideName": "windsurf",
    "ideVersion": "0.0.0",
    "extensionName": "windsurf",
    "extensionVersion": "0.0.0",
    "locale": "en"
  }
}
```

### 请求头

```
Content-Type: application/json
Connect-Protocol-Version: 1
```

---

## 响应结构

### 成功响应（简化版）

```json
{
  "userStatus": {
    "name": "User Name",
    "email": "user@example.com",
    "teamsTier": "TEAMS_TIER_TEAMS",
    "planStatus": {
      "planInfo": {
        "planName": "Teams"
      },
      "dailyQuotaRemainingPercent": 75.5,
      "weeklyQuotaRemainingPercent": 60.2,
      "dailyQuotaResetAtUnix": "1776931200",
      "weeklyQuotaResetAtUnix": "1777440000",
      "availableFlexCredits": 100000
    }
  }
}
```

### 字段说明

#### planStatus 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `planInfo.planName` | string | 计划名称（Teams, Pro, Free 等） |
| `dailyQuotaRemainingPercent` | number | 每日配额剩余百分比 (0-100) |
| `weeklyQuotaRemainingPercent` | number | 每周配额剩余百分比 (0-100) |
| `dailyQuotaResetAtUnix` | string | 每日配额重置时间（Unix 时间戳，字符串格式） |
| `weeklyQuotaResetAtUnix` | string | 每周配额重置时间（Unix 时间戳，字符串格式） |
| `availableFlexCredits` | number | Flex 积分余额（可选），负数表示无限制 |

#### 配额计算

- **已使用百分比** = `100 - remainingPercent`
- **时间窗口**: 每日配额为 24 小时，每周配额为 7 天（168 小时）
- **时间进度** = `(当前时间 - (重置时间 - 时间窗口)) / 时间窗口 × 100`

---

## 配额类型

| 类型 | 时间窗口 | 说明 |
|------|----------|------|
| 每日配额 | 24 小时 | 每天 UTC 0 点重置 |
| 每周配额 | 168 小时 | 每周 UTC 0 点重置 |

---

## 后端实现

### Rust 命令

```rust
// 从 SQLite 读取 API Key
#[tauri::command]
pub fn get_windsurf_api_key() -> Result<WindsurfApiKeyResult, String>

// 获取配额数据
#[tauri::command]
pub async fn fetch_windsurf_quota(apiKey: String) -> Result<WindsurfQuotaResult, String>
```

### 数据结构

```rust
pub struct WindsurfQuotaResult {
    pub plan_name: Option<String>,
    pub daily_quota: WindsurfQuotaInfo,
    pub weekly_quota: WindsurfQuotaInfo,
    pub flex_credits: Option<CreditInfo>,
}

pub struct WindsurfQuotaInfo {
    pub remaining_percent: f64,
    pub reset_at_unix: Option<String>,
}
```

---

## 前端显示逻辑

### 进度条颜色规则

| 条件 | 颜色 | 说明 |
|------|------|------|
| 使用% > 时间% | 红色 | 使用速度超过时间进度 |
| 使用% ≤ 时间% | 绿色 | 使用速度正常 |
| 使用% ≥ 90% | 红色 | 配额即将耗尽（无时间对比时）|
| 使用% ≥ 70% | 黄色 | 配额使用较多 |
| 使用% < 70% | 青色 | 配额充足 |

### 时间倒计时

```typescript
function formatResetTime(unixTimestampStr: string | null): string {
  if (!unixTimestampStr) return '未知时间';
  const unixTimestamp = parseInt(unixTimestampStr, 10);
  const resetTime = unixTimestamp * 1000;
  const now = Date.now();
  const diff = resetTime - now;

  // 计算天、小时、分钟
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

  // 格式化输出
  if (days > 0) return `${days}天${hours}小时后 (M/D HH:MM)`;
  if (hours > 0) return `${hours}小时${minutes}分钟后 (M/D HH:MM)`;
  return `${minutes}分钟后 (M/D HH:MM)`;
}
```

---

## 错误处理

| 错误类型 | 说明 | 处理方式 |
|----------|------|----------|
| 数据库不存在 | Windsurf 未安装 | 显示"未找到 Windsurf 安装或未登录" |
| API Key 无效 | 认证失败 | 显示"数据获取失败" |
| API 解析失败 | 响应结构变更 | 记录错误日志，显示友好错误信息 |

---

## 注意事项

1. **逆向工程 API** — 此 API 非官方公开接口，可能随时变更
2. **时间戳为字符串** — `dailyQuotaResetAtUnix` 和 `weeklyQuotaResetAtUnix` 是字符串格式的 Unix 时间戳（秒级）
3. **配额系统变更** — 2026 年 3 月从积分制改为配额制（daily + weekly）
4. **Flex 积分可选** — 某些计划可能没有 Flex 积分字段
5. **本地依赖** — 需要安装并登录 Windsurf IDE 才能获取 API Key

---

## 参考资源

- [OpenUsage - Windsurf Provider](https://github.com/robinebers/openusage/blob/main/docs/providers/windsurf.md)
- [Windsurf 官方文档](https://docs.windsurf.com/)
