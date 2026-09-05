import { useState, type MouseEvent } from 'react';
import type { BalanceDay, BalanceProvider } from '../types';

interface BalanceHistoryModalProps {
  provider: BalanceProvider | null;
  history: BalanceDay[];
  onClose: () => void;
}

const PROVIDER_TITLES: Record<BalanceProvider, string> = {
  deepseek: '🧠 DeepSeek',
  volcengine: '🌋 火山引擎',
  aliyun: '☁️ 阿里云',
};

// 图表尺寸与内边距
const WIDTH = 460;
const HEIGHT = 220;
const PAD = { top: 24, right: 44, bottom: 24, left: 44 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(day: string, firstDay: string): number {
  return Math.round((Date.parse(day) - Date.parse(firstDay)) / DAY_MS);
}

/** 09-02 形式的短日期 */
function shortDay(day: string): string {
  return day.slice(5);
}

/** 两个日期是否相邻（相差一天） */
function isAdjacent(a: string, b: string): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) === DAY_MS;
}

function fmt(n: number): string {
  return `¥${n.toFixed(2)}`;
}

interface ChartProps {
  history: BalanceDay[];
}

function BalanceChart({ history }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const firstDay = history[0].day;
  const span = Math.max(1, dayIndex(history[history.length - 1].day, firstDay));
  const slot = PLOT_W / (span + 1); // 每天占的横向宽度
  const xOf = (day: string) => PAD.left + slot / 2 + (dayIndex(day, firstDay) / (span + 1)) * PLOT_W;

  const maxBalance = Math.max(...history.map(h => h.balance), 0.01);
  const maxSpend = Math.max(...history.map(h => Math.max(h.spend ?? 0, 0)), 0.01);
  const yBalance = (v: number) => PAD.top + (1 - v / maxBalance) * PLOT_H;
  const ySpend = (v: number) => PAD.top + (1 - v / maxSpend) * PLOT_H;

  const points = history.map(h => ({ ...h, x: xOf(h.day) }));
  const linePath = points.map(p => `${p.x.toFixed(1)},${yBalance(p.balance).toFixed(1)}`).join(' ');
  const barW = Math.max(2, Math.min(14, slot * 0.6));
  const gridFractions = [0.25, 0.5, 0.75];

  // 悬停：找离鼠标最近的点
  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].x - mx) < Math.abs(points[best].x - mx)) best = i;
    }
    setHover(best);
  };

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full block"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* 网格与两侧刻度 */}
        {gridFractions.map(f => {
          const y = PAD.top + (1 - f) * PLOT_H;
          return (
            <g key={f}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text x={PAD.left - 6} y={y + 3} fontSize={9} textAnchor="end" fill="rgba(255,255,255,0.5)">
                {(maxBalance * f).toFixed(0)}
              </text>
              <text x={WIDTH - PAD.right + 6} y={y + 3} fontSize={9} fill="rgba(255,255,255,0.5)">
                {(maxSpend * f).toFixed(1)}
              </text>
            </g>
          );
        })}
        <text x={PAD.left - 6} y={PAD.top - 10} fontSize={9} textAnchor="end" fill="rgba(255,255,255,0.4)">余额</text>
        <text x={WIDTH - PAD.right + 6} y={PAD.top - 10} fontSize={9} fill="rgba(255,255,255,0.4)">花费</text>

        {/* 每日花费柱 */}
        {points.map(p => {
          const spend = Math.max(p.spend ?? 0, 0);
          const top = ySpend(spend);
          return (
            <rect
              key={`bar-${p.day}`}
              x={p.x - barW / 2}
              y={top}
              width={barW}
              height={PAD.top + PLOT_H - top}
              fill={hover !== null && points[hover].day === p.day ? 'rgba(96,165,250,0.7)' : 'rgba(96,165,250,0.4)'}
            />
          );
        })}

        {/* 余额折线 */}
        <polyline points={linePath} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} strokeLinejoin="round" />
        {points.map(p => (
          <circle key={`dot-${p.day}`} cx={p.x} cy={yBalance(p.balance)} r={2} fill="rgba(255,255,255,0.85)" />
        ))}

        {/* 充值标记 */}
        {points.filter(p => p.recharge > 0).map(p => {
          const y = ySpend(Math.max(p.spend ?? 0, 0)) - 8;
          return (
            <g key={`re-${p.day}`}>
              <polygon points={`${p.x},${y} ${p.x - 4},${y + 6} ${p.x + 4},${y + 6}`} fill="#34d399" />
              <text x={p.x} y={y - 3} fontSize={9} textAnchor="middle" fill="#34d399">
                +¥{p.recharge.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* x 轴：每 5 天标一个日期 */}
        {points.filter((_, i) => i % 5 === 0 || i === points.length - 1).map(p => (
          <text key={`x-${p.day}`} x={p.x} y={HEIGHT - 8} fontSize={9} textAnchor="middle" fill="rgba(255,255,255,0.5)">
            {shortDay(p.day)}
          </text>
        ))}

        {/* 悬停竖线 */}
        {active && (
          <line x1={active.x} x2={active.x} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
        )}
      </svg>

      {active && (
        <div
          className="absolute top-2 text-xs bg-black/70 border border-white/15 rounded-lg px-3 py-2 pointer-events-none space-y-0.5"
          style={{ left: `${(active.x / WIDTH) * 100}%`, transform: active.x > WIDTH / 2 ? 'translateX(-110%)' : 'translateX(10%)' }}
        >
          <div className="text-white/90 font-medium">{active.day}</div>
          <div className="text-white/70">余额 {fmt(active.balance)}</div>
          <div className="text-white/70">
            花费 {active.spend === null ? '—' : fmt(active.spend)}
            {active.sinceDay && !isAdjacent(active.sinceDay, active.day) && (
              <span className="text-white/40">（自 {shortDay(active.sinceDay)} 以来）</span>
            )}
          </div>
          {active.recharge > 0 && <div className="text-emerald-300">充值 {fmt(active.recharge)}</div>}
        </div>
      )}
    </div>
  );
}

export function BalanceHistoryModal({ provider, history, onClose }: BalanceHistoryModalProps) {
  if (!provider) return null;

  const spends = history.map(h => h.spend).filter((s): s is number => s !== null);
  const totalSpend = spends.reduce((a, b) => a + b, 0);
  const totalRecharge = history.reduce((a, h) => a + h.recharge, 0);
  const avgSpend = spends.length > 0 ? totalSpend / spends.length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card p-5 w-[480px] max-w-[95vw] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white/90">{PROVIDER_TITLES[provider]} · 最近 30 天</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white/90 text-xl leading-none px-1"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {history.length === 0 ? (
          <p className="text-white/50 text-sm py-10 text-center">暂无历史数据</p>
        ) : (
          <>
            <BalanceChart history={history} />
            <div className="grid grid-cols-3 gap-3 mt-3 text-center">
              <div className="rounded-lg bg-white/5 border border-white/10 py-2">
                <div className="text-[11px] text-white/50">30 天总花费</div>
                <div className="text-sm font-semibold text-white/90">{fmt(totalSpend)}</div>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 py-2">
                <div className="text-[11px] text-white/50">总充值</div>
                <div className="text-sm font-semibold text-emerald-300">{fmt(totalRecharge)}</div>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 py-2">
                <div className="text-[11px] text-white/50">日均花费</div>
                <div className="text-sm font-semibold text-white/90">{fmt(avgSpend)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
