use serde::{Deserialize, Serialize};
use rusqlite::Connection;

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

// Windsurf API 结构
#[derive(Debug, Serialize)]
pub struct WindsurfApiKeyResult {
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WindsurfMetadata {
    pub api_key: String,
    pub ide_name: String,
    #[serde(rename = "ideVersion")]
    pub ide_version: String,
    #[serde(rename = "extensionName")]
    pub extension_name: String,
    #[serde(rename = "extensionVersion")]
    pub extension_version: String,
    pub locale: String,
}

#[derive(Debug, Serialize)]
pub struct WindsurfRequest {
    pub metadata: WindsurfMetadata,
}

#[derive(Debug, Deserialize)]
pub struct WindsurfPlanInfo {
    #[serde(rename = "planName")]
    pub plan_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WindsurfPlanStatus {
    #[serde(rename = "planInfo")]
    pub plan_info: WindsurfPlanInfo,
    #[serde(rename = "availableFlexCredits")]
    pub available_flex_credits: Option<i64>,
    #[serde(rename = "dailyQuotaRemainingPercent")]
    pub daily_quota_remaining_percent: Option<f64>,
    #[serde(rename = "weeklyQuotaRemainingPercent")]
    pub weekly_quota_remaining_percent: Option<f64>,
    #[serde(rename = "dailyQuotaResetAtUnix")]
    pub daily_quota_reset_at_unix: Option<String>,
    #[serde(rename = "weeklyQuotaResetAtUnix")]
    pub weekly_quota_reset_at_unix: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WindsurfUserStatus {
    #[serde(rename = "planStatus")]
    pub plan_status: WindsurfPlanStatus,
}

#[derive(Debug, Deserialize)]
pub struct WindsurfResponse {
    #[serde(rename = "userStatus")]
    pub user_status: WindsurfUserStatus,
}

#[derive(Debug, Serialize)]
pub struct WindsurfQuotaResult {
    #[serde(rename = "planName")]
    pub plan_name: Option<String>,
    #[serde(rename = "dailyQuota")]
    pub daily_quota: WindsurfQuotaInfo,
    #[serde(rename = "weeklyQuota")]
    pub weekly_quota: WindsurfQuotaInfo,
    #[serde(rename = "flexCredits")]
    pub flex_credits: Option<CreditInfo>,
}

#[derive(Debug, Serialize)]
pub struct WindsurfQuotaInfo {
    #[serde(rename = "remainingPercent")]
    pub remaining_percent: f64,
    #[serde(rename = "resetAtUnix")]
    pub reset_at_unix: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreditInfo {
    pub available: i64,
}

// 从 Windsurf SQLite 数据库读取 API Key
#[tauri::command]
pub fn get_windsurf_api_key() -> Result<WindsurfApiKeyResult, String> {
    let home_dir = std::env::var("HOME")
        .map_err(|_| "Failed to get HOME directory".to_string())?;

    let db_path = format!("{}/Library/Application Support/Windsurf/User/globalStorage/state.vscdb", home_dir);

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus'")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let api_key = stmt.query_row([], |row| {
        let value: String = row.get(0)?;
        Ok(value)
    })
    .ok()
    .and_then(|json_str: String| {
        serde_json::from_str::<serde_json::Value>(&json_str)
            .ok()
            .and_then(|v| v.get("apiKey")?.as_str().map(String::from))
    });

    Ok(WindsurfApiKeyResult { api_key })
}

// 获取 Windsurf 配额
#[tauri::command]
pub async fn fetch_windsurf_quota(apiKey: String) -> Result<WindsurfQuotaResult, String> {
    let client = reqwest::Client::new();

    let request_body = WindsurfRequest {
        metadata: WindsurfMetadata {
            api_key: apiKey,
            ide_name: "windsurf".to_string(),
            ide_version: "0.0.0".to_string(),
            extension_name: "windsurf".to_string(),
            extension_version: "0.0.0".to_string(),
            locale: "en".to_string(),
        },
    };

    let response = client
        .post("https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus")
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API returned status: {}", response.status()));
    }

    let windsurf_response: WindsurfResponse = response
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

    let ps = windsurf_response.user_status.plan_status;

    // Daily quota (remaining percent)
    let daily_remaining = ps.daily_quota_remaining_percent.unwrap_or(0.0);

    // Weekly quota
    let weekly_remaining = ps.weekly_quota_remaining_percent.unwrap_or(0.0);

    // Flex credits (optional, may not exist for all plans)
    let flex_credits = ps.available_flex_credits.map(|available| CreditInfo {
        available,
    });

    Ok(WindsurfQuotaResult {
        plan_name: ps.plan_info.plan_name,
        daily_quota: WindsurfQuotaInfo {
            remaining_percent: daily_remaining,
            reset_at_unix: ps.daily_quota_reset_at_unix,
        },
        weekly_quota: WindsurfQuotaInfo {
            remaining_percent: weekly_remaining,
            reset_at_unix: ps.weekly_quota_reset_at_unix,
        },
        flex_credits,
    })
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
