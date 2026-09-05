import type { BalanceDay, BalanceProvider, VolcengineBalanceData } from '../types';
import { BalanceCard } from './BalanceCard';

interface VolcengineCardProps {
  data: VolcengineBalanceData | null;
  error?: string | null;
  loading?: boolean;
  history: BalanceDay[];
  onOpen: (provider: BalanceProvider) => void;
}

export function VolcengineCard({ data, error, loading, history, onOpen }: VolcengineCardProps) {
  return (
    <BalanceCard
      title="🌋 火山引擎"
      provider="volcengine"
      amount={data ? data.availableBalance : null}
      note={data && data.arrearsBalance > 0 ? `欠费 ¥${data.arrearsBalance.toFixed(2)}` : null}
      emptyText="未配置 AK/SK"
      error={error}
      loading={loading}
      history={history}
      onOpen={onOpen}
    />
  );
}
