import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, UsageData, ZhipuQuotaData, DeepSeekUsageData, DeepSeekBalanceData, VolcengineBalanceData, AliyunBalanceData, ClaudeCodeUsageData, DiskUsageData } from '../types';

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
    volcengine: null,
    aliyun: null,
    claudeCode: null,
    diskUsage: null,
    lastUpdated: null,
    error: null,
    zhipuError: null,
    deepseekError: null,
    volcengineError: null,
    aliyunError: null,
    claudeCodeError: null,
    diskUsageError: null,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    // 即使未配置 API Key，仍然尝试拉取 Windsurf / Claude Code 本地数据

    setLoading(true);
    // 注意：这里不清空上次的错误，刷新期间前端依赖旧错误判断"上次失败且正在加载"的 loading 态，
    // 本轮结果会在末尾的 setData 中整体覆盖。

    try {
      let zhipuData: ZhipuQuotaData | null = null;
      let zhipuError: string | null = null;
      let deepseekData: DeepSeekUsageData | null = null;
      let deepseekError: string | null = null;
      let volcengineData: VolcengineBalanceData | null = null;
      let volcengineError: string | null = null;
      let aliyunData: AliyunBalanceData | null = null;
      let aliyunError: string | null = null;
      let claudeCodeData: ClaudeCodeUsageData | null = null;
      let claudeCodeError: string | null = null;
      let diskUsageData: DiskUsageData | null = null;
      let diskUsageError: string | null = null;

      // 获取智谱数据
      if (settings.showZhipu && settings.zhipuApiKey) {
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
      if (settings.showDeepseek && settings.deepseekApiKey) {
        try {
          deepseekData = await fetchDeepSeekData(settings.deepseekApiKey);
        } catch (err) {
          deepseekError = err instanceof Error ? err.message : '获取 DeepSeek 数据失败';
        }
      }

      // 获取火山引擎账户余额（需 AK/SK 签名，走 Rust 后端）
      if (settings.showVolcengine && settings.volcengineAccessKey && settings.volcengineSecretKey) {
        try {
          volcengineData = await invoke<VolcengineBalanceData>('fetch_volcengine_balance', {
            accessKey: settings.volcengineAccessKey,
            secretKey: settings.volcengineSecretKey,
          });
        } catch (err) {
          if (typeof err === 'string') {
            volcengineError = err;
          } else if (err instanceof Error) {
            volcengineError = err.message;
          } else {
            volcengineError = JSON.stringify(err);
          }
        }
      }

      // 获取阿里云账户余额（需 AK/SK 签名，走 Rust 后端）
      if (settings.showAliyun && settings.aliyunAccessKey && settings.aliyunSecretKey) {
        try {
          aliyunData = await invoke<AliyunBalanceData>('fetch_aliyun_balance', {
            accessKey: settings.aliyunAccessKey,
            secretKey: settings.aliyunSecretKey,
          });
        } catch (err) {
          if (typeof err === 'string') {
            aliyunError = err;
          } else if (err instanceof Error) {
            aliyunError = err.message;
          } else {
            aliyunError = JSON.stringify(err);
          }
        }
      }

      // 获取 Claude Code 用量
      if (settings.showClaudeCode) {
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
      }

      // 获取磁盘使用量
      if (settings.showDiskUsage) {
        try {
          diskUsageData = await invoke<DiskUsageData>('get_disk_usage');
        } catch (err) {
          if (typeof err === 'string') {
            diskUsageError = err;
          } else if (err instanceof Error) {
            diskUsageError = err.message;
          } else {
            diskUsageError = JSON.stringify(err);
          }
        }
      }

      setData({
        zhipu: zhipuData,
        deepseek: deepseekData,
        volcengine: volcengineData,
        aliyun: aliyunData,
        claudeCode: claudeCodeData,
        diskUsage: diskUsageData,
        lastUpdated: new Date().toISOString(),
        error: null,
        zhipuError,
        deepseekError,
        volcengineError,
        aliyunError,
        claudeCodeError,
        diskUsageError,
      });
    } catch (err) {
      setData(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : '获取数据失败',
      }));
    } finally {
      setLoading(false);
    }
  }, [
    settings.zhipuApiKey,
    settings.deepseekApiKey,
    settings.volcengineAccessKey,
    settings.volcengineSecretKey,
    settings.aliyunAccessKey,
    settings.aliyunSecretKey,
    settings.showClaudeCode,
    settings.showZhipu,
    settings.showDeepseek,
    settings.showVolcengine,
    settings.showAliyun,
    settings.showDiskUsage,
  ]);

  useEffect(() => {
    if (!enabled) return;
    fetchData();
    const intervalMs = Math.max(30, settings.refreshIntervalSec) * 1000;
    const interval = setInterval(fetchData, intervalMs);
    return () => clearInterval(interval);
  }, [fetchData, enabled, settings.refreshIntervalSec]);

  return { data, loading, refresh: fetchData };
}
