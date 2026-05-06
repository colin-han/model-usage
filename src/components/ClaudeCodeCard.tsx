import type { ClaudeCodeUsageData, ClaudeCodeUsageWindow } from '../types';

interface ClaudeCodeCardProps {
  data: ClaudeCodeUsageData | null;
  error?: string | null;
}

function formatResetTime(iso: string | null): string {
  if (!iso) return '';
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return '已重置';
  const totalMin = Math.round(diffMs / 60000);
  if (totalMin < 60) return `${totalMin} 分钟后重置`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) return mins > 0 ? `${hours}小时${mins}分后重置` : `${hours}小时后重置`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}天${remHours}小时后重置` : `${days}天后重置`;
}

function utilizationColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500/70';
  if (pct >= 70) return 'bg-orange-500/70';
  if (pct >= 40) return 'bg-yellow-400/70';
  return 'bg-green-500/70';
}

function UsageRow({ title, window }: { title: string; window: ClaudeCodeUsageWindow | null }) {
  if (!window) return null;
  const pct = Math.max(0, Math.min(100, window.utilization));
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-white/80">{title}</span>
        <span className="text-sm text-white/60">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full ${utilizationColor(pct)} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {window.resets_at && (
        <div className="mt-1 text-[11px] text-white/50">{formatResetTime(window.resets_at)}</div>
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

  const hasAny =
    data.fiveHour || data.sevenDay || data.sevenDayOpus || data.sevenDaySonnet;

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-bold text-white/90">🤖 Claude Code</h2>
        {data.extraUsage?.is_enabled && (
          <span className="text-xs glass-badge px-2 py-0.5 rounded-full">已启用按量付费</span>
        )}
      </div>

      {!hasAny ? (
        <p className="text-white/50 text-sm">订阅暂无可用配额信息</p>
      ) : (
        <>
          <UsageRow title="5 小时窗口" window={data.fiveHour} />
          <UsageRow title="7 天窗口" window={data.sevenDay} />
          <UsageRow title="7 天 Opus" window={data.sevenDayOpus} />
          <UsageRow title="7 天 Sonnet" window={data.sevenDaySonnet} />
        </>
      )}

      {data.extraUsage?.is_enabled && data.extraUsage.utilization !== null && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <UsageRow
            title={`额外用量${data.extraUsage.currency ? ` (${data.extraUsage.currency})` : ''}`}
            window={{
              utilization: data.extraUsage.utilization ?? 0,
              resets_at: null,
            }}
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
