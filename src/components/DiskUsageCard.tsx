import type { DiskUsageData } from '../types';

interface DiskUsageCardProps {
  data: DiskUsageData | null;
  error?: string | null;
}

function formatBytes(bytes: number): string {
  // 使用十进制单位 (1 GB = 1000^3)，与 macOS 访达 / 关于本机的显示一致
  const gb = bytes / 1000 ** 3;
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`;
  return `${gb.toFixed(1)} GB`;
}

function getUsageColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-400';
  if (percentage >= 75) return 'bg-yellow-400';
  return 'bg-blue-400';
}

export function DiskUsageCard({ data, error }: DiskUsageCardProps) {
  if (!data) {
    return (
      <div className="glass-card p-4 mb-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">💾 磁盘使用量</h2>
        <p className="text-white/50 text-sm">
          {error ? `数据获取失败: ${error}` : '加载中...'}
        </p>
      </div>
    );
  }

  const percentage = Math.max(0, Math.min(100, data.percentage));

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-bold text-white/90">💾 磁盘使用量</h2>
        <span className="text-xs text-white/50">{data.mountPoint}</span>
      </div>

      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-white/80">
          {formatBytes(data.usedBytes)} / {formatBytes(data.totalBytes)}
        </span>
        <span className="text-sm text-white/60">{percentage.toFixed(1)}%</span>
      </div>
      <div className="glass-progress-bg w-full h-2 mb-1">
        <div
          className={`${getUsageColor(percentage)} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-white/50">可用 {formatBytes(data.availableBytes)}</p>
    </div>
  );
}
