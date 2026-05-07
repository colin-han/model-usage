import type { ClaudeCodeUsageData, ClaudeCodeUsageWindow } from '../types';

interface ClaudeCodeCardProps {
  data: ClaudeCodeUsageData | null;
  error?: string | null;
}

type WindowKey = 'fiveHour' | 'sevenDay' | 'sevenDayOpus' | 'sevenDaySonnet';

const WINDOW_DURATIONS: Record<WindowKey, number> = {
  fiveHour: 5 * 60 * 60 * 1000,
  sevenDay: 7 * 24 * 60 * 60 * 1000,
  sevenDayOpus: 7 * 24 * 60 * 60 * 1000,
  sevenDaySonnet: 7 * 24 * 60 * 60 * 1000,
};

const WINDOW_TITLES: Record<WindowKey, string> = {
  fiveHour: '5 小时窗口',
  sevenDay: '7 天窗口',
  sevenDayOpus: '7 天 Opus',
  sevenDaySonnet: '7 天 Sonnet',
};

function formatResetTime(iso: string | null): string {
  if (!iso) return '';
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';
  const date = new Date(target);
  const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  const diff = target - Date.now();
  if (diff <= 0) return `已重置 (${timeStr})`;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天${hours % 24}小时后 (${timeStr})`;
  return `${hours}小时${minutes}分钟后 (${timeStr})`;
}

function getTimePercentage(resetsAt: string, duration: number): number {
  const target = new Date(resetsAt).getTime();
  if (Number.isNaN(target)) return 0;
  const start = target - duration;
  const percent = ((Date.now() - start) / duration) * 100;
  return Math.max(0, Math.min(100, percent));
}

function getUsageColor(usagePct: number, timePct?: number): string {
  if (typeof timePct === 'number') {
    return usagePct > timePct ? 'bg-red-400' : 'bg-green-400';
  }
  if (usagePct >= 90) return 'bg-red-400';
  if (usagePct >= 70) return 'bg-yellow-400';
  return 'bg-blue-400';
}

function UsageRow({
  title,
  window,
  duration,
}: {
  title: string;
  window: ClaudeCodeUsageWindow;
  duration: number | null;
}) {
  const usagePct = Math.max(0, Math.min(100, window.utilization));
  const timePct =
    duration != null && window.resets_at
      ? getTimePercentage(window.resets_at, duration)
      : undefined;
  const hasTimeBar = typeof timePct === 'number';

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-white/80">{title}</span>
        <span className="text-sm text-white/60">{usagePct.toFixed(1)}%</span>
      </div>
      <div className={`glass-progress-bg w-full h-2 ${hasTimeBar ? 'mb-px' : 'mb-1'}`}>
        <div
          className={`${getUsageColor(usagePct, timePct)} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${usagePct}%` }}
        />
      </div>
      {hasTimeBar && (
        <div className="glass-progress-bg w-full h-px mb-1">
          <div
            className="bg-white/30 h-px rounded-full transition-all duration-300"
            style={{ width: `${timePct}%` }}
          />
        </div>
      )}
      {window.resets_at && (
        <p className="text-xs text-white/50">重置: {formatResetTime(window.resets_at)}</p>
      )}
    </div>
  );
}

export function ClaudeCodeCard({ data, error }: ClaudeCodeCardProps) {
  if (!data) {
    return (
      <div className="glass-card p-4 mb-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">🤖 Claude Code</h2>
        <p className="text-white/50 text-sm">
          {error ? `数据获取失败: ${error}` : '加载中...'}
        </p>
      </div>
    );
  }

  const windows: Array<{ key: WindowKey; window: ClaudeCodeUsageWindow | null }> = [
    { key: 'fiveHour', window: data.fiveHour },
    { key: 'sevenDay', window: data.sevenDay },
    { key: 'sevenDayOpus', window: data.sevenDayOpus },
    { key: 'sevenDaySonnet', window: data.sevenDaySonnet },
  ];
  const visible = windows.filter(w => w.window !== null);

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-bold text-white/90">🤖 Claude Code</h2>
        {data.extraUsage?.is_enabled && (
          <span className="text-xs glass-badge px-2 py-0.5 rounded-full">已启用按量付费</span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-white/50 text-sm">订阅暂无可用配额信息</p>
      ) : (
        visible.map(({ key, window }) => (
          <UsageRow
            key={key}
            title={WINDOW_TITLES[key]}
            window={window!}
            duration={WINDOW_DURATIONS[key]}
          />
        ))
      )}

      {data.extraUsage?.is_enabled && data.extraUsage.utilization !== null && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <UsageRow
            title={`额外用量${data.extraUsage.currency ? ` (${data.extraUsage.currency})` : ''}`}
            window={{ utilization: data.extraUsage.utilization ?? 0, resets_at: null }}
            duration={null}
          />
          {data.extraUsage.monthly_limit !== null && (
            <div className="text-[11px] text-white/50">
              {data.extraUsage.used_credits ?? 0} / {data.extraUsage.monthly_limit}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
