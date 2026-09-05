import type { BalanceDay, BalanceProvider, DeepSeekUsageData } from '../types';
import { BalanceCard } from './BalanceCard';

interface DeepSeekCardProps {
  data: DeepSeekUsageData | null;
  error?: string | null;
  loading?: boolean;
  history: BalanceDay[];
  onOpen: (provider: BalanceProvider) => void;
}

export function DeepSeekCard({ data, error, loading, history, onOpen }: DeepSeekCardProps) {
  const amount = data?.balance
    ? parseFloat(data.balance.balance_infos[0]?.total_balance || '0')
    : null;

  return (
    <BalanceCard
      title="🧠 DeepSeek"
      provider="deepseek"
      amount={amount}
      emptyText="未配置 API Key"
      error={error}
      loading={loading}
      history={history}
      onOpen={onOpen}
    />
  );
}
