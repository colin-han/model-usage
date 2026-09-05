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
pub fn open_db() -> Result<Connection, String> {
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
}
