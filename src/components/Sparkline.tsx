import { useEffect, useRef, useState } from 'react';
import type { BalanceDay } from '../types';

interface SparklineProps {
  history: BalanceDay[];
  height?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(day: string, firstDay: string): number {
  return Math.round((Date.parse(day) - Date.parse(firstDay)) / DAY_MS);
}

/** 卡片底图：无坐标轴折线 + 淡色填充，充值日画绿色圆点。历史少于 2 点时不渲染。 */
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
  const balances = history.map(h => h.balance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;
  const padY = 4;

  const points = history.map(h => ({
    x: (dayIndex(h.day, firstDay) / span) * width,
    y: padY + (1 - (h.balance - min) / range) * (height - padY * 2),
    recharge: h.recharge > 0,
  }));
  const line = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <div ref={ref} className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          <polygon points={area} fill="rgba(255,255,255,0.10)" />
          <polyline
            points={line}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {points.filter(p => p.recharge).map(p => (
            <circle key={p.x} cx={p.x} cy={p.y} r={2.5} fill="#34d399" />
          ))}
        </svg>
      )}
    </div>
  );
}
