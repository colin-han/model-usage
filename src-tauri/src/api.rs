use serde::{Deserialize, Serialize};

// 智谱 API 响应结构
#[derive(Debug, Deserialize)]
pub struct ZhipuQuotaResponse {
    pub code: i32,
    pub data: ZhipuData,
}

#[derive(Debug, Deserialize)]
pub struct ZhipuData {
    #[serde(rename = "fiveHourLimit")]
    pub five_hour_limit: LimitInfo,
    #[serde(rename = "weeklyLimit")]
    pub weekly_limit: LimitInfo,
}

#[derive(Debug, Deserialize)]
pub struct LimitInfo {
    pub used: u64,
    pub total: u64,
    #[serde(rename = "resetTime")]
    pub reset_time: String,
}

// Kimi API 响应结构
#[derive(Debug, Deserialize)]
pub struct KimiBalanceResponse {
    pub code: i32,
    pub data: KimiData,
}

#[derive(Debug, Deserialize)]
pub struct KimiData {
    #[serde(rename = "availableBalance")]
    pub available_balance: f64,
    #[serde(rename = "cashBalance")]
    pub cash_balance: f64,
    #[serde(rename = "voucherBalance")]
    pub voucher_balance: f64,
}

// 统一返回给前端的数据结构
#[derive(Debug, Serialize)]
pub struct ZhipuQuotaResult {
    pub five_hour: QuotaInfo,
    pub weekly: QuotaInfo,
}

#[derive(Debug, Serialize)]
pub struct QuotaInfo {
    pub used: u64,
    pub total: u64,
    pub remaining: f64,
    pub reset_time: String,
}

#[derive(Debug, Serialize)]
pub struct KimiQuotaResult {
    pub rate_limit: RateLimitInfo,
    pub weekly: WeeklyInfo,
}

#[derive(Debug, Serialize)]
pub struct RateLimitInfo {
    pub usage_percent: f64,
    pub reset_time: String,
}

#[derive(Debug, Serialize)]
pub struct WeeklyInfo {
    pub usage_percent: f64,
    pub reset_time: String,
}

// 获取智谱额度
#[tauri::command]
pub async fn fetch_zhipu_quota(api_key: String) -> Result<ZhipuQuotaResult, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://bigmodel.cn/api/monitor/usage/quota/limit")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let quota: ZhipuQuotaResponse = response
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

    if quota.code != 0 {
        return Err(format!("API error: code {}", quota.code));
    }

    let five_hour_remaining = if quota.data.five_hour_limit.total > 0 {
        (1.0 - (quota.data.five_hour_limit.used as f64 / quota.data.five_hour_limit.total as f64)) * 100.0
    } else {
        0.0
    };

    let weekly_remaining = if quota.data.weekly_limit.total > 0 {
        (1.0 - (quota.data.weekly_limit.used as f64 / quota.data.weekly_limit.total as f64)) * 100.0
    } else {
        0.0
    };

    Ok(ZhipuQuotaResult {
        five_hour: QuotaInfo {
            used: quota.data.five_hour_limit.used,
            total: quota.data.five_hour_limit.total,
            remaining: five_hour_remaining,
            reset_time: quota.data.five_hour_limit.reset_time,
        },
        weekly: QuotaInfo {
            used: quota.data.weekly_limit.used,
            total: quota.data.weekly_limit.total,
            remaining: weekly_remaining,
            reset_time: quota.data.weekly_limit.reset_time,
        },
    })
}

// 获取 Kimi 额度
#[tauri::command]
pub async fn fetch_kimi_quota(api_key: String) -> Result<KimiQuotaResult, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://api.moonshot.ai/v1/users/me/balance")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let balance: KimiBalanceResponse = response
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

    if balance.code != 0 {
        return Err(format!("API error: code {}", balance.code));
    }

    // Kimi API 只返回余额，这里模拟频限和每周使用率
    // 实际使用时需要根据具体业务逻辑调整
    let usage_percent = if balance.data.available_balance > 0.0 {
        ((balance.data.cash_balance / balance.data.available_balance) * 100.0).min(100.0)
    } else {
        100.0
    };

    // 计算下一个小时和本周的重置时间
    let now = chrono::Local::now();
    let next_hour = now + chrono::Duration::hours(1);
    let next_week = now + chrono::Duration::days(7);

    Ok(KimiQuotaResult {
        rate_limit: RateLimitInfo {
            usage_percent,
            reset_time: next_hour.to_rfc3339(),
        },
        weekly: WeeklyInfo {
            usage_percent: usage_percent * 0.7, // 模拟不同的使用率
            reset_time: next_week.to_rfc3339(),
        },
    })
}
