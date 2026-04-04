import { useState, useEffect, useCallback } from 'react';
import type { UsageData, ZhipuQuotaData } from '../types';

const ZHIPU_API_KEY = import.meta.env.VITE_ZHIPU_API_KEY || '';

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

export function useUsageData() {
  const [data, setData] = useState<UsageData>({
    zhipu: null,
    lastUpdated: null,
    error: null,
    zhipuError: null,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!ZHIPU_API_KEY) {
      setData(prev => ({ ...prev, error: '请在 .env.local 中配置 VITE_ZHIPU_API_KEY（参考 .env.local.example）' }));
      return;
    }

    setLoading(true);
    setData(prev => ({ ...prev, error: null, zhipuError: null }));

    try {
      let zhipuData: ZhipuQuotaData | null = null;
      let zhipuError: string | null = null;

      try {
        const resp = await fetch('https://bigmodel.cn/api/monitor/usage/quota/limit', {
          headers: { 'Authorization': `Bearer ${ZHIPU_API_KEY}` },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (!json.success) throw new Error(`API 错误: ${json.msg || json.code}`);
        zhipuData = parseZhipuResponse(json);
      } catch (err) {
        zhipuError = err instanceof Error ? err.message : '获取智谱数据失败';
      }

      setData({
        zhipu: zhipuData,
        lastUpdated: new Date().toISOString(),
        error: null,
        zhipuError,
      });
    } catch (err) {
      setData(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : '获取数据失败',
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, refresh: fetchData };
}
