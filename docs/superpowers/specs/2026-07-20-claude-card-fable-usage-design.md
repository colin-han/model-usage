# Claude 卡片增加 fable 5 使用额度显示 — 设计文档

日期:2026-07-20
状态:已确认,待实现

## 背景

应用(Tauri v2 桌面用量监控)的 Claude Code 卡片当前展示 5 小时窗口、7 天窗口的官方限额利用率,以及本地日志统计的 token 数量。用户希望在该卡片中增加 **fable 5** 模型的使用额度显示。

实际调用 `/api/oauth/usage` 确认:

- 老的 per-model 字段 `seven_day_opus`、`seven_day_sonnet` 目前返回 `null`(卡片里这两条实际已不显示)。
- fable 的官方额度存在于新的 `limits` 数组中,形如:

  ```json
  {
    "kind": "weekly_scoped",
    "group": "weekly",
    "percent": 2,
    "resets_at": "2026-07-26T00:59:59+00:00",
    "scope": { "model": { "id": null, "display_name": "Fable" } },
    "is_active": false
  }
  ```

- 本地日志 `~/.claude/projects/**/*.jsonl` 中 `"model":"claude-fable-5"` 的 assistant 消息大量存在,可按模型统计 token。

## 目标

在 Claude Code 卡片新增一条 **"7 天 Fable"** 显示:

- **官方利用率%**:来自 `limits` 数组中 `scope.model.display_name == "Fable"` 那条的 `percent` + `resets_at`。
- **本地 fable token**:来自本地日志统计的 7 天窗口内 `claude-fable-*` 模型 token 总量。

形态与现有窗口行完全一致(利用率进度条 + 时间对比细条 + 重置时间 + `"xxx tokens"` 标注)。

## 非目标(YAGNI)

- 不改动 opus/sonnet 的处理(仍读老字段,现为 null 自动隐藏)。
- 不把 `limits` 数组做成通用化的 per-model 动态解析。
- 不单独统计 fable 的 5 小时窗口 token(Fable 行为 7 天窗口)。

## 详细设计

### 后端 `src-tauri/src/api.rs`

1. **新增反序列化结构**,解析 `limits` 数组条目:
   - `ClaudeLimit { kind: Option<String>, percent: Option<f64>, resets_at: Option<String>, scope: Option<ClaudeLimitScope> }`
   - `ClaudeLimitScope { model: Option<ClaudeLimitModel> }`
   - `ClaudeLimitModel { display_name: Option<String> }`
2. **`ClaudeOauthRaw`** 增加字段 `limits: Option<Vec<ClaudeLimit>>`。
3. **`ClaudeCodeUsageResult`** 增加字段 `seven_day_fable: Option<ClaudeOauthWindow>`,serde rename 为 `sevenDayFable`。
4. **提取 helper**:遍历 `limits`,找到 `scope.model.display_name` 忽略大小写等于 `"fable"` 的第一条,映射为 `ClaudeOauthWindow { utilization: percent, resets_at }`;找不到则 `None`。在 `fetch_claude_usage_from_api` 组装 `ClaudeCodeUsageResult` 时赋值给 `seven_day_fable`。
5. **本地 token 统计**:
   - `ClaudeLocalUsage` 增加字段 `seven_day_fable_tokens: u64`(camelCase 序列化为 `sevenDayFableTokens`)。
   - `scan_local_claude_usage` 循环中读取 `message.model`,当其以 `claude-fable-` 前缀开头且时间戳在 7 天窗口起点之后时,把该消息 token 累加到 fable 桶。
   - 返回值带上 `seven_day_fable_tokens`。

### 前端

1. **`src/types/index.ts`**:
   - `ClaudeCodeUsageData` 增加 `sevenDayFable: ClaudeCodeUsageWindow | null`。
   - `ClaudeLocalUsage` 增加 `sevenDayFableTokens: number`。
2. **`src/components/ClaudeCodeCard.tsx`**:
   - `WindowKey` 联合类型增加 `'sevenDayFable'`。
   - `WINDOW_DURATIONS` 增加 `sevenDayFable: 7 天`。
   - `WINDOW_TITLES` 增加 `sevenDayFable: '7 天 Fable'`。
   - `windows` 数组在 sonnet 之后增加 `{ key: 'sevenDayFable', window: data.sevenDayFable }`。
   - 该行 `localTokens` 取 `data.localUsage?.sevenDayFableTokens`。

### 展示行为

- fable 官方窗口存在(非 null)才显示该行,否则 `filter` 掉,与现有行一致。
- 进度条颜色沿用现有 `getUsageColor`(利用率 vs 时间进度)逻辑。

## 验证

1. **后端单元测试**:
   - 用真实样例 JSON(含 `limits` 数组)反序列化,断言能提取出 Fable 的 `percent` 与 `resets_at`。
   - 用小样例 jsonl 内容测 `claude-fable-` 前缀的 token 累加(可将扫描核心逻辑抽为可测函数,或对解析逻辑做针对性测试)。
2. **`cargo check`** 通过。
3. **端到端**:`tauri dev` 运行,卡片出现 "7 天 Fable" 一行,显示官方利用率%(当前约 2%、重置 7/26)与本地 fable token 数。

## 风险 / 备注

- `limits` 中 fable 条目的 `is_active` 当前为 `false`,但仍有 `percent`/`resets_at`,照常显示。
- 模型名用 `claude-fable-` 前缀匹配,兼容将来 fable-5.x / fable-6。
- 若 Anthropic 后续调整 `limits` 结构,该 helper 需相应更新(已隔离在单一函数内,影响面小)。
