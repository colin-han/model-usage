import type { AliyunBalanceData } from '../types';

interface AliyunCardProps {
  data: AliyunBalanceData | null;
  error?: string | null;
  loading?: boolean;
}

function getBalanceBgColor(availableAmount: number): string {
  if (availableAmount < 2) return 'bg-red-500/20 border-red-500/30';
  if (availableAmount < 5) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-white/5 border-white/10';
}

export function AliyunCard({ data, error, loading }: AliyunCardProps) {
  if (!data) {
    return (
      <div className="glass-card p-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">☁️ 阿里云</h2>
        <p className={`text-white/50 text-sm ${loading ? 'animate-pulse' : ''}`}>
          {loading ? '加载中...' : error ? `数据获取失败: ${error}` : '未配置 AK/SK'}
        </p>
      </div>
    );
  }

  const bgColor = getBalanceBgColor(data.availableAmount);

  return (
    <div className="glass-card p-4">
      <h2 className="text-lg font-bold text-white/90 mb-2">☁️ 阿里云</h2>
      <div className={`rounded-xl px-3 py-2 border ${bgColor}`}>
        <div className="text-xs text-white/60">可用余额</div>
        <div className="text-lg font-semibold text-white/90">
          ¥{data.availableAmount.toFixed(2)}
        </div>
      </div>
      {data.availableAmount < 0 && (
        <p className="mt-2 text-xs text-red-300">账户已欠费</p>
      )}
    </div>
  );
}
