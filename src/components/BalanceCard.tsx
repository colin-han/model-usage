import type { BalanceDay, BalanceProvider } from '../types';
import { Sparkline } from './Sparkline';

interface BalanceCardProps {
  title: string;
  provider: BalanceProvider;
  /** 余额；null 表示数据尚未获取 */
  amount: number | null;
  /** 金额右侧的小红字提示（如欠费） */
  note?: string | null;
  /** 无数据时的空态文案（如"未配置 API Key"） */
  emptyText: string;
  error?: string | null;
  loading?: boolean;
  history: BalanceDay[];
  onOpen: (provider: BalanceProvider) => void;
}

/** 余额阈值决定整张卡的底色与边框色 */
function getCardTone(amount: number): string {
  if (amount < 2) return 'bg-red-500/20 border-red-500/30';
  if (amount < 5) return 'bg-yellow-500/20 border-yellow-500/30';
  return '';
}

export function BalanceCard({
  title,
  provider,
  amount,
  note,
  emptyText,
  error,
  loading,
  history,
  onOpen,
}: BalanceCardProps) {
  if (amount === null) {
    return (
      <div className="glass-card p-4">
        <h2 className="text-lg font-bold text-white/90 mb-2">{title}</h2>
        <p className={`text-white/50 text-sm ${loading ? 'animate-pulse' : ''}`}>
          {loading ? '加载中...' : error ? `数据获取失败: ${error}` : emptyText}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(provider)}
      className={`glass-card relative overflow-hidden text-left w-full cursor-pointer transition-colors hover:bg-white/15 ${getCardTone(amount)}`}
      style={{ minHeight: 88 }}
    >
      <Sparkline history={history} />
      <div className="relative p-4">
        <h2 className="text-lg font-bold text-white/90">{title}</h2>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-lg font-semibold text-white/90">¥{amount.toFixed(2)}</span>
          {note && <span className="text-xs text-red-300">{note}</span>}
        </div>
      </div>
    </button>
  );
}
