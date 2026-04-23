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

// Windsurf 配额信息
export interface WindsurfQuotaInfo {
  remainingPercent: number;
  resetAtUnix: string | null;
}

// Windsurf Flex 积分（可选）
export interface WindsurfFlexCredits {
  available: number;
}

// Windsurf 配额数据
export interface WindsurfQuotaData {
  planName: string | null;
  dailyQuota: WindsurfQuotaInfo;
  weeklyQuota: WindsurfQuotaInfo;
  flexCredits: WindsurfFlexCredits | null;
}

// 使用数据
export interface UsageData {
  zhipu: ZhipuQuotaData | null;
  windsurf: WindsurfQuotaData | null;
  lastUpdated: string | null;
  error: string | null;
  zhipuError: string | null;
  windsurfError: string | null;
}
