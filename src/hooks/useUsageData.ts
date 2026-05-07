import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, UsageData, ZhipuQuotaData, DeepSeekUsageData, DeepSeekBalanceData, ClaudeCodeUsageData } from '../types';

// 智谱 unit 枚举：3=五小时, 5=月, 6=周
const UNIT_LABELS: Record<number, string> = {
  3: '每五小时',
  5: '每月',
  6: '每周',
};

function parseZhipuResponse(json: Record<string, unknown>): ZhipuQuotaData {
  const data = json.data as { limits: Array<Record<string, unknown>>; level: string };
  const limits = data.limits || [];

  return {
    limits: limits.map(limit => ({
      type: limit.type as string,
      unit: limit.unit as number,
      unitLabel: UNIT_LABELS[limit.unit as number] || `未知(${limit.unit})`,
      number: limit.number as number,
      percentage: limit.percentage as number,
      nextResetTime: limit.nextResetTime as number,
      usage: limit.usage as number | undefined,
      currentValue: limit.currentValue as number | undefined,
      remaining: limit.remaining as number | undefined,
      usageDetails: limit.usageDetails as { modelCode: string; usage: number }[] | undefined,
    })),
    level: data.level as string,
  };
}

async function fetchDeepSeekData(apiKey: string): Promise<DeepSeekUsageData> {
  const resp = await fetch('https://api.deepseek.com/user/balance', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`余额查询失败: HTTP ${resp.status}`);
  }
  const balance = await resp.json() as DeepSeekBalanceData;

  return { balance };
}

export function useUsageData(settings: AppSettings, enabled: boolean) {
  const [data, setData] = useState<UsageData>({
    zhipu: null,
    deepseek: null,
    claudeCode: null,
    lastUpdated: null,
    error: null,
    zhipuError: null,
    deepseekError: null,
    claudeCodeError: null,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    // 即使未配置 API Key，仍然尝试拉取 Windsurf / Claude Code 本地数据

    setLoading(true);
    setData(prev => ({ ...prev, error: null, zhipuError: null, deepseekError: null, claudeCodeError: null }));

    try {
      let zhipuData: ZhipuQuotaData | null = null;
      let zhipuError: string | null = null;
      let deepseekData: DeepSeekUsageData | null = null;
      let deepseekError: string | null = null;
      let claudeCodeData: ClaudeCodeUsageData | null = null;
      let claudeCodeError: string | null = null;

      // 获取智谱数据
      if (settings.zhipuApiKey) {
        try {
          const resp = await fetch('https://bigmodel.cn/api/monitor/usage/quota/limit', {
            headers: { 'Authorization': `Bearer ${settings.zhipuApiKey}` },
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const json = await resp.json();
          if (!json.success) throw new Error(`API 错误: ${json.msg || json.code}`);
          zhipuData = parseZhipuResponse(json);
        } catch (err) {
          zhipuError = err instanceof Error ? err.message : '获取智谱数据失败';
        }
      }

      // 获取 DeepSeek 数据
      if (settings.deepseekApiKey) {
        try {
          deepseekData = await fetchDeepSeekData(settings.deepseekApiKey);
        } catch (err) {
          deepseekError = err instanceof Error ? err.message : '获取 DeepSeek 数据失败';
        }
      }

      // 获取 Claude Code 用量
      try {
        claudeCodeData = await invoke<ClaudeCodeUsageData>('fetch_claude_code_usage');
      } catch (err) {
        if (typeof err === 'string') {
          claudeCodeError = err;
        } else if (err instanceof Error) {
          claudeCodeError = err.message;
        } else {
          claudeCodeError = JSON.stringify(err);
        }
      }

      setData({
        zhipu: zhipuData,
        deepseek: deepseekData,
        claudeCode: claudeCodeData,
        lastUpdated: new Date().toISOString(),
        error: null,
        zhipuError,
        deepseekError,
        claudeCodeError,
      });
    } catch (err) {
      setData(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : '获取数据失败',
      }));
    } finally {
      setLoading(false);
    }
  }, [settings.zhipuApiKey, settings.deepseekApiKey]);

  useEffect(() => {
    if (!enabled) return;
    fetchData();
    const intervalMs = Math.max(30, settings.refreshIntervalSec) * 1000;
    const interval = setInterval(fetchData, intervalMs);
    return () => clearInterval(interval);
  }, [fetchData, enabled, settings.refreshIntervalSec]);

  return { data, loading, refresh: fetchData };
}
