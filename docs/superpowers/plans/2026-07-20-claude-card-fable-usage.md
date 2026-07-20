# Claude 卡片 fable 5 额度显示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Claude Code 卡片新增「7 天 Fable」行，显示 fable 官方限额利用率% 与本地日志统计的 fable token 数。

**Architecture:** 后端从 `/api/oauth/usage` 新的 `limits` 数组中提取 `display_name=Fable` 的窗口(利用率% + 重置时间)，并在本地日志扫描时按 `claude-fable-` 前缀单独累加 token；前端在卡片新增一条复用现有 `UsageRow` 的展示行。

**Tech Stack:** Rust (Tauri v2, serde, reqwest, chrono) + React + TypeScript + Tailwind。

## Global Constraints

- 交互与代码注释使用中文。
- Node 包管理统一用 `volta run yarn`。
- TypeScript 禁止 `any`；每次改前端后必须 `volta run yarn lint` 且 0 errors。
- 禁止 `git commit --no-verify`；提交信息用中文；提交结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- Rust 改动后运行 `cargo test`（在 `src-tauri` 目录）与 `cargo check`。
- 数据来源固定：官方额度来自 `/api/oauth/usage` 的 `limits` 数组；本地 token 来自 `~/.claude/projects/**/*.jsonl`。

---

### Task 1: 后端 — 从 limits 数组提取 fable 官方额度窗口

**Files:**
- Modify: `src-tauri/src/api.rs`（新增结构体与 helper；`ClaudeOauthRaw`、`ClaudeCodeUsageResult`、`fetch_claude_usage_from_api`）
- Test: `src-tauri/src/api.rs`（文件末尾新增 `#[cfg(test)]` 模块）

**Interfaces:**
- Produces:
  - `struct ClaudeLimit { kind: Option<String>, percent: Option<f64>, resets_at: Option<String>, scope: Option<ClaudeLimitScope> }`
  - `fn extract_model_window(limits: &[ClaudeLimit], model_name: &str) -> Option<ClaudeOauthWindow>`
  - `ClaudeCodeUsageResult.seven_day_fable: Option<ClaudeOauthWindow>`（序列化为 `sevenDayFable`）
- Consumes: 现有 `ClaudeOauthWindow { utilization: f64, resets_at: Option<String> }`。

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/api.rs` 文件末尾新增：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_fable_window_from_limits() {
        let json = r#"[
            {"kind":"session","percent":2,"resets_at":"2026-07-20T12:29:59+00:00","scope":null},
            {"kind":"weekly_scoped","percent":7,"resets_at":"2026-07-26T00:59:59+00:00","scope":{"model":{"id":null,"display_name":"Fable"}}}
        ]"#;
        let limits: Vec<ClaudeLimit> = serde_json::from_str(json).unwrap();
        let w = extract_model_window(&limits, "fable").expect("应能找到 fable 窗口");
        assert_eq!(w.utilization, 7.0);
        assert_eq!(w.resets_at.as_deref(), Some("2026-07-26T00:59:59+00:00"));
    }

    #[test]
    fn returns_none_when_no_matching_model() {
        let json = r#"[{"kind":"weekly_scoped","percent":3,"scope":{"model":{"display_name":"Sonnet"}}}]"#;
        let limits: Vec<ClaudeLimit> = serde_json::from_str(json).unwrap();
        assert!(extract_model_window(&limits, "fable").is_none());
    }
}
```

- [ ] **Step 2: 运行测试确认失败（编译错误：类型/函数未定义）**

Run: `cd src-tauri && cargo test extracts_fable_window_from_limits`
Expected: FAIL —— 编译错误，`ClaudeLimit` / `extract_model_window` 未定义。

- [ ] **Step 3: 新增反序列化结构体**

在 `src-tauri/src/api.rs` 中 `ClaudeOauthWindow` 定义之后（约第 152 行后）插入：

```rust
// 官方 /api/oauth/usage 新版 limits 数组中的单条限额
#[derive(Debug, Deserialize)]
struct ClaudeLimit {
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    percent: Option<f64>,
    #[serde(default)]
    resets_at: Option<String>,
    #[serde(default)]
    scope: Option<ClaudeLimitScope>,
}

#[derive(Debug, Deserialize)]
struct ClaudeLimitScope {
    #[serde(default)]
    model: Option<ClaudeLimitModel>,
}

#[derive(Debug, Deserialize)]
struct ClaudeLimitModel {
    #[serde(default)]
    display_name: Option<String>,
}

// 从官方 limits 数组中按模型 display_name（忽略大小写全等）提取额度窗口
fn extract_model_window(limits: &[ClaudeLimit], model_name: &str) -> Option<ClaudeOauthWindow> {
    let needle = model_name.to_lowercase();
    limits.iter().find_map(|l| {
        let name = l.scope.as_ref()?.model.as_ref()?.display_name.as_ref()?.to_lowercase();
        if name == needle {
            Some(ClaudeOauthWindow {
                utilization: l.percent.unwrap_or(0.0),
                resets_at: l.resets_at.clone(),
            })
        } else {
            None
        }
    })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd src-tauri && cargo test extracts_fable_window_from_limits returns_none_when_no_matching_model`
Expected: PASS（2 passed）。

- [ ] **Step 5: 接入 raw 结构与结果结构**

在 `ClaudeOauthRaw`（约第 278-285 行）中，`seven_day_sonnet` 字段之后新增：

```rust
    #[serde(default)]
    limits: Option<Vec<ClaudeLimit>>,
```

在 `ClaudeCodeUsageResult`（约第 168-186 行）中，`seven_day_sonnet` 字段之后新增：

```rust
    #[serde(rename = "sevenDayFable")]
    pub seven_day_fable: Option<ClaudeOauthWindow>,
```

在 `fetch_claude_usage_from_api` 构造 `ClaudeCodeUsageResult` 处（约第 446-455 行），`seven_day_sonnet: raw.seven_day_sonnet,` 之后新增：

```rust
                    seven_day_fable: raw
                        .limits
                        .as_deref()
                        .and_then(|l| extract_model_window(l, "fable")),
```

- [ ] **Step 6: 编译验证**

Run: `cd src-tauri && cargo check`
Expected: 编译通过（无 error）。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/api.rs
git commit -m "feat: 后端从 limits 数组提取 fable 官方额度窗口

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 后端 — 本地日志统计 fable token

**Files:**
- Modify: `src-tauri/src/api.rs`（`ClaudeLocalUsage`、`scan_local_claude_usage`；新增 `model_is_fable` helper）
- Test: `src-tauri/src/api.rs`（复用 Task 1 的 `#[cfg(test)]` 模块）

**Interfaces:**
- Produces:
  - `fn model_is_fable(model: Option<&str>) -> bool`
  - `ClaudeLocalUsage.seven_day_fable_tokens: u64`（序列化为 `sevenDayFableTokens`）
- Consumes: 现有 `scan_local_claude_usage` 的窗口累加逻辑。

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/api.rs` 末尾的 `#[cfg(test)] mod tests` 内新增：

```rust
    #[test]
    fn model_is_fable_matches_prefix() {
        assert!(model_is_fable(Some("claude-fable-5")));
        assert!(model_is_fable(Some("claude-fable-6")));
        assert!(!model_is_fable(Some("claude-opus-4-8")));
        assert!(!model_is_fable(Some("claude-sonnet-5")));
        assert!(!model_is_fable(None));
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd src-tauri && cargo test model_is_fable_matches_prefix`
Expected: FAIL —— 编译错误，`model_is_fable` 未定义。

- [ ] **Step 3: 新增 helper**

在 `src-tauri/src/api.rs` 中 `scan_local_claude_usage` 函数定义之前（约第 200 行前）插入：

```rust
// 判断模型是否属于 fable 系列（兼容将来 fable-5.x / fable-6）
fn model_is_fable(model: Option<&str>) -> bool {
    model.map(|m| m.starts_with("claude-fable-")).unwrap_or(false)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd src-tauri && cargo test model_is_fable_matches_prefix`
Expected: PASS。

- [ ] **Step 5: `ClaudeLocalUsage` 新增字段**

在 `ClaudeLocalUsage`（约第 190-195 行）中，`seven_day_tokens` 之后新增：

```rust
    pub seven_day_fable_tokens: u64,
```

- [ ] **Step 6: 扫描循环累加 fable token**

在 `scan_local_claude_usage` 中，计数器声明处（约第 211-212 行 `let mut five_hour_tokens = 0u64;` 附近）新增：

```rust
    let mut seven_day_fable_tokens = 0u64;
```

在计算 `tokens` 之后、窗口累加处（约第 257-267 行），把窗口累加块改为：

```rust
                let Some(usage) = message.get("usage") else { continue };
                let model = message.get("model").and_then(|m| m.as_str());
                let tokens: u64 = ["input_tokens", "output_tokens", "cache_creation_input_tokens"]
                    .iter()
                    .map(|k| usage.get(*k).and_then(|x| x.as_u64()).unwrap_or(0))
                    .sum();
                if ts >= seven_day_start {
                    seven_day_tokens += tokens;
                    if model_is_fable(model) {
                        seven_day_fable_tokens += tokens;
                    }
                }
                if ts >= five_hour_start {
                    five_hour_tokens += tokens;
                }
```

在函数返回处（约第 272-275 行）改为：

```rust
    Ok(ClaudeLocalUsage {
        five_hour_tokens,
        seven_day_tokens,
        seven_day_fable_tokens,
    })
```

- [ ] **Step 7: 编译与测试验证**

Run: `cd src-tauri && cargo test`
Expected: 全部 PASS，且编译通过。

- [ ] **Step 8: 提交**

```bash
git add src-tauri/src/api.rs
git commit -m "feat: 本地日志按 fable 前缀统计 7 天 token 用量

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 前端 — 类型与卡片新增「7 天 Fable」行

**Files:**
- Modify: `src/types/index.ts`（`ClaudeCodeUsageData`、`ClaudeLocalUsage`）
- Modify: `src/components/ClaudeCodeCard.tsx`（`WindowKey`、`WINDOW_DURATIONS`、`WINDOW_TITLES`、`windows` 数组、`localTokens` 映射）

**Interfaces:**
- Consumes: 后端序列化字段 `sevenDayFable`（窗口）与 `sevenDayFableTokens`（本地 token）。

- [ ] **Step 1: 更新类型定义**

在 `src/types/index.ts` 的 `ClaudeCodeUsageData` 中，`sevenDaySonnet` 之后新增：

```ts
  sevenDayFable: ClaudeCodeUsageWindow | null;
```

在同文件 `ClaudeLocalUsage` 中，`sevenDayTokens` 之后新增：

```ts
  sevenDayFableTokens: number;
```

- [ ] **Step 2: 卡片新增窗口键、时长、标题**

在 `src/components/ClaudeCodeCard.tsx` 中：

`WindowKey`（约第 9 行）改为：

```ts
type WindowKey = 'fiveHour' | 'sevenDay' | 'sevenDayOpus' | 'sevenDaySonnet' | 'sevenDayFable';
```

`WINDOW_DURATIONS`（约第 11-16 行）中新增一项：

```ts
  sevenDayFable: 7 * 24 * 60 * 60 * 1000,
```

`WINDOW_TITLES`（约第 18-23 行）中新增一项：

```ts
  sevenDayFable: '7 天 Fable',
```

- [ ] **Step 3: 卡片渲染新增该行并接入本地 token**

在 `windows` 数组（约第 131-136 行）中，`sevenDaySonnet` 之后新增：

```ts
    { key: 'sevenDayFable', window: data.sevenDayFable },
```

将 `UsageRow` 的 `localTokens` 映射（约第 167-173 行）改为：

```tsx
            localTokens={
              key === 'fiveHour'
                ? data.localUsage?.fiveHourTokens
                : key === 'sevenDay'
                  ? data.localUsage?.sevenDayTokens
                  : key === 'sevenDayFable'
                    ? data.localUsage?.sevenDayFableTokens
                    : undefined
            }
```

- [ ] **Step 4: Lint 检查**

Run: `volta run yarn lint`
Expected: 0 errors。

- [ ] **Step 5: 提交**

```bash
git add src/types/index.ts src/components/ClaudeCodeCard.tsx
git commit -m "feat: Claude 卡片新增 7 天 Fable 额度行

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 端到端验证

**Files:** 无（仅运行验证）

- [ ] **Step 1: 启动应用**

Run: `volta run yarn tauri dev`
Expected: 应用启动，Claude Code 卡片出现「7 天 Fable」一行，显示官方利用率%（当前约 2%）、重置时间（约 7/26）与本地 fable token 数（`xxx tokens`）。

- [ ] **Step 2: 确认无异常**

检查该行进度条颜色、重置时间、token 标注显示正常；其余行(5 小时 / 7 天)不受影响。

---

## Self-Review

**1. Spec coverage:**
- 官方 fable 利用率%(limits 提取) → Task 1 ✓
- 本地 fable token 统计(claude-fable- 前缀，7 天窗口) → Task 2 ✓
- 前端类型 + 卡片新增行 + token 标注 → Task 3 ✓
- 端到端验证(cargo check / cargo test / lint / tauri dev) → 各 Task + Task 4 ✓
- 非目标(不动 opus/sonnet、不通用化 limits、5 小时不单独统计 fable) → 计划未触及这些，符合 ✓

**2. Placeholder scan:** 无 TBD/TODO，每步含具体代码与命令。✓

**3. Type consistency:**
- 后端 `seven_day_fable` → serde `sevenDayFable` → 前端 `sevenDayFable` ✓
- 后端 `seven_day_fable_tokens`(camelCase) → `sevenDayFableTokens` → 前端 `sevenDayFableTokens` ✓
- `extract_model_window` / `model_is_fable` 签名在定义与调用处一致 ✓
- `ClaudeOauthWindow { utilization, resets_at }` 复用一致 ✓
