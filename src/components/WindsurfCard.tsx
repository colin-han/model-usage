import type { WindsurfQuotaData } from '../types';

interface WindsurfCardProps {
  data: WindsurfQuotaData | null;
  error?: string | null;
}

function formatResetTime(unixTimestampStr: string | null): string {
  if (!unixTimestampStr) return '未知时间';
  const unixTimestamp = parseInt(unixTimestampStr, 10);
  if (isNaN(unixTimestamp)) return '无效时间';

  const date = new Date(unixTimestamp * 1000);
  const now = Date.now();
  const diff = unixTimestamp * 1000 - now;

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

function getQuotaColor(usedPercent: number, timePercent?: number): string {
  if (typeof timePercent === 'number') {
    if (usedPercent > timePercent) return 'bg-red-400';
    return 'bg-green-400';
  }
  if (usedPercent >= 90) return 'bg-red-400';
  if (usedPercent >= 70) return 'bg-yellow-400';
  return 'bg-cyan-400';
}

function getTimePercentage(resetAtUnix: string | null, windowHours: number): number {
  if (!resetAtUnix) return 0;
  const resetTime = parseInt(resetAtUnix, 10) * 1000;
  const windowMs = windowHours * 60 * 60 * 1000;
  const startTime = resetTime - windowMs;
  const now = Date.now();
  const percent = ((now - startTime) / windowMs) * 100;
  return Math.max(0, Math.min(100, percent));
}

function QuotaItem({ label, remainingPercent, resetAtUnix, windowHours }: {
  label: string;
  remainingPercent: number;
  resetAtUnix: string | null;
  windowHours: number;
}) {
  const usedPercent = 100 - remainingPercent;
  const timePercent = getTimePercentage(resetAtUnix, windowHours);

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-white/80">{label}</span>
        <span className="text-sm text-white/60">
          {usedPercent.toFixed(1)}%
        </span>
      </div>
      <div className={`glass-progress-bg w-full h-2 ${windowHours > 0 ? 'mb-px' : 'mb-1'}`}>
        <div
          className={`${getQuotaColor(usedPercent, timePercent)} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(usedPercent, 100)}%` }}
        />
      </div>
      {windowHours > 0 && (
        <div className="glass-progress-bg w-full h-px mb-1">
          <div
            className="bg-white/30 h-px rounded-full transition-all duration-300"
            style={{ width: `${timePercent}%` }}
          />
        </div>
      )}
      <div className="flex justify-between items-center">
        <p className="text-xs text-white/50">
          重置: {formatResetTime(resetAtUnix)}
        </p>
        <p className="text-xs text-white/40">
          剩余 {remainingPercent.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}

export function WindsurfCard({ data, error }: WindsurfCardProps) {
  if (!data) {
    return (
      <div className="glass-card p-4 mb-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">🌊 Windsurf</h2>
        <p className="text-white/50 text-sm">
          {error ? `数据获取失败: ${error}` : '未找到 Windsurf 安装或未登录'}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-white/90">🌊 Windsurf</h2>
        {data.planName && (
          <span className="text-xs glass-badge px-2 py-0.5 rounded-full">
            {data.planName}
          </span>
        )}
      </div>

      <QuotaItem
        label="每日配额"
        remainingPercent={data.dailyQuota.remainingPercent}
        resetAtUnix={data.dailyQuota.resetAtUnix}
        windowHours={24}
      />

      <QuotaItem
        label="每周配额"
        remainingPercent={data.weeklyQuota.remainingPercent}
        resetAtUnix={data.weeklyQuota.resetAtUnix}
        windowHours={168}
      />

      {data.flexCredits && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-xs text-white/60">
            Flex 积分: {data.flexCredits.available}
          </p>
        </div>
      )}
    </div>
  );
}
