import { useEffect, useRef, useState } from 'react';
import type { BalanceDay } from '../types';

interface SparklineProps {
  history: BalanceDay[];
  height?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 矮柱的白色透明度（最亮） */
const BAR_ALPHA_MAX = 0.3;
/** 最高柱的白色透明度（最暗），保证叠在上面的文字可读 */
const BAR_ALPHA_MIN = 0.1;

function dayIndex(day: string, firstDay: string): number {
  return Math.round((Date.parse(day) - Date.parse(firstDay)) / DAY_MS);
}

/** 卡片底图：每日花费柱状图，柱越高颜色越暗；充值日在柱顶画绿色圆点。历史少于 2 行时不渲染。 */
export function Sparkline({ history, height = 40 }: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // 用实际像素宽度绘制，避免 preserveAspectRatio="none" 拉伸圆点
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (history.length < 2) return null;

  const firstDay = history[0].day;
  const span = Math.max(1, dayIndex(history[history.length - 1].day, firstDay));
  const slot = width / (span + 1); // 每天占的横向宽度
  const barW = Math.max(1, Math.min(6, slot * 0.6));
  const spends = history.map(h => Math.max(h.spend ?? 0, 0));
  const maxSpend = Math.max(...spends, 0.01);
  const padTop = 4;
  const plotH = height - padTop;

  const bars = history.map((h, i) => {
    const ratio = spends[i] / maxSpend;
    const barH = ratio * plotH;
    return {
      day: h.day,
      x: slot / 2 + (dayIndex(h.day, firstDay) / (span + 1)) * width,
      barH,
      top: height - barH,
      alpha: BAR_ALPHA_MAX - (BAR_ALPHA_MAX - BAR_ALPHA_MIN) * ratio,
      recharge: h.recharge > 0,
    };
  });

  return (
    <div ref={ref} className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {bars.filter(b => b.barH > 0).map(b => (
            <rect
              key={`bar-${b.day}`}
              x={b.x - barW / 2}
              y={b.top}
              width={barW}
              height={b.barH}
              rx={1}
              fill={`rgba(255,255,255,${b.alpha.toFixed(3)})`}
            />
          ))}
          {bars.filter(b => b.recharge).map(b => (
            <circle key={`re-${b.day}`} cx={b.x} cy={Math.min(b.top, height - 3)} r={2.5} fill="#34d399" />
          ))}
        </svg>
      )}
    </div>
  );
}
