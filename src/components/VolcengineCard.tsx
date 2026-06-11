import type { VolcengineBalanceData } from '../types';

interface VolcengineCardProps {
  data: VolcengineBalanceData | null;
  error?: string | null;
  loading?: boolean;
}

function getBalanceBgColor(availableBalance: number): string {
  if (availableBalance < 2) return 'bg-red-500/20 border-red-500/30';
  if (availableBalance < 5) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-white/5 border-white/10';
}

export function VolcengineCard({ data, error, loading }: VolcengineCardProps) {
  if (!data) {
    return (
      <div className="glass-card p-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">🌋 火山引擎</h2>
        <p className={`text-white/50 text-sm ${loading ? 'animate-pulse' : ''}`}>
          {loading ? '加载中...' : error ? `数据获取失败: ${error}` : '未配置 AK/SK'}
        </p>
      </div>
    );
  }

  const bgColor = getBalanceBgColor(data.availableBalance);

  return (
    <div className="glass-card p-4">
      <h2 className="text-lg font-bold text-white/90 mb-2">🌋 火山引擎</h2>
      <div className={`rounded-xl px-3 py-2 border ${bgColor}`}>
        <div className="text-xs text-white/60">可用余额</div>
        <div className="text-lg font-semibold text-white/90">
          ¥{data.availableBalance.toFixed(2)}
        </div>
      </div>
      {data.arrearsBalance > 0 && (
        <p className="mt-2 text-xs text-red-300">欠费 ¥{data.arrearsBalance.toFixed(2)}</p>
      )}
    </div>
  );
}
