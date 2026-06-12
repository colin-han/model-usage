// 智谱 AI 限制项
export interface ZhipuLimitItem {
  type: string;           // TOKENS_LIMIT | TIME_LIMIT
  unit: number;           // 3=五小时, 5=月, 6=周
  unitLabel: string;      // 中文标签
  number: number;         // 限制数量
  percentage: number;     // 已使用百分比 (0-100)
  nextResetTime: number;  // 重置时间戳（毫秒）
  usage?: number;         // TIME_LIMIT 时的总量
  currentValue?: number; // TIME_LIMIT 时的当前值
  remaining?: number;     // TIME_LIMIT 时的剩余
  usageDetails?: { modelCode: string; usage: number }[];
}

// 智谱 AI 额度数据
export interface ZhipuQuotaData {
  limits: ZhipuLimitItem[];
  level: string;
}

// DeepSeek 余额信息
export interface DeepSeekBalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

// DeepSeek 余额响应
export interface DeepSeekBalanceData {
  balance_infos: DeepSeekBalanceInfo[];
}

// DeepSeek 用量数据
export interface DeepSeekUsageData {
  balance: DeepSeekBalanceData | null;
}

// 火山引擎账户余额（来自 OpenAPI QueryBalanceAcct）
export interface VolcengineBalanceData {
  availableBalance: number;
  cashBalance: number;
  creditLimit: number;
  freezeAmount: number;
  arrearsBalance: number;
}

// Claude Code 订阅用量窗口（来自 /api/oauth/usage）
export interface ClaudeCodeUsageWindow {
  utilization: number;       // 已使用百分比 (0-100)
  resets_at: string | null;  // ISO8601 时间戳
}

// Claude Code 额外（按量付费）用量
export interface ClaudeCodeExtraUsage {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
  currency: string | null;
}

// Claude Code 本地日志用量统计（窗口起点与官方限额窗口对齐）
export interface ClaudeLocalUsage {
  fiveHourTokens: number;
  sevenDayTokens: number;
}

// Claude Code 用量数据
export interface ClaudeCodeUsageData {
  fiveHour: ClaudeCodeUsageWindow | null;
  sevenDay: ClaudeCodeUsageWindow | null;
  sevenDayOpus: ClaudeCodeUsageWindow | null;
  sevenDaySonnet: ClaudeCodeUsageWindow | null;
  extraUsage: ClaudeCodeExtraUsage | null;
  viaProxy: boolean;
  proxyUrl?: string;
  localUsage?: ClaudeLocalUsage | null;
}

// 磁盘使用量数据
export interface DiskUsageData {
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  percentage: number;
}

// 应用设置
export interface AppSettings {
  zhipuApiKey: string;
  deepseekApiKey: string;
  volcengineAccessKey: string;
  volcengineSecretKey: string;
  showClaudeCode: boolean;
  showZhipu: boolean;
  showDeepseek: boolean;
  showVolcengine: boolean;
  showDiskUsage: boolean;
  refreshIntervalSec: number;
  proxyUrl: string;
  noProxyDns: string[];
}

// 使用数据
export interface UsageData {
  zhipu: ZhipuQuotaData | null;
  deepseek: DeepSeekUsageData | null;
  volcengine: VolcengineBalanceData | null;
  claudeCode: ClaudeCodeUsageData | null;
  diskUsage: DiskUsageData | null;
  lastUpdated: string | null;
  error: string | null;
  zhipuError: string | null;
  deepseekError: string | null;
  volcengineError: string | null;
  claudeCodeError: string | null;
  diskUsageError: string | null;
}
