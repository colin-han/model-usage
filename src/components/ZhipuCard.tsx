import type { ZhipuQuotaData, ZhipuLimitItem } from '../types';

interface ZhipuCardProps {
  data: ZhipuQuotaData | null;
  error?: string | null;
  loading?: boolean;
}

function formatResetTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  const date = new Date(timestamp);
  const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (diff <= 0) return `已重置 (${timeStr})`;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}天${hours % 24}小时后 (${timeStr})`;
  }
  return `${hours}小时${minutes}分钟后 (${timeStr})`;
}

const CYCLE_DURATIONS: Record<number, number> = {
  3: 5 * 60 * 60 * 1000,        // 五小时
  5: 30 * 24 * 60 * 60 * 1000,  // 30 天
  6: 7 * 24 * 60 * 60 * 1000,   // 七天
};

function getTimePercentage(nextResetTime: number, unit: number): number {
  const duration = CYCLE_DURATIONS[unit];
  if (!duration) return 0;
  const start = nextResetTime - duration;
  const now = Date.now();
  const percent = ((now - start) / duration) * 100;
  return Math.max(0, Math.min(100, percent));
}

function getUsageColor(tokenPercent: number, timePercent?: number): string {
  if (typeof timePercent === 'number') {
    if (tokenPercent > timePercent) return 'bg-red-400';
    return 'bg-green-400';
  }
  if (tokenPercent >= 90) return 'bg-red-400';
  if (tokenPercent >= 70) return 'bg-yellow-400';
  return 'bg-blue-400';
}

function getTypeLabel(type: string): string {
  if (type === 'TOKENS_LIMIT') return 'Token 限额';
  if (type === 'TIME_LIMIT') return '时长限额';
  return type;
}

function getLimitLabel(item: ZhipuLimitItem): string {
  if (item.type === 'TIME_LIMIT' && item.unit === 5) return 'MCP每月额度';
  return `${getTypeLabel(item.type)} · ${item.unitLabel}`;
}

function LimitItem({ item }: { item: ZhipuLimitItem }) {
  const hasTimeBar = CYCLE_DURATIONS[item.unit] != null;
  const timePercentage = hasTimeBar
    ? getTimePercentage(item.nextResetTime, item.unit)
    : undefined;

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-white/80">
          {getLimitLabel(item)}
        </span>
        <span className="text-sm text-white/60">
          {item.percentage.toFixed(1)}%
        </span>
      </div>
      <div className={`glass-progress-bg w-full h-2 ${hasTimeBar ? 'mb-px' : 'mb-1'}`}>
        <div
          className={`${getUsageColor(item.percentage, timePercentage)} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(item.percentage, 100)}%` }}
        />
      </div>
      {hasTimeBar && (
        <div className="glass-progress-bg w-full h-px mb-1">
          <div
            className="bg-white/30 h-px rounded-full transition-all duration-300"
            style={{ width: `${timePercentage}%` }}
          />
        </div>
      )}
      <div className="flex justify-between items-center">
        <p className="text-xs text-white/50">
          重置: {formatResetTime(item.nextResetTime)}
        </p>
        {item.type === 'TIME_LIMIT' && item.usage != null && (
          <p className="text-xs text-white/40">
            {item.remaining}/{item.usage}
          </p>
        )}
      </div>
    </div>
  );
}

export function ZhipuCard({ data, error, loading }: ZhipuCardProps) {
  if (!data) {
    return (
      <div className="glass-card p-4 mb-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">🤖 智谱 AI</h2>
        <p className={`text-white/50 text-sm ${loading ? 'animate-pulse' : ''}`}>
          {loading ? '加载中...' : error ? `数据获取失败: ${error}` : '未配置 API Key'}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-white/90">🤖 智谱 AI</h2>
        {data.level && (
          <span className="text-xs glass-badge px-2 py-0.5 rounded-full">
            {data.level}
          </span>
        )}
      </div>

      {data.limits.map((limit, index) => (
        <LimitItem key={`${limit.type}-${limit.unit}-${index}`} item={limit} />
      ))}
    </div>
  );
}
