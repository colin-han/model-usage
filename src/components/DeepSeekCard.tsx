import type { DeepSeekUsageData } from '../types';

interface DeepSeekCardProps {
  data: DeepSeekUsageData | null;
  error?: string | null;
  loading?: boolean;
}

function getBalanceBgColor(totalBalance: number): string {
  if (totalBalance < 2) return 'bg-red-500/20 border-red-500/30';
  if (totalBalance < 5) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-white/5 border-white/10';
}

export function DeepSeekCard({ data, error, loading }: DeepSeekCardProps) {
  if (!data) {
    return (
      <div className="glass-card p-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">🧠 DeepSeek</h2>
        <p className={`text-white/50 text-sm ${loading ? 'animate-pulse' : ''}`}>
          {loading ? '加载中...' : error ? `数据获取失败: ${error}` : '未配置 API Key'}
        </p>
      </div>
    );
  }

  const totalBalance = data.balance
    ? parseFloat(data.balance.balance_infos[0]?.total_balance || '0')
    : 0;

  const bgColor = getBalanceBgColor(totalBalance);

  return (
    <div className="glass-card p-4">
      <h2 className="text-lg font-bold text-white/90 mb-2">🧠 DeepSeek</h2>
      <div className={`rounded-xl px-3 py-2 border ${bgColor}`}>
        <div className="text-xs text-white/60">总余额</div>
        <div className="text-lg font-semibold text-white/90">¥{totalBalance.toFixed(2)}</div>
      </div>
    </div>
  );
}
