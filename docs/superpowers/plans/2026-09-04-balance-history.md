# 余额历史记录与趋势展示 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三张余额卡（DeepSeek / 火山引擎 / 阿里云）每日记录余额到 SQLite，自动识别充值并计算每日花费，卡片底图显示 30 天 sparkline，点击弹出图表 modal。

**Architecture:** Rust 侧新增 `history.rs`，用 rusqlite 维护 `balance_daily` 表并暴露 `record_balance` / `get_balance_history` 两个 tauri command，充值检测与花费计算全部在后端完成。前端在 `useUsageData` 每次余额取成功后调用 `record_balance` 拿回历史，三张卡收敛成共享的 `BalanceCard`（含 `Sparkline` 底图），`App.tsx` 持有打开的 provider 并渲染 `BalanceHistoryModal`（手写 SVG 图表）。

**Tech Stack:** Tauri 2 / Rust（rusqlite 0.40 bundled、chrono）、React 19 + TypeScript、Tailwind 3、手写 SVG。

**Spec:** `docs/superpowers/specs/2026-09-04-balance-history-design.md`

## Global Constraints

- 总是用中文注释、中文错误信息、中文提交信息。
- TypeScript 禁止 `any`。
- node 命令一律走 `volta run yarn ...`；项目没有 `lint` 脚本，前端以 `volta run yarn build`（含 `tsc`）通过为准。
- Rust 测试在 `src-tauri` 目录运行 `cargo test`。
- 禁止 `git commit --no-verify`、禁止 `git add -f`。
- 提交信息末尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- 数据库路径固定为 `~/.config/model-usage/history.sqlite`；provider 白名单为 `deepseek` / `volcengine` / `aliyun`。
- 充值判定阈值 0.005，充值额按 10 元向上取整；花费 = 前一行余额 + 当天充值 − 当天余额。
- 卡片预警色：余额 < 2 红、< 5 黄；卡片高度保持约 88px。

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `src-tauri/Cargo.toml` | 新增 rusqlite 依赖 |
| `src-tauri/src/history.rs`（新建） | SQLite 建表、记录余额、充值检测、历史查询与花费计算、两个 command |
| `src-tauri/src/lib.rs` | 声明 `mod history`，注册 command |
| `src/types/index.ts` | 新增 `BalanceProvider`、`BalanceDay`，`UsageData.histories` |
| `src/hooks/useUsageData.ts` | 余额取成功后调用 `record_balance`，保存历史 |
| `src/components/Sparkline.tsx`（新建） | 卡片底图：折线 + 填充 + 充值点 |
| `src/components/BalanceCard.tsx`（新建） | 共享余额卡（方案 D 布局） |
| `src/components/DeepSeekCard.tsx` / `VolcengineCard.tsx` / `AliyunCard.tsx` | 改为薄封装，提取金额与附注后交给 `BalanceCard` |
| `src/components/BalanceHistoryModal.tsx`（新建） | 详情 modal 与 SVG 图表 |
| `src/App.tsx` | `openProvider` 状态、传 `onOpen`、渲染 modal |

---

### Task 1: Rust 历史模块核心逻辑（记录 + 充值检测）

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/history.rs`
- Modify: `src-tauri/src/lib.rs:1`

**Interfaces:**
- Produces:
  - `history::init_schema(conn: &Connection) -> Result<(), String>`
  - `history::record(conn: &Connection, provider: &str, balance: f64, day: &str, now: &str) -> Result<(), String>`
  - `history::round_up_recharge(diff: f64) -> f64`
  - `history::BalanceDay { day: String, balance: f64, recharge: f64, spend: Option<f64>, since_day: Option<String> }`（serde camelCase）

- [ ] **Step 1: 添加依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 末尾加入：

```toml
rusqlite = { version = "0.40", features = ["bundled"] }
```

- [ ] **Step 2: 写失败测试**

新建 `src-tauri/src/history.rs`，先只放结构骨架和测试：

```rust
use chrono::NaiveDate;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

// ===== 余额历史（保存到 ~/.config/model-usage/history.sqlite） =====

/// 允许记录历史的服务商白名单
pub const PROVIDERS: [&str; 3] = ["deepseek", "volcengine", "aliyun"];
/// 充值额取整步长（元）
const RECHARGE_STEP: f64 = 10.0;
/// 余额上涨超过该阈值视为充值，避免浮点误差误判
const RECHARGE_EPSILON: f64 = 0.005;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BalanceDay {
    pub day: String,
    pub balance: f64,
    pub recharge: f64,
    /// 前一行余额 + 当天充值 - 当天余额；没有前一行时为 None
    pub spend: Option<f64>,
    /// 前一行日期；与 day 不相邻时表示花费覆盖了断档区间
    pub since_day: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    fn row(conn: &Connection, provider: &str, day: &str) -> (f64, f64) {
        conn.query_row(
            "SELECT balance, recharge FROM balance_daily WHERE provider = ?1 AND day = ?2",
            params![provider, day],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap()
    }

    #[test]
    fn first_record_has_no_recharge() {
        let conn = mem_db();
        record(&conn, "deepseek", 42.18, "2026-09-01", "2026-09-01T10:00:00+08:00").unwrap();
        assert_eq!(row(&conn, "deepseek", "2026-09-01"), (42.18, 0.0));
    }

    #[test]
    fn same_day_overwrites_balance_and_keeps_recharge() {
        let conn = mem_db();
        record(&conn, "deepseek", 10.0, "2026-09-01", "t1").unwrap();
        record(&conn, "deepseek", 59.7, "2026-09-01", "t2").unwrap(); // 充值 50
        record(&conn, "deepseek", 58.2, "2026-09-01", "t3").unwrap(); // 正常消费
        assert_eq!(row(&conn, "deepseek", "2026-09-01"), (58.2, 50.0));
    }

    #[test]
    fn recharge_rounds_up_to_ten() {
        assert_eq!(round_up_recharge(49.7), 50.0);
        assert_eq!(round_up_recharge(24.6), 30.0);
        assert_eq!(round_up_recharge(10.0), 10.0);
        assert_eq!(round_up_recharge(0.5), 10.0);
    }

    #[test]
    fn recharge_compares_with_latest_previous_day() {
        let conn = mem_db();
        record(&conn, "aliyun", 20.0, "2026-08-30", "t1").unwrap();
        record(&conn, "aliyun", 44.6, "2026-09-02", "t2").unwrap(); // 与 08-30 比较，差 24.6 → 30
        assert_eq!(row(&conn, "aliyun", "2026-09-02"), (44.6, 30.0));
    }

    #[test]
    fn decreasing_balance_is_not_recharge() {
        let conn = mem_db();
        record(&conn, "volcengine", 20.0, "2026-09-01", "t1").unwrap();
        record(&conn, "volcengine", 19.0, "2026-09-02", "t2").unwrap();
        assert_eq!(row(&conn, "volcengine", "2026-09-02"), (19.0, 0.0));
    }

    #[test]
    fn tiny_increase_within_epsilon_is_not_recharge() {
        let conn = mem_db();
        record(&conn, "volcengine", 20.0, "2026-09-01", "t1").unwrap();
        record(&conn, "volcengine", 20.004, "2026-09-01", "t2").unwrap();
        assert_eq!(row(&conn, "volcengine", "2026-09-01"), (20.004, 0.0));
    }

    #[test]
    fn providers_are_isolated() {
        let conn = mem_db();
        record(&conn, "deepseek", 10.0, "2026-09-01", "t1").unwrap();
        record(&conn, "aliyun", 100.0, "2026-09-01", "t1").unwrap(); // 不应被 deepseek 的 10 影响
        assert_eq!(row(&conn, "aliyun", "2026-09-01"), (100.0, 0.0));
    }

    #[test]
    fn unknown_provider_is_rejected() {
        let conn = mem_db();
        let err = record(&conn, "openai", 1.0, "2026-09-01", "t1").unwrap_err();
        assert!(err.contains("未知的服务商"));
    }
}
```

在 `src-tauri/src/lib.rs` 第 1 行 `mod api;` 下方加 `mod history;`。

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test history::`
Expected: 编译失败，提示 `init_schema`、`record`、`round_up_recharge` 未定义。

- [ ] **Step 4: 实现最小代码**

在 `history.rs` 的 `BalanceDay` 定义之后、`#[cfg(test)]` 之前加入：

```rust
fn validate_provider(provider: &str) -> Result<(), String> {
    if PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(format!("未知的服务商: {}", provider))
    }
}

fn db_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("HOME").map_err(|_| "无法获取 HOME 目录".to_string())?;
    Ok(PathBuf::from(home_dir).join(".config/model-usage/history.sqlite"))
}

/// 建表（幂等）
pub fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS balance_daily (
            provider   TEXT NOT NULL,
            day        TEXT NOT NULL,
            balance    REAL NOT NULL,
            recharge   REAL NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (provider, day)
        );",
    )
    .map_err(|e| format!("初始化历史表失败: {}", e))
}

/// 打开磁盘数据库并确保表存在
fn open_db() -> Result<Connection, String> {
    let path = db_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败 ({}): {}", parent.display(), e))?;
    }
    let conn = Connection::open(&path)
        .map_err(|e| format!("打开历史数据库失败 ({}): {}", path.display(), e))?;
    init_schema(&conn)?;
    Ok(conn)
}

/// 充值差值按 10 元向上取整
pub fn round_up_recharge(diff: f64) -> f64 {
    (diff / RECHARGE_STEP).ceil() * RECHARGE_STEP
}

/// 记录一次余额。day 为本地日期 YYYY-MM-DD，now 为记录时间字符串。
/// 与该服务商最近一行（今天已有则是今天）比较，余额上涨即视为充值并累加到当天。
pub fn record(
    conn: &Connection,
    provider: &str,
    balance: f64,
    day: &str,
    now: &str,
) -> Result<(), String> {
    validate_provider(provider)?;

    let prev: Option<f64> = conn
        .query_row(
            "SELECT balance FROM balance_daily WHERE provider = ?1 ORDER BY day DESC LIMIT 1",
            params![provider],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("查询上一次余额失败: {}", e))?;

    let recharge = match prev {
        Some(p) if balance - p > RECHARGE_EPSILON => round_up_recharge(balance - p),
        _ => 0.0,
    };

    conn.execute(
        "INSERT INTO balance_daily (provider, day, balance, recharge, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(provider, day) DO UPDATE SET
            balance = excluded.balance,
            recharge = balance_daily.recharge + excluded.recharge,
            updated_at = excluded.updated_at",
        params![provider, day, balance, recharge, now],
    )
    .map_err(|e| format!("写入余额历史失败: {}", e))?;
    Ok(())
}
```

`open_db` 和 `db_path` 在本 Task 尚未被调用，会有 dead_code 警告，Task 2 注册 command 后消失，可先在两者上方加 `#[allow(dead_code)]` 并在 Task 2 移除，或直接忽略警告。

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test history::`
Expected: 8 个测试全部 `ok`。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/history.rs src-tauri/src/lib.rs
git commit -m "feat: 余额历史 SQLite 记录与充值检测

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 历史查询、花费计算与 tauri command 注册

**Files:**
- Modify: `src-tauri/src/history.rs`
- Modify: `src-tauri/src/lib.rs:37-45`

**Interfaces:**
- Consumes: Task 1 的 `record`、`init_schema`、`BalanceDay`、`open_db`
- Produces:
  - `history::history(conn: &Connection, provider: &str, days: u32, today: NaiveDate) -> Result<Vec<BalanceDay>, String>`
  - command `record_balance(provider: String, balance: f64) -> Result<Vec<BalanceDay>, String>`
  - command `get_balance_history(provider: String, days: u32) -> Result<Vec<BalanceDay>, String>`

- [ ] **Step 1: 写失败测试**

在 `history.rs` 的 `mod tests` 内追加：

```rust
    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn history_computes_spend_from_previous_row() {
        let conn = mem_db();
        record(&conn, "deepseek", 50.0, "2026-09-01", "t").unwrap();
        record(&conn, "deepseek", 47.5, "2026-09-02", "t").unwrap();
        record(&conn, "deepseek", 55.2, "2026-09-03", "t").unwrap(); // 充值 10，实际消费 2.3
        let rows = history(&conn, "deepseek", 30, d("2026-09-03")).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].spend, None);
        assert_eq!(rows[0].since_day, None);
        assert!((rows[1].spend.unwrap() - 2.5).abs() < 1e-9);
        assert_eq!(rows[1].since_day.as_deref(), Some("2026-09-01"));
        assert_eq!(rows[2].recharge, 10.0);
        assert!((rows[2].spend.unwrap() - (47.5 + 10.0 - 55.2)).abs() < 1e-9);
    }

    #[test]
    fn history_uses_row_before_window_as_baseline() {
        let conn = mem_db();
        record(&conn, "aliyun", 100.0, "2026-08-01", "t").unwrap();
        record(&conn, "aliyun", 90.0, "2026-08-20", "t").unwrap();
        // 窗口 30 天：08-05 ~ 09-03，08-01 在窗口外但作为基准
        let rows = history(&conn, "aliyun", 30, d("2026-09-03")).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].day, "2026-08-20");
        assert!((rows[0].spend.unwrap() - 10.0).abs() < 1e-9);
        assert_eq!(rows[0].since_day.as_deref(), Some("2026-08-01"));
    }

    #[test]
    fn history_excludes_rows_outside_window_and_is_sorted() {
        let conn = mem_db();
        record(&conn, "volcengine", 5.0, "2026-07-01", "t").unwrap();
        record(&conn, "volcengine", 4.0, "2026-09-02", "t").unwrap();
        record(&conn, "volcengine", 3.0, "2026-09-03", "t").unwrap();
        let rows = history(&conn, "volcengine", 30, d("2026-09-03")).unwrap();
        let days: Vec<&str> = rows.iter().map(|r| r.day.as_str()).collect();
        assert_eq!(days, vec!["2026-09-02", "2026-09-03"]);
    }

    #[test]
    fn history_empty_when_no_rows() {
        let conn = mem_db();
        assert!(history(&conn, "deepseek", 30, d("2026-09-03")).unwrap().is_empty());
    }

    #[test]
    fn history_rejects_unknown_provider() {
        let conn = mem_db();
        assert!(history(&conn, "openai", 30, d("2026-09-03")).is_err());
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd src-tauri && cargo test history::`
Expected: 编译失败，`history` 未定义。

- [ ] **Step 3: 实现查询与 command**

在 `record` 函数之后加入：

```rust
/// 返回最近 days 天（含今天）的历史，升序，并附带花费计算。
/// 会额外读取窗口之前最近的一行作为第一行的基准，但不返回它。
pub fn history(
    conn: &Connection,
    provider: &str,
    days: u32,
    today: NaiveDate,
) -> Result<Vec<BalanceDay>, String> {
    validate_provider(provider)?;
    let span = days.max(1) as i64 - 1;
    let start = (today - chrono::Duration::days(span))
        .format("%Y-%m-%d")
        .to_string();

    let baseline: Option<(String, f64)> = conn
        .query_row(
            "SELECT day, balance FROM balance_daily
             WHERE provider = ?1 AND day < ?2 ORDER BY day DESC LIMIT 1",
            params![provider, start],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("查询历史基准失败: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT day, balance, recharge FROM balance_daily
             WHERE provider = ?1 AND day >= ?2 ORDER BY day ASC",
        )
        .map_err(|e| format!("准备历史查询失败: {}", e))?;
    let rows = stmt
        .query_map(params![provider, start], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?, r.get::<_, f64>(2)?))
        })
        .map_err(|e| format!("查询余额历史失败: {}", e))?;

    let mut prev = baseline;
    let mut result = Vec::new();
    for row in rows {
        let (day, balance, recharge) = row.map_err(|e| format!("读取历史行失败: {}", e))?;
        let (spend, since_day) = match &prev {
            Some((pd, pb)) => (Some(pb + recharge - balance), Some(pd.clone())),
            None => (None, None),
        };
        result.push(BalanceDay { day: day.clone(), balance, recharge, spend, since_day });
        prev = Some((day, balance));
    }
    Ok(result)
}

/// 记录一次余额并返回最近 30 天历史
#[tauri::command]
pub fn record_balance(provider: String, balance: f64) -> Result<Vec<BalanceDay>, String> {
    let conn = open_db()?;
    let now = chrono::Local::now();
    record(
        &conn,
        &provider,
        balance,
        &now.format("%Y-%m-%d").to_string(),
        &now.to_rfc3339(),
    )?;
    history(&conn, &provider, 30, now.date_naive())
}

/// 查询最近 days 天历史
#[tauri::command]
pub fn get_balance_history(provider: String, days: u32) -> Result<Vec<BalanceDay>, String> {
    let conn = open_db()?;
    history(&conn, &provider, days, chrono::Local::now().date_naive())
}
```

如 Task 1 加过 `#[allow(dead_code)]`，此时移除。

在 `src-tauri/src/lib.rs` 的 `generate_handler![ ... ]` 中 `api::save_settings,` 之后追加：

```rust
      history::record_balance,
      history::get_balance_history,
```

- [ ] **Step 4: 运行测试与编译**

Run: `cd src-tauri && cargo test history:: && cargo build`
Expected: 13 个测试 `ok`，build 无 error、无 `history` 相关 warning。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/history.rs src-tauri/src/lib.rs
git commit -m "feat: 余额历史查询、每日花费计算与 command 注册

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 前端类型与数据流（记录余额并保存历史）

**Files:**
- Modify: `src/types/index.ts:118-136`
- Modify: `src/hooks/useUsageData.ts`

**Interfaces:**
- Consumes: command `record_balance(provider, balance) -> BalanceDay[]`
- Produces:
  - `type BalanceProvider = 'deepseek' | 'volcengine' | 'aliyun'`
  - `interface BalanceDay { day; balance; recharge; spend: number | null; sinceDay: string | null }`
  - `UsageData.histories: Record<BalanceProvider, BalanceDay[]>`

- [ ] **Step 1: 添加类型**

在 `src/types/index.ts` 的 `// 使用数据` 注释之前加入：

```ts
// 余额历史支持的服务商
export type BalanceProvider = 'deepseek' | 'volcengine' | 'aliyun';

// 余额历史（每天一条，来自 Rust record_balance / get_balance_history）
export interface BalanceDay {
  day: string;              // YYYY-MM-DD
  balance: number;          // 当天最后一次成功余额
  recharge: number;         // 当天累计充值（已按 10 元向上取整）
  spend: number | null;     // 前一行余额 + 当天充值 - 当天余额
  sinceDay: string | null;  // 前一行日期；与 day 不相邻表示覆盖了断档区间
}

export type BalanceHistories = Record<BalanceProvider, BalanceDay[]>;
```

在 `UsageData` 接口中 `diskUsage: DiskUsageData | null;` 之后加：

```ts
  histories: BalanceHistories;
```

- [ ] **Step 2: 修改 useUsageData**

在 `src/hooks/useUsageData.ts` 顶部 import 类型列表中加入 `BalanceDay, BalanceHistories, BalanceProvider`。

在 `fetchDeepSeekData` 之后添加辅助函数：

```ts
const EMPTY_HISTORIES: BalanceHistories = { deepseek: [], volcengine: [], aliyun: [] };

/** 将本次余额记入 SQLite 并返回最近 30 天历史；失败时记录日志并返回 null，不影响余额展示 */
async function recordBalance(provider: BalanceProvider, balance: number): Promise<BalanceDay[] | null> {
  try {
    return await invoke<BalanceDay[]>('record_balance', { provider, balance });
  } catch (err) {
    console.error(`记录 ${provider} 余额历史失败`, err);
    return null;
  }
}
```

初始 `useState<UsageData>` 对象里 `diskUsage: null,` 之后加 `histories: EMPTY_HISTORIES,`。

在 `fetchData` 内三个余额获取块之后、`setData({...})` 之前，加入记录逻辑（`fetchData` 内需要能读到上一轮历史，因此把 `setData` 改为函数式更新）：

```ts
      // 余额取成功后记入历史；失败保留上一轮历史
      const deepseekBalance = deepseekData?.balance
        ? parseFloat(deepseekData.balance.balance_infos[0]?.total_balance || '0')
        : null;
      const [deepseekHistory, volcengineHistory, aliyunHistory] = await Promise.all([
        deepseekBalance !== null ? recordBalance('deepseek', deepseekBalance) : Promise.resolve(null),
        volcengineData ? recordBalance('volcengine', volcengineData.availableBalance) : Promise.resolve(null),
        aliyunData ? recordBalance('aliyun', aliyunData.availableAmount) : Promise.resolve(null),
      ]);

      setData(prev => ({
        zhipu: zhipuData,
        deepseek: deepseekData,
        volcengine: volcengineData,
        aliyun: aliyunData,
        claudeCode: claudeCodeData,
        diskUsage: diskUsageData,
        histories: {
          deepseek: deepseekHistory ?? prev.histories.deepseek,
          volcengine: volcengineHistory ?? prev.histories.volcengine,
          aliyun: aliyunHistory ?? prev.histories.aliyun,
        },
        lastUpdated: new Date().toISOString(),
        error: null,
        zhipuError,
        deepseekError,
        volcengineError,
        aliyunError,
        claudeCodeError,
        diskUsageError,
      }));
```

即用上面这段替换原有的 `setData({ zhipu: zhipuData, ... diskUsageError, });` 调用。

- [ ] **Step 3: 编译检查**

Run: `volta run yarn build`
Expected: `tsc` 与 vite build 通过，0 error。

- [ ] **Step 4: 提交**

```bash
git add src/types/index.ts src/hooks/useUsageData.ts
git commit -m "feat: 余额刷新后记录历史并保存到前端状态

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Sparkline 与共享 BalanceCard，替换三张余额卡

**Files:**
- Create: `src/components/Sparkline.tsx`
- Create: `src/components/BalanceCard.tsx`
- Modify: `src/components/DeepSeekCard.tsx`（整文件重写）
- Modify: `src/components/VolcengineCard.tsx`（整文件重写）
- Modify: `src/components/AliyunCard.tsx`（整文件重写）
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `BalanceDay`、`BalanceProvider`、`UsageData.histories`
- Produces:
  - `Sparkline({ history: BalanceDay[]; height?: number })`
  - `BalanceCard({ title, provider, amount: number | null, note?, error?, loading?, history, onOpen })`
  - 三张卡新增 props：`history: BalanceDay[]`、`onOpen: (p: BalanceProvider) => void`

- [ ] **Step 1: 创建 Sparkline**

`src/components/Sparkline.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react';
import type { BalanceDay } from '../types';

interface SparklineProps {
  history: BalanceDay[];
  height?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(day: string, firstDay: string): number {
  return Math.round((Date.parse(day) - Date.parse(firstDay)) / DAY_MS);
}

/** 卡片底图：无坐标轴折线 + 淡色填充，充值日画绿色圆点。历史少于 2 点时不渲染。 */
export function Sparkline({ history, height = 40 }: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // 用实际像素宽度绘制，避免 preserveAspectRatio="none" 拉伸圆点
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (history.length < 2) return null;

  const firstDay = history[0].day;
  const span = Math.max(1, dayIndex(history[history.length - 1].day, firstDay));
  const balances = history.map(h => h.balance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;
  const padY = 4;

  const points = history.map(h => ({
    x: (dayIndex(h.day, firstDay) / span) * width,
    y: padY + (1 - (h.balance - min) / range) * (height - padY * 2),
    recharge: h.recharge > 0,
  }));
  const line = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <div ref={ref} className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          <polygon points={area} fill="rgba(255,255,255,0.10)" />
          <polyline
            points={line}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {points.filter(p => p.recharge).map(p => (
            <circle key={p.x} cx={p.x} cy={p.y} r={2.5} fill="#34d399" />
          ))}
        </svg>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 BalanceCard**

`src/components/BalanceCard.tsx`：

```tsx
import type { BalanceDay, BalanceProvider } from '../types';
import { Sparkline } from './Sparkline';

interface BalanceCardProps {
  title: string;
  provider: BalanceProvider;
  /** 余额；null 表示数据尚未获取 */
  amount: number | null;
  /** 金额右侧的小红字提示（如欠费） */
  note?: string | null;
  /** 无数据时的空态文案（如"未配置 API Key"） */
  emptyText: string;
  error?: string | null;
  loading?: boolean;
  history: BalanceDay[];
  onOpen: (provider: BalanceProvider) => void;
}

/** 余额阈值决定整张卡的底色与边框色 */
function getCardTone(amount: number): string {
  if (amount < 2) return 'bg-red-500/20 border-red-500/30';
  if (amount < 5) return 'bg-yellow-500/20 border-yellow-500/30';
  return '';
}

export function BalanceCard({
  title,
  provider,
  amount,
  note,
  emptyText,
  error,
  loading,
  history,
  onOpen,
}: BalanceCardProps) {
  if (amount === null) {
    return (
      <div className="glass-card p-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">{title}</h2>
        <p className={`text-white/50 text-sm ${loading ? 'animate-pulse' : ''}`}>
          {loading ? '加载中...' : error ? `数据获取失败: ${error}` : emptyText}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(provider)}
      className={`glass-card relative overflow-hidden text-left w-full cursor-pointer transition-colors hover:bg-white/15 ${getCardTone(amount)}`}
      style={{ minHeight: 88 }}
    >
      <Sparkline history={history} />
      <div className="relative p-4">
        <h2 className="text-lg font-bold text-white/90">{title}</h2>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-lg font-semibold text-white/90">¥{amount.toFixed(2)}</span>
          {note && <span className="text-xs text-red-300">{note}</span>}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 3: 重写三张卡为薄封装**

`src/components/DeepSeekCard.tsx`：

```tsx
import type { BalanceDay, BalanceProvider, DeepSeekUsageData } from '../types';
import { BalanceCard } from './BalanceCard';

interface DeepSeekCardProps {
  data: DeepSeekUsageData | null;
  error?: string | null;
  loading?: boolean;
  history: BalanceDay[];
  onOpen: (provider: BalanceProvider) => void;
}

export function DeepSeekCard({ data, error, loading, history, onOpen }: DeepSeekCardProps) {
  const amount = data?.balance
    ? parseFloat(data.balance.balance_infos[0]?.total_balance || '0')
    : null;

  return (
    <BalanceCard
      title="🧠 DeepSeek"
      provider="deepseek"
      amount={amount}
      emptyText="未配置 API Key"
      error={error}
      loading={loading}
      history={history}
      onOpen={onOpen}
    />
  );
}
```

`src/components/VolcengineCard.tsx`：

```tsx
import type { BalanceDay, BalanceProvider, VolcengineBalanceData } from '../types';
import { BalanceCard } from './BalanceCard';

interface VolcengineCardProps {
  data: VolcengineBalanceData | null;
  error?: string | null;
  loading?: boolean;
  history: BalanceDay[];
  onOpen: (provider: BalanceProvider) => void;
}

export function VolcengineCard({ data, error, loading, history, onOpen }: VolcengineCardProps) {
  return (
    <BalanceCard
      title="🌋 火山引擎"
      provider="volcengine"
      amount={data ? data.availableBalance : null}
      note={data && data.arrearsBalance > 0 ? `欠费 ¥${data.arrearsBalance.toFixed(2)}` : null}
      emptyText="未配置 AK/SK"
      error={error}
      loading={loading}
      history={history}
      onOpen={onOpen}
    />
  );
}
```

`src/components/AliyunCard.tsx`：

```tsx
import type { AliyunBalanceData, BalanceDay, BalanceProvider } from '../types';
import { BalanceCard } from './BalanceCard';

interface AliyunCardProps {
  data: AliyunBalanceData | null;
  error?: string | null;
  loading?: boolean;
  history: BalanceDay[];
  onOpen: (provider: BalanceProvider) => void;
}

export function AliyunCard({ data, error, loading, history, onOpen }: AliyunCardProps) {
  return (
    <BalanceCard
      title="☁️ 阿里云"
      provider="aliyun"
      amount={data ? data.availableAmount : null}
      note={data && data.availableAmount < 0 ? '账户已欠费' : null}
      emptyText="未配置 AK/SK"
      error={error}
      loading={loading}
      history={history}
      onOpen={onOpen}
    />
  );
}
```

- [ ] **Step 4: App.tsx 传入 history 与 onOpen**

在 `src/App.tsx` 中：

- import 增加 `import type { BalanceProvider } from './types';`
- `const [settingsOpen, setSettingsOpen] = useState(false);` 之后加 `const [openProvider, setOpenProvider] = useState<BalanceProvider | null>(null);`
- 三张卡分别增加 props：

```tsx
              <DeepSeekCard
                data={data.deepseek}
                error={data.deepseekError}
                loading={cardLoading(data.deepseekError)}
                history={data.histories.deepseek}
                onOpen={setOpenProvider}
              />
```

```tsx
              <VolcengineCard
                data={data.volcengine}
                error={data.volcengineError}
                loading={cardLoading(data.volcengineError)}
                history={data.histories.volcengine}
                onOpen={setOpenProvider}
              />
```

```tsx
              <AliyunCard
                data={data.aliyun}
                error={data.aliyunError}
                loading={cardLoading(data.aliyunError)}
                history={data.histories.aliyun}
                onOpen={setOpenProvider}
              />
```

`openProvider` 在本 Task 只被写入，`tsc` 默认不会因未读取的 state 报错；Task 5 会消费它。

- [ ] **Step 5: 编译并在 tauri dev 中目视验证**

Run: `volta run yarn build`
Expected: 0 error。

Run: `volta run yarn tauri:dev`，观察三张余额卡：
- 首次运行只有今天一条历史，卡片只显示标题与金额，高度约 88px，与其他卡对齐。
- 点击卡片不报错（modal 尚未实现，无反应属正常）。
- 手动验证底图：可在 `~/.config/model-usage/history.sqlite` 用 `sqlite3` 插入几行历史数据后刷新，例如：

```bash
sqlite3 ~/.config/model-usage/history.sqlite "INSERT OR REPLACE INTO balance_daily VALUES ('deepseek','2026-08-28',60,0,'t'),('deepseek','2026-08-30',55.5,0,'t'),('deepseek','2026-09-01',52,0,'t'),('deepseek','2026-09-02',71.2,20,'t');"
```

刷新后 DeepSeek 卡底部出现折线与填充，09-02 处有绿点。验证完可删除这些行或保留。

- [ ] **Step 6: 提交**

```bash
git add src/components/Sparkline.tsx src/components/BalanceCard.tsx src/components/DeepSeekCard.tsx src/components/VolcengineCard.tsx src/components/AliyunCard.tsx src/App.tsx
git commit -m "feat: 余额卡片改为共享 BalanceCard 并加入 sparkline 底图

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 详情 modal 与 SVG 图表

**Files:**
- Create: `src/components/BalanceHistoryModal.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `BalanceDay`、`BalanceProvider`、`openProvider` 状态、`data.histories`
- Produces: `BalanceHistoryModal({ provider: BalanceProvider | null; history: BalanceDay[]; onClose })`

- [ ] **Step 1: 创建 modal 与图表**

`src/components/BalanceHistoryModal.tsx`：

```tsx
import { useState, type MouseEvent } from 'react';
import type { BalanceDay, BalanceProvider } from '../types';

interface BalanceHistoryModalProps {
  provider: BalanceProvider | null;
  history: BalanceDay[];
  onClose: () => void;
}

const PROVIDER_TITLES: Record<BalanceProvider, string> = {
  deepseek: '🧠 DeepSeek',
  volcengine: '🌋 火山引擎',
  aliyun: '☁️ 阿里云',
};

// 图表尺寸与内边距
const WIDTH = 460;
const HEIGHT = 220;
const PAD = { top: 24, right: 44, bottom: 24, left: 44 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(day: string, firstDay: string): number {
  return Math.round((Date.parse(day) - Date.parse(firstDay)) / DAY_MS);
}

/** 09-02 形式的短日期 */
function shortDay(day: string): string {
  return day.slice(5);
}

/** 两个日期是否相邻（相差一天） */
function isAdjacent(a: string, b: string): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) === DAY_MS;
}

function fmt(n: number): string {
  return `¥${n.toFixed(2)}`;
}

interface ChartProps {
  history: BalanceDay[];
}

function BalanceChart({ history }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const firstDay = history[0].day;
  const span = Math.max(1, dayIndex(history[history.length - 1].day, firstDay));
  const slot = PLOT_W / (span + 1); // 每天占的横向宽度
  const xOf = (day: string) => PAD.left + slot / 2 + (dayIndex(day, firstDay) / (span + 1)) * PLOT_W;

  const maxBalance = Math.max(...history.map(h => h.balance), 0.01);
  const maxSpend = Math.max(...history.map(h => Math.max(h.spend ?? 0, 0)), 0.01);
  const yBalance = (v: number) => PAD.top + (1 - v / maxBalance) * PLOT_H;
  const ySpend = (v: number) => PAD.top + (1 - v / maxSpend) * PLOT_H;

  const points = history.map(h => ({ ...h, x: xOf(h.day) }));
  const linePath = points.map(p => `${p.x.toFixed(1)},${yBalance(p.balance).toFixed(1)}`).join(' ');
  const barW = Math.max(2, Math.min(14, slot * 0.6));
  const gridFractions = [0.25, 0.5, 0.75];

  // 悬停：找离鼠标最近的点
  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].x - mx) < Math.abs(points[best].x - mx)) best = i;
    }
    setHover(best);
  };

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full block"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* 网格与两侧刻度 */}
        {gridFractions.map(f => {
          const y = PAD.top + (1 - f) * PLOT_H;
          return (
            <g key={f}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text x={PAD.left - 6} y={y + 3} fontSize={9} textAnchor="end" fill="rgba(255,255,255,0.5)">
                {(maxBalance * f).toFixed(0)}
              </text>
              <text x={WIDTH - PAD.right + 6} y={y + 3} fontSize={9} fill="rgba(255,255,255,0.5)">
                {(maxSpend * f).toFixed(1)}
              </text>
            </g>
          );
        })}
        <text x={PAD.left - 6} y={PAD.top - 10} fontSize={9} textAnchor="end" fill="rgba(255,255,255,0.4)">余额</text>
        <text x={WIDTH - PAD.right + 6} y={PAD.top - 10} fontSize={9} fill="rgba(255,255,255,0.4)">花费</text>

        {/* 每日花费柱 */}
        {points.map(p => {
          const spend = Math.max(p.spend ?? 0, 0);
          const top = ySpend(spend);
          return (
            <rect
              key={`bar-${p.day}`}
              x={p.x - barW / 2}
              y={top}
              width={barW}
              height={PAD.top + PLOT_H - top}
              fill={hover !== null && points[hover].day === p.day ? 'rgba(96,165,250,0.7)' : 'rgba(96,165,250,0.4)'}
            />
          );
        })}

        {/* 余额折线 */}
        <polyline points={linePath} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} strokeLinejoin="round" />
        {points.map(p => (
          <circle key={`dot-${p.day}`} cx={p.x} cy={yBalance(p.balance)} r={2} fill="rgba(255,255,255,0.85)" />
        ))}

        {/* 充值标记 */}
        {points.filter(p => p.recharge > 0).map(p => {
          const y = ySpend(Math.max(p.spend ?? 0, 0)) - 8;
          return (
            <g key={`re-${p.day}`}>
              <polygon points={`${p.x},${y} ${p.x - 4},${y + 6} ${p.x + 4},${y + 6}`} fill="#34d399" />
              <text x={p.x} y={y - 3} fontSize={9} textAnchor="middle" fill="#34d399">
                +¥{p.recharge.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* x 轴：每 5 天标一个日期 */}
        {points.filter((_, i) => i % 5 === 0 || i === points.length - 1).map(p => (
          <text key={`x-${p.day}`} x={p.x} y={HEIGHT - 8} fontSize={9} textAnchor="middle" fill="rgba(255,255,255,0.5)">
            {shortDay(p.day)}
          </text>
        ))}

        {/* 悬停竖线 */}
        {active && (
          <line x1={active.x} x2={active.x} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
        )}
      </svg>

      {active && (
        <div
          className="absolute top-2 text-xs bg-black/70 border border-white/15 rounded-lg px-3 py-2 pointer-events-none space-y-0.5"
          style={{ left: `${(active.x / WIDTH) * 100}%`, transform: active.x > WIDTH / 2 ? 'translateX(-110%)' : 'translateX(10%)' }}
        >
          <div className="text-white/90 font-medium">{active.day}</div>
          <div className="text-white/70">余额 {fmt(active.balance)}</div>
          <div className="text-white/70">
            花费 {active.spend === null ? '—' : fmt(active.spend)}
            {active.sinceDay && !isAdjacent(active.sinceDay, active.day) && (
              <span className="text-white/40">（自 {shortDay(active.sinceDay)} 以来）</span>
            )}
          </div>
          {active.recharge > 0 && <div className="text-emerald-300">充值 {fmt(active.recharge)}</div>}
        </div>
      )}
    </div>
  );
}

export function BalanceHistoryModal({ provider, history, onClose }: BalanceHistoryModalProps) {
  if (!provider) return null;

  const spends = history.map(h => h.spend).filter((s): s is number => s !== null);
  const totalSpend = spends.reduce((a, b) => a + b, 0);
  const totalRecharge = history.reduce((a, h) => a + h.recharge, 0);
  const avgSpend = spends.length > 0 ? totalSpend / spends.length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card p-5 w-[480px] max-w-[95vw] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white/90">{PROVIDER_TITLES[provider]} · 最近 30 天</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white/90 text-xl leading-none px-1"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {history.length === 0 ? (
          <p className="text-white/50 text-sm py-10 text-center">暂无历史数据</p>
        ) : (
          <>
            <BalanceChart history={history} />
            <div className="grid grid-cols-3 gap-3 mt-3 text-center">
              <div className="rounded-lg bg-white/5 border border-white/10 py-2">
                <div className="text-[11px] text-white/50">30 天总花费</div>
                <div className="text-sm font-semibold text-white/90">{fmt(totalSpend)}</div>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 py-2">
                <div className="text-[11px] text-white/50">总充值</div>
                <div className="text-sm font-semibold text-emerald-300">{fmt(totalRecharge)}</div>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 py-2">
                <div className="text-[11px] text-white/50">日均花费</div>
                <div className="text-sm font-semibold text-white/90">{fmt(avgSpend)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 App.tsx 渲染 modal**

`src/App.tsx`：

- import 增加 `import { BalanceHistoryModal } from './components/BalanceHistoryModal';`
- 在 `<SettingsModal ... />` 之后加入：

```tsx
      <BalanceHistoryModal
        provider={openProvider}
        history={openProvider ? data.histories[openProvider] : []}
        onClose={() => setOpenProvider(null)}
      />
```

- [ ] **Step 3: 编译并手动验证**

Run: `volta run yarn build`
Expected: 0 error。

Run: `volta run yarn tauri:dev`，用 Task 4 Step 5 插入的样例数据验证：
- 点击 DeepSeek 卡弹出 modal，标题为 "🧠 DeepSeek · 最近 30 天"。
- 图中有余额折线、花费柱、09-02 上方绿色三角和 "+¥20" 标注。
- 悬停各点显示日期、余额、花费、充值；08-30 那点应出现"（自 08-28 以来）"。
- 下方三格汇总数字合理；点击遮罩或 × 关闭。
- 点击没有历史的卡（如果有）显示"暂无历史数据"。

- [ ] **Step 4: 清理样例数据并提交**

如需删除 Task 4 插入的样例行：

```bash
sqlite3 ~/.config/model-usage/history.sqlite "DELETE FROM balance_daily WHERE updated_at = 't';"
```

```bash
git add src/components/BalanceHistoryModal.tsx src/App.tsx
git commit -m "feat: 余额历史详情弹窗与 SVG 图表

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 收尾检查

**Files:**
- 全部改动文件（只读检查）

- [ ] **Step 1: 全量验证**

Run: `cd src-tauri && cargo test && cargo build 2>&1 | grep -E "warning|error" ; cd .. && volta run yarn build`
Expected: Rust 测试全部通过，无新增 warning；前端 build 0 error。

- [ ] **Step 2: 复查改动，清理调试代码**

Run: `git diff main --stat && git diff main -- src src-tauri/src | grep -nE "console\.log|dbg!|println!"`
Expected: 没有遗留的调试输出（`console.error` 用于记录历史失败属于必要日志，保留）。

