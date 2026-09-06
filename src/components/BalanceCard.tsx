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

/**
 * 余额阈值决定整张卡的底色与边框色。
 * .glass-card 的 background/border 简写声明在编译后 CSS 中排在 Tailwind 工具类之后、
 * 特异性相同，会覆盖预警色，因此这里用 `!` important 变体强制生效；
 * 正常态无需覆盖，直接沿用 .glass-card 自身的底色与边框，返回空字符串即可。
 */
function getCardTone(amount: number): string {
  if (amount < 2) return '!bg-red-500/20 !border-red-500/30';
  if (amount < 5) return '!bg-yellow-500/20 !border-yellow-500/30';
  return '';
}

/** 本地日期 YYYY-MM-DD，与 Rust 端 chrono::Local 生成的 day 格式一致 */
function localDay(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 今日花费：今天那一行的 spend；无记录或尚无前一日基准时为 null */
function getTodaySpend(history: BalanceDay[]): number | null {
  const today = localDay();
  const row = history.find(h => h.day === today);
  if (!row || row.spend === null) return null;
  return Math.max(row.spend, 0); // 充值按 10 元向上取整可能使 spend 为负，展示时归零
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
  const todaySpend = getTodaySpend(history);

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
        <div className="text-lg font-bold text-white/90">{title}</div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-lg font-semibold text-white/90">¥{amount.toFixed(2)}</span>
          {note && <span className="text-xs text-red-300">{note}</span>}
          <span className="ml-auto text-[11px] text-white/55 whitespace-nowrap">
            今日 {todaySpend === null ? '—' : `¥${todaySpend.toFixed(2)}`}
          </span>
        </div>
      </div>
    </button>
  );
}
