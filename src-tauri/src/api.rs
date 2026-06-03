use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

// ===== 应用设置（保存到 ~/.config/model-usage/setting.json） =====

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    #[serde(rename = "zhipuApiKey", default)]
    pub zhipu_api_key: String,
    #[serde(rename = "deepseekApiKey", default)]
    pub deepseek_api_key: String,
    #[serde(rename = "refreshIntervalSec", default = "default_refresh_interval")]
    pub refresh_interval_sec: u64,
}

fn default_refresh_interval() -> u64 {
    120
}

fn settings_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("HOME").map_err(|_| "无法获取 HOME 目录".to_string())?;
    Ok(PathBuf::from(home_dir).join(".config/model-usage/setting.json"))
}

#[tauri::command]
pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AppSettings {
            refresh_interval_sec: default_refresh_interval(),
            ..Default::default()
        });
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("读取设置文件失败 ({}): {}", path.display(), e))?;
    let mut settings: AppSettings = serde_json::from_str(&raw)
        .map_err(|e| format!("解析设置文件失败: {}", e))?;
    if settings.refresh_interval_sec == 0 {
        settings.refresh_interval_sec = default_refresh_interval();
    }
    Ok(settings)
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败 ({}): {}", parent.display(), e))?;
    }
    let raw = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("序列化设置失败: {}", e))?;
    fs::write(&path, raw).map_err(|e| format!("写入设置失败 ({}): {}", path.display(), e))?;
    Ok(())
}

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

// ===== Claude Code 订阅用量（调用官方 /api/oauth/usage） =====

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ClaudeOauthWindow {
    pub utilization: f64,
    pub resets_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct ClaudeExtraUsage {
    #[serde(default)]
    pub is_enabled: bool,
    #[serde(default)]
    pub monthly_limit: Option<f64>,
    #[serde(default)]
    pub used_credits: Option<f64>,
    #[serde(default)]
    pub utilization: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ClaudeCodeUsageResult {
    #[serde(rename = "fiveHour")]
    pub five_hour: Option<ClaudeOauthWindow>,
    #[serde(rename = "sevenDay")]
    pub seven_day: Option<ClaudeOauthWindow>,
    #[serde(rename = "sevenDayOpus")]
    pub seven_day_opus: Option<ClaudeOauthWindow>,
    #[serde(rename = "sevenDaySonnet")]
    pub seven_day_sonnet: Option<ClaudeOauthWindow>,
    #[serde(rename = "extraUsage")]
    pub extra_usage: Option<ClaudeExtraUsage>,
}

#[derive(Debug, Deserialize)]
struct ClaudeOauthRaw {
    five_hour: Option<ClaudeOauthWindow>,
    seven_day: Option<ClaudeOauthWindow>,
    seven_day_opus: Option<ClaudeOauthWindow>,
    seven_day_sonnet: Option<ClaudeOauthWindow>,
    extra_usage: Option<ClaudeExtraUsage>,
}

#[derive(Debug, Deserialize)]
struct CredentialsFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeOauthCreds>,
}

#[derive(Debug, Deserialize)]
struct ClaudeOauthCreds {
    #[serde(rename = "accessToken")]
    access_token: Option<String>,
}

fn parse_token_from_json(raw: &str) -> Result<String, String> {
    let creds: CredentialsFile = serde_json::from_str(raw)
        .map_err(|e| format!("解析凭证 JSON 失败: {}", e))?;
    creds
        .claude_ai_oauth
        .and_then(|c| c.access_token)
        .ok_or_else(|| "凭证中未找到 accessToken".to_string())
}

fn read_oauth_token() -> Result<String, String> {
    // 优先从 macOS Keychain 读取
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args(["find-generic-password", "-s", "Claude Code-credentials", "-w"])
            .output();
        match output {
            Ok(out) if out.status.success() => {
                let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !raw.is_empty() {
                    return parse_token_from_json(&raw);
                }
            }
            Ok(out) => {
                // 回退之前先记录 keychain 失败原因
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                let home_dir = std::env::var("HOME").unwrap_or_default();
                let path = PathBuf::from(&home_dir).join(".claude/.credentials.json");
                if !path.exists() {
                    return Err(format!(
                        "无法访问 macOS Keychain 中的 Claude Code 凭证：{}。请打开『钥匙串访问』搜索 \"Claude Code-credentials\"，将访问权限授予本应用，或在终端运行 claude 重新登录。",
                        if stderr.is_empty() { "权限被拒绝".to_string() } else { stderr }
                    ));
                }
            }
            Err(e) => {
                return Err(format!("调用 security 命令失败: {}", e));
            }
        }
    }

    // 回退到 ~/.claude/.credentials.json
    let home_dir = std::env::var("HOME")
        .map_err(|_| "无法获取 HOME 目录".to_string())?;
    let path = PathBuf::from(&home_dir).join(".claude/.credentials.json");
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("未找到 Claude Code 登录凭证（路径：{}）：{}", path.display(), e))?;
    parse_token_from_json(&raw)
}

#[tauri::command]
pub async fn fetch_claude_code_usage() -> Result<ClaudeCodeUsageResult, String> {
    let token = read_oauth_token()?;

    let client = reqwest::Client::new();
    let response = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", format!("Bearer {}", token))
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("请求 /api/oauth/usage 失败: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        if status.as_u16() == 401 {
            return Err("OAuth token 已过期，请在终端运行 claude 重新登录".to_string());
        }
        return Err(format!("API 返回 {}: {}", status, body));
    }

    let raw: ClaudeOauthRaw = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    Ok(ClaudeCodeUsageResult {
        five_hour: raw.five_hour,
        seven_day: raw.seven_day,
        seven_day_opus: raw.seven_day_opus,
        seven_day_sonnet: raw.seven_day_sonnet,
        extra_usage: raw.extra_usage,
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

// ===== 磁盘使用量 =====

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsageResult {
    pub mount_point: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub percentage: f64,
}

// 获取根分区的磁盘使用量（通过 df 命令）
#[tauri::command]
pub fn get_disk_usage() -> Result<DiskUsageResult, String> {
    let output = Command::new("df")
        .args(["-k", "/"])
        .output()
        .map_err(|e| format!("执行 df 命令失败: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "df 命令返回错误: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // 第二行是数据行（第一行是表头）
    let data_line = stdout
        .lines()
        .nth(1)
        .ok_or_else(|| "df 输出格式异常：缺少数据行".to_string())?;

    let fields: Vec<&str> = data_line.split_whitespace().collect();
    if fields.len() < 4 {
        return Err(format!("df 输出字段不足: {}", data_line));
    }

    // df -k 单位为 1024 字节块。
    // 注意 APFS：第 1 列 1024-blocks 是整个容器（物理盘）的总容量，
    // 第 2 列 Used 仅为当前挂载卷自身占用，不能代表全盘。
    // 真实已用空间应为 总量 - 可用，才与"关于本机"一致。
    let total_blocks: u64 = fields[1]
        .parse()
        .map_err(|e| format!("解析总块数失败: {}", e))?;
    let available_blocks: u64 = fields[3]
        .parse()
        .map_err(|e| format!("解析可用块数失败: {}", e))?;

    let total_bytes = total_blocks * 1024;
    let available_bytes = available_blocks * 1024;
    let used_bytes = total_bytes.saturating_sub(available_bytes);
    let percentage = if total_bytes > 0 {
        used_bytes as f64 / total_bytes as f64 * 100.0
    } else {
        0.0
    };

    Ok(DiskUsageResult {
        mount_point: "/".to_string(),
        total_bytes,
        used_bytes,
        available_bytes,
        percentage,
    })
}
