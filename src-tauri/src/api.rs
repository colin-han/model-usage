use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

// ===== 应用设置（保存到 ~/.config/model-usage/setting.json） =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "zhipuApiKey", default)]
    pub zhipu_api_key: String,
    #[serde(rename = "deepseekApiKey", default)]
    pub deepseek_api_key: String,
    #[serde(rename = "volcengineAccessKey", default)]
    pub volcengine_access_key: String,
    #[serde(rename = "volcengineSecretKey", default)]
    pub volcengine_secret_key: String,
    #[serde(rename = "showClaudeCode", default = "default_true")]
    pub show_claude_code: bool,
    #[serde(rename = "showZhipu", default = "default_true")]
    pub show_zhipu: bool,
    #[serde(rename = "showDeepseek", default = "default_true")]
    pub show_deepseek: bool,
    #[serde(rename = "showVolcengine", default = "default_true")]
    pub show_volcengine: bool,
    #[serde(rename = "showDiskUsage", default = "default_true")]
    pub show_disk_usage: bool,
    #[serde(rename = "refreshIntervalSec", default = "default_refresh_interval")]
    pub refresh_interval_sec: u64,
    #[serde(rename = "proxyUrl", default = "default_proxy_url")]
    pub proxy_url: String,
    #[serde(rename = "noProxyDns", default = "default_no_proxy_dns")]
    pub no_proxy_dns: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            zhipu_api_key: String::new(),
            deepseek_api_key: String::new(),
            volcengine_access_key: String::new(),
            volcengine_secret_key: String::new(),
            show_claude_code: true,
            show_zhipu: true,
            show_deepseek: true,
            show_volcengine: true,
            show_disk_usage: true,
            refresh_interval_sec: default_refresh_interval(),
            proxy_url: default_proxy_url(),
            no_proxy_dns: default_no_proxy_dns(),
        }
    }
}

fn default_refresh_interval() -> u64 {
    120
}

fn default_true() -> bool {
    true
}

fn default_proxy_url() -> String {
    "http://localhost:7890".to_string()
}

fn default_no_proxy_dns() -> Vec<String> {
    vec!["172.20.5.1".to_string()]
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

// 官方 /api/oauth/usage 新版 limits 数组中的单条限额
#[derive(Debug, Deserialize)]
struct ClaudeLimit {
    #[serde(default)]
    #[allow(dead_code)] // 预留字段：官方 limits.kind，暂未消费
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
    #[serde(rename = "sevenDayFable")]
    pub seven_day_fable: Option<ClaudeOauthWindow>,
    #[serde(rename = "extraUsage")]
    pub extra_usage: Option<ClaudeExtraUsage>,
    #[serde(rename = "viaProxy")]
    pub via_proxy: bool,
    #[serde(rename = "proxyUrl", skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
    #[serde(rename = "localUsage", skip_serializing_if = "Option::is_none", default)]
    pub local_usage: Option<ClaudeLocalUsage>,
}

// ===== Claude Code 本地日志用量统计（随限额数据一并展示） =====

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeLocalUsage {
    pub five_hour_tokens: u64,
    pub seven_day_tokens: u64,
    pub seven_day_fable_tokens: u64,
}

// 判断模型是否属于 fable 系列（兼容将来 fable-5.x / fable-6）
fn model_is_fable(model: Option<&str>) -> bool {
    model.map(|m| m.starts_with("claude-fable-")).unwrap_or(false)
}

// 扫描 ~/.claude/projects/**/*.jsonl，统计两个官方窗口起点之后
// assistant 消息的 token 用量（input + output + cache_creation）。
// 窗口起点由 API 返回的重置时间逆推得出，与官方限额窗口对齐。
fn scan_local_claude_usage(
    five_hour_start: chrono::DateTime<chrono::Utc>,
    seven_day_start: chrono::DateTime<chrono::Utc>,
) -> Result<ClaudeLocalUsage, String> {
    use std::collections::HashSet;

    let home_dir = std::env::var("HOME").map_err(|_| "无法获取 HOME 目录".to_string())?;
    let projects_dir = PathBuf::from(&home_dir).join(".claude/projects");
    let earliest = seven_day_start.min(five_hour_start);

    let mut seen_ids: HashSet<String> = HashSet::new();
    let mut five_hour_tokens = 0u64;
    let mut seven_day_tokens = 0u64;
    let mut seven_day_fable_tokens = 0u64;

    let projects = fs::read_dir(&projects_dir)
        .map_err(|e| format!("读取 Claude 日志目录失败 ({}): {}", projects_dir.display(), e))?;
    for project in projects.flatten() {
        let Ok(files) = fs::read_dir(project.path()) else { continue };
        for file in files.flatten() {
            let path = file.path();
            if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                continue;
            }
            // 窗口起点之前就没有再写入的会话文件直接跳过
            if let Ok(modified) = file.metadata().and_then(|m| m.modified()) {
                if chrono::DateTime::<chrono::Utc>::from(modified) < earliest {
                    continue;
                }
            }
            let Ok(content) = fs::read_to_string(&path) else { continue };
            for line in content.lines() {
                // 字符串粗过滤，减少 JSON 解析量
                if !line.contains("\"assistant\"") || !line.contains("\"usage\"") {
                    continue;
                }
                let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
                if v.get("type").and_then(|t| t.as_str()) != Some("assistant") {
                    continue;
                }
                let Some(ts) = v
                    .get("timestamp")
                    .and_then(|t| t.as_str())
                    .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                    .map(|t| t.with_timezone(&chrono::Utc))
                else {
                    continue;
                };
                if ts < earliest {
                    continue;
                }
                let Some(message) = v.get("message") else { continue };
                // 同一条 API 消息可能拆成多行写入（共享同一份 usage），按消息 id 去重
                if let Some(id) = message.get("id").and_then(|i| i.as_str()) {
                    if !seen_ids.insert(id.to_string()) {
                        continue;
                    }
                }
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
            }
        }
    }

    Ok(ClaudeLocalUsage {
        five_hour_tokens,
        seven_day_tokens,
        seven_day_fable_tokens,
    })
}

#[derive(Debug, Deserialize)]
struct ClaudeOauthRaw {
    five_hour: Option<ClaudeOauthWindow>,
    seven_day: Option<ClaudeOauthWindow>,
    seven_day_opus: Option<ClaudeOauthWindow>,
    seven_day_sonnet: Option<ClaudeOauthWindow>,
    extra_usage: Option<ClaudeExtraUsage>,
    #[serde(default)]
    limits: Option<Vec<ClaudeLimit>>,
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

fn read_current_dns_servers() -> Vec<String> {
    let output = Command::new("scutil").arg("--dns").output();
    let Ok(out) = output else { return Vec::new(); };
    if !out.status.success() {
        return Vec::new();
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut servers = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("nameserver[") {
            if let Some(idx) = rest.find(": ") {
                let server = rest[idx + 2..].trim().to_string();
                if !server.is_empty() && !servers.contains(&server) {
                    servers.push(server);
                }
            }
        }
    }
    servers
}

fn should_use_proxy(no_proxy_dns: &[String]) -> bool {
    if no_proxy_dns.is_empty() {
        return true;
    }
    let current = read_current_dns_servers();
    if current.is_empty() {
        return true;
    }
    !current.iter().any(|c| no_proxy_dns.iter().any(|d| d == c))
}

// 按指定线路（代理或直连）请求一次 /api/oauth/usage
async fn request_claude_usage(token: &str, proxy_url: Option<&str>) -> Result<ClaudeOauthRaw, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(p) = proxy_url {
        let proxy =
            reqwest::Proxy::all(p).map_err(|e| format!("代理地址无效 ({}): {}", p, e))?;
        builder = builder.proxy(proxy);
    } else {
        // 直连时忽略系统/环境变量中的代理设置
        builder = builder.no_proxy();
    }
    let client = builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

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
        if status.as_u16() == 429 {
            return Err("请求过于频繁 (429)，当前出口 IP 被限流，请稍后重试".to_string());
        }
        return Err(format!("API 返回 {}: {}", status, body));
    }

    response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))
}

async fn fetch_claude_usage_from_api() -> Result<ClaudeCodeUsageResult, String> {
    let token = read_oauth_token()?;
    let settings = load_settings().unwrap_or_default();
    let proxy_url = {
        let p = settings.proxy_url.trim();
        if p.is_empty() {
            None
        } else {
            Some(p.to_string())
        }
    };

    // 按 DNS 白名单决定首选线路；失败后自动切换另一条线路重试，
    // 避免 DNS 判断与实际网络环境不符时（如公司 DNS 变更）彻底拿不到数据
    let prefer_proxy = proxy_url.is_some() && should_use_proxy(&settings.no_proxy_dns);
    let routes: Vec<Option<String>> = match (&proxy_url, prefer_proxy) {
        (Some(p), true) => vec![Some(p.clone()), None],
        (Some(p), false) => vec![None, Some(p.clone())],
        (None, _) => vec![None],
    };

    let mut last_err = String::new();
    for route in routes {
        match request_claude_usage(&token, route.as_deref()).await {
            Ok(raw) => {
                return Ok(ClaudeCodeUsageResult {
                    five_hour: raw.five_hour,
                    seven_day: raw.seven_day,
                    seven_day_opus: raw.seven_day_opus,
                    seven_day_sonnet: raw.seven_day_sonnet,
                    seven_day_fable: raw
                        .limits
                        .as_deref()
                        .and_then(|l| extract_model_window(l, "fable")),
                    extra_usage: raw.extra_usage,
                    via_proxy: route.is_some(),
                    proxy_url: route,
                    local_usage: None,
                });
            }
            Err(e) => {
                // token 过期换线路也无济于事，直接返回
                if e.contains("OAuth token 已过期") {
                    return Err(e);
                }
                // 429 是账号/出口 IP 被限流，换线路只会再吃一次限流，不回退
                if e.contains("请求过于频繁 (429)") {
                    return Err(e);
                }
                last_err = if last_err.is_empty() {
                    e
                } else {
                    format!("{}；切换线路重试仍失败: {}", last_err, e)
                };
            }
        }
    }
    Err(last_err)
}

// 取窗口重置时间逆推窗口起点；API 未返回重置时间时退化为「当前时间 - 窗口时长」
fn window_start(
    window: &Option<ClaudeOauthWindow>,
    duration: chrono::Duration,
    now: chrono::DateTime<chrono::Utc>,
) -> chrono::DateTime<chrono::Utc> {
    window
        .as_ref()
        .and_then(|w| w.resets_at.as_deref())
        .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
        .map(|t| t.with_timezone(&chrono::Utc) - duration)
        .unwrap_or(now - duration)
}

#[tauri::command]
pub async fn fetch_claude_code_usage() -> Result<ClaudeCodeUsageResult, String> {
    let mut result = fetch_claude_usage_from_api().await?;

    let now = chrono::Utc::now();
    let five_hour_start = window_start(&result.five_hour, chrono::Duration::hours(5), now);
    let seven_day_start = window_start(&result.seven_day, chrono::Duration::days(7), now);

    // 本地日志统计仅作附加展示，失败不影响限额数据
    result.local_usage = tauri::async_runtime::spawn_blocking(move || {
        scan_local_claude_usage(five_hour_start, seven_day_start)
    })
    .await
    .ok()
    .and_then(|r| r.ok());
    Ok(result)
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

// ===== 火山引擎账户余额（OpenAPI QueryBalanceAcct，需 AK/SK 签名） =====

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolcengineBalanceResult {
    pub available_balance: f64,
    pub cash_balance: f64,
    pub credit_limit: f64,
    pub freeze_amount: f64,
    pub arrears_balance: f64,
}

fn hmac_sha256(key: &[u8], data: &str) -> Vec<u8> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    let mut mac =
        <Hmac<Sha256> as Mac>::new_from_slice(key).expect("HMAC 可接受任意长度的 key");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(data))
}

// 兼容数字与字符串两种格式的金额字段
fn json_to_f64(value: Option<&serde_json::Value>) -> f64 {
    match value {
        Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

#[tauri::command]
pub async fn fetch_volcengine_balance(
    access_key: String,
    secret_key: String,
) -> Result<VolcengineBalanceResult, String> {
    const HOST: &str = "billing.volcengineapi.com";
    const REGION: &str = "cn-north-1";
    const SERVICE: &str = "billing";
    const QUERY: &str = "Action=QueryBalanceAcct&Version=2022-01-01";

    let now = chrono::Utc::now();
    let x_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let short_date = now.format("%Y%m%d").to_string();

    // 火山引擎签名 V4：CanonicalRequest -> StringToSign -> 派生签名密钥 -> Signature
    let payload_hash = sha256_hex(b"");
    let canonical_headers = format!(
        "host:{}\nx-content-sha256:{}\nx-date:{}\n",
        HOST, payload_hash, x_date
    );
    let signed_headers = "host;x-content-sha256;x-date";
    let canonical_request = format!(
        "GET\n/\n{}\n{}\n{}\n{}",
        QUERY, canonical_headers, signed_headers, payload_hash
    );

    let credential_scope = format!("{}/{}/{}/request", short_date, REGION, SERVICE);
    let string_to_sign = format!(
        "HMAC-SHA256\n{}\n{}\n{}",
        x_date,
        credential_scope,
        sha256_hex(canonical_request.as_bytes())
    );

    let k_date = hmac_sha256(secret_key.as_bytes(), &short_date);
    let k_region = hmac_sha256(&k_date, REGION);
    let k_service = hmac_sha256(&k_region, SERVICE);
    let k_signing = hmac_sha256(&k_service, "request");
    let signature = hex::encode(hmac_sha256(&k_signing, &string_to_sign));

    let authorization = format!(
        "HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key, credential_scope, signed_headers, signature
    );

    let client = reqwest::Client::new();
    let response = client
        .get(format!("https://{}/?{}", HOST, QUERY))
        .header("X-Date", &x_date)
        .header("X-Content-Sha256", &payload_hash)
        .header("Authorization", authorization)
        .send()
        .await
        .map_err(|e| format!("请求火山引擎余额接口失败: {}", e))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析火山引擎响应失败: {}", e))?;

    if let Some(err) = body.pointer("/ResponseMetadata/Error") {
        let code = err.get("Code").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let msg = err.get("Message").and_then(|v| v.as_str()).unwrap_or("");
        return Err(format!("火山引擎 API 错误 ({}): {}", code, msg));
    }
    if !status.is_success() {
        return Err(format!("火山引擎 API 返回 HTTP {}", status));
    }

    let result = body
        .get("Result")
        .ok_or_else(|| "火山引擎响应缺少 Result 字段".to_string())?;

    Ok(VolcengineBalanceResult {
        available_balance: json_to_f64(result.get("AvailableBalance")),
        cash_balance: json_to_f64(result.get("CashBalance")),
        credit_limit: json_to_f64(result.get("CreditLimit")),
        freeze_amount: json_to_f64(result.get("FreezeAmount")),
        arrears_balance: json_to_f64(result.get("ArrearsBalance")),
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

    #[test]
    fn model_is_fable_matches_prefix() {
        assert!(model_is_fable(Some("claude-fable-5")));
        assert!(model_is_fable(Some("claude-fable-6")));
        assert!(!model_is_fable(Some("claude-opus-4-8")));
        assert!(!model_is_fable(Some("claude-sonnet-5")));
        assert!(!model_is_fable(None));
    }
}
