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
