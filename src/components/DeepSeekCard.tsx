import type { DeepSeekUsageData } from '../types';

interface DeepSeekCardProps {
  data: DeepSeekUsageData | null;
  error?: string | null;
}

function formatYuan(cost: number): string {
  return `¥${cost.toFixed(2)}`;
}

function getBalanceBgColor(totalBalance: number): string {
  if (totalBalance < 2) return 'bg-red-500/20 border-red-500/30';
  if (totalBalance < 5) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-white/5 border-white/10';
}

function getTodayCostBgColor(cost: number): string {
  if (cost > 20) return 'bg-red-500/20 border-red-500/30';
  if (cost > 5) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-white/5 border-white/10';
}

function getWeekCostBgColor(cost: number): string {
  if (cost > 50) return 'bg-red-500/20 border-red-500/30';
  if (cost > 20) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-white/5 border-white/10';
}

function MiniCard({ label, value, bgColor }: { label: string; value: string; bgColor: string }) {
  return (
    <div className={`flex-1 rounded-xl p-3 border ${bgColor} min-w-0`}>
      <p className="text-xs text-white/60 mb-1">{label}</p>
      <p className="text-lg font-semibold text-white/90">{value}</p>
    </div>
  );
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

  return (
    <div className="glass-card p-4 mb-4">
      <h2 className="text-lg font-bold text-white/90 mb-3">🧠 DeepSeek</h2>
      <div className="flex gap-3">
        <MiniCard
          label="总余额"
          value={formatYuan(totalBalance)}
          bgColor={getBalanceBgColor(totalBalance)}
        />
        <MiniCard
          label="今日用量"
          value={formatYuan(data.todayCost)}
          bgColor={getTodayCostBgColor(data.todayCost)}
        />
        <MiniCard
          label="本周用量"
          value={formatYuan(data.weekCost)}
          bgColor={getWeekCostBgColor(data.weekCost)}
        />
      </div>
    </div>
  );
}
