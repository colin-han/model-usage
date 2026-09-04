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

// Task 2 移除此 allow 注解
#[allow(dead_code)]
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
// Task 2 移除此 allow 注解
#[allow(dead_code)]
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
