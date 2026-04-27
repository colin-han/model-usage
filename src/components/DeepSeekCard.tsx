import type { DeepSeekUsageData } from '../types';

interface DeepSeekCardProps {
  data: DeepSeekUsageData | null;
  error?: string | null;
}

function getBalanceBgColor(totalBalance: number): string {
  if (totalBalance < 2) return 'bg-red-500/20 border-red-500/30';
  if (totalBalance < 5) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-white/5 border-white/10';
}

export function DeepSeekCard({ data, error }: DeepSeekCardProps) {
  if (!data) {
    return (
      <div className="glass-card p-4 mb-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">🧠 DeepSeek</h2>
        <p className="text-white/50 text-sm">
          {error ? `数据获取失败: ${error}` : '未配置 API Key'}
        </p>
      </div>
    );
  }

  const totalBalance = data.balance
    ? parseFloat(data.balance.balance_infos[0]?.total_balance || '0')
    : 0;

  const bgColor = getBalanceBgColor(totalBalance);

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-white/90">🧠 DeepSeek</h2>
        <div className={`rounded-xl px-4 py-2 border ${bgColor}`}>
          <span className="text-xs text-white/60 mr-2">总余额</span>
          <span className="text-lg font-semibold text-white/90">¥{totalBalance.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
